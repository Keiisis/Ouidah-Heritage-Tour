-- 11/11/2026 : e-mails automatiques ajoutés (rendez-vous, reçu d'un paiement en ligne, devis signé, conversation sans
-- agent en ligne, lien de paiement envoyé, avis à l'équipe), journal des envois, destinataires des avis tenus par l'admin,
-- relances par paliers. Idempotente : colonnes et table « if not exists », fonctions « create or replace ». Aucune ligne
-- supprimée. Les textes par défaut des e-mails restent dans le code (src/content/courriels*.ts), comme les 7 existants :
-- rien à insérer dans modeles_courriels.
-- Données modifiées UNE SEULE FOIS, à la première application (courriels_journal encore absente), décisions de Kevin du
-- 11/11 : paliers de relance 7/15/30 si jamais posés, rapport hebdomadaire actif, contact@ouidahheritagetour.bj comme
-- premier destinataire des avis si la liste est vide. Une valeur saisie par l'équipe n'est jamais remplacée.

-- ---------- 1. reçu d'un lien payé et avis à l'équipe : un seul envoi chacun ----------
-- Sur le modèle de devis.courriel_pret_pour : PATCH conditionnel « is null » avant l'envoi (le retour du client et le
-- webhook peuvent arriver ensemble), marque retirée si l'envoi échoue. Colonnes hors des colonnes figées par liens_figes.
alter table public.liens_paiement add column if not exists courriel_recu_le timestamptz;
alter table public.liens_paiement add column if not exists avis_recu_le timestamptz;

-- ---------- 2. destinataires des avis à l'équipe (écran E-mail d'envoi, admin seulement) ----------
-- 10 adresses au plus, en minuscules, sans doublon ; liste vide : EMAIL_OHT en secours (courriel.ts).
create or replace function public.adresses_avis_valides(l text[])
returns boolean language sql immutable set search_path = public as $$
  select l is not null and array_ndims(l) is distinct from 2 and cardinality(l) <= 10
    and not exists (select 1 from unnest(l) a where a is null or char_length(a) > 254 or a <> lower(a) or a !~ '^[^@[:space:],;<>"]+@[^@[:space:],;<>"]+\.[a-z]{2,63}$')
    and cardinality(l) = (select count(distinct a) from unnest(l) a);
$$;
alter table public.reglages_transversaux add column if not exists avis_equipe text[] not null default '{}' check (public.adresses_avis_valides(avis_equipe));

-- ---------- 3. relances par paliers (jours après l'émission de la facture) ----------
-- 1 à 5 paliers croissants de 1 à 90 jours ; NULL : relances coupées. relance_jours garde le premier palier (lu par
-- finances_relance_verifier, inchangée).
create or replace function public.paliers_relance_valides(p smallint[])
returns boolean language sql immutable set search_path = public as $$
  select p is null or (array_ndims(p) = 1 and cardinality(p) between 1 and 5
    and not exists (select 1 from unnest(p) with ordinality x(v, i) where v is null or v < 1 or v > 90 or (i > 1 and v <= p[array_lower(p, 1) + i::int - 2])));
$$;
alter table public.reglages_paiement add column if not exists relance_paliers smallint[] check (public.paliers_relance_valides(relance_paliers));

-- Palier k : la facture a au moins paliers[k] jours et k-1 relances ont été ENVOYÉES. Une relance réservée ou incertaine
-- bloque toujours ; une tentative (envoyée ou ignorée) espace la suivante d'au moins l'écart entre les deux paliers, comme
-- l'intervalle d'avant (une relance partie en retard ne rapproche pas la suivante). Après le dernier palier : plus rien.
create or replace function public.finances_relances_candidates(p_facture uuid default null)
returns table(facture_id uuid,numero text,client text,depuis timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id,f.numero,f.client->>'nom',coalesce(dernier.le,f.cree_le)
  from public.factures f
  cross join public.reglages_paiement r
  left join lateral (select max(coalesce(l.traite_le,l.cree_le)) le from public.finances_relances l where l.facture_id=f.id) dernier on true
  left join lateral (select count(*)::int n from public.finances_relances l where l.facture_id=f.id and l.etat='envoyee') envoyees on true
  where r.id=true and r.relance_jours between 1 and 90
    and r.relance_paliers is not null and envoyees.n < cardinality(r.relance_paliers)
    and (p_facture is null or f.id=p_facture)
    and f.statut in ('emise','a_regulariser')
    and coalesce(f.client->>'email','') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and f.cree_le + make_interval(days=>r.relance_paliers[envoyees.n+1]) <= now()
    and coalesce(dernier.le,f.cree_le) + make_interval(days=>r.relance_paliers[envoyees.n+1]-coalesce(r.relance_paliers[envoyees.n],0)) <= now()
    and not exists(select 1 from public.finances_relances l where l.facture_id=f.id and l.etat in ('reservee','incertaine'))
  order by coalesce(dernier.le,f.cree_le),f.id limit 50;
$$;
revoke all on function public.finances_relances_candidates(uuid) from public,anon,authenticated;
grant execute on function public.finances_relances_candidates(uuid) to service_role;
revoke all on function public.adresses_avis_valides(text[]), public.paliers_relance_valides(smallint[]) from public,anon,authenticated;

-- ---------- 4. réglages posés une seule fois (première application) ----------
do $$
begin
  if to_regclass('public.courriels_journal') is null then
    -- relances J+7, J+15, J+30 si l'équipe ne les a jamais posées ; un intervalle déjà saisi devient l'unique palier
    update public.reglages_paiement
      set relance_paliers = case when relance_jours is null then '{7,15,30}'::smallint[] else array[relance_jours]::smallint[] end,
          relance_jours = coalesce(relance_jours, 7)
      where id and relance_paliers is null;
    -- rapport hebdomadaire actif : aucune colonne ne distingue « jamais touché » de « coupé exprès » (signalé à Kevin)
    update public.reglages_transversaux set rapport_actif = true where id and not rapport_actif;
    -- premier destinataire des avis : l'adresse publique d'OHT, seulement si la liste est vide
    update public.reglages_transversaux set avis_equipe = array['contact@ouidahheritagetour.bj'] where id and cardinality(avis_equipe) = 0;
  end if;
end $$;

-- ---------- 5. journal des envois ----------
-- Chaque tentative d'envoi (courriel.ts) : modèle (auto-…, avis-…), destinataire MASQUÉ (« n***@e***.com », imposé ici),
-- réussite ou motif court de l'échec (code SMTP), jamais le contenu. Effacé après CONSERVATION_JOURS par la purge.
create table if not exists public.courriels_journal (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modele text not null check (modele ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  destinataire text not null check (char_length(destinataire) <= 80 and destinataire ~ '^[^@*]?\*\*\*@'),
  reussi boolean not null,
  motif text check (motif is null or motif ~ '^[a-z0-9_]{1,40}$'),
  check (reussi or motif is not null)
);
create index if not exists courriels_journal_date on public.courriels_journal (cree_le desc);
alter table public.courriels_journal enable row level security;
revoke all on public.courriels_journal from public, anon, authenticated;
grant select, insert, delete on public.courriels_journal to service_role;
