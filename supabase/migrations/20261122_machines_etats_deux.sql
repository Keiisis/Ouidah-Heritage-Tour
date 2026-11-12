-- Machines à états, vague 2 (contenus, équipe, files SQL), 11/11/2026, et décisions de Kevin du 11/11. Idempotente :
-- « create or replace », « drop trigger if exists », contrainte posée « not valid » puis validée seulement si absente.
-- Une seule écriture de données, voulue par Kevin le 11/11 et faite UNE fois (première application, repérée par l'absence
-- du déclencheur etats_transitions sur wiki_pages, posé plus bas) : la purge automatique est activée.

-- ---------- 1. purge automatique activée (Kevin, 11/11) ----------
-- Une valeur coupée ensuite par l'équipe n'est jamais remise : le bloc ne joue qu'à la première application.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'etats_transitions' and tgrelid = 'public.wiki_pages'::regclass) then
    update public.reglages_transversaux set purge_actif = true where id and not purge_actif;
  end if;
end $$;

-- ---------- 2. rapport hebdomadaire du samedi (Kevin, 11/11) ----------
-- La semaine d'un rapport commence désormais le samedi (période : samedi 00:00 → vendredi 23:59, heure de Ouidah). Seule
-- la garde du jour change (isodow 6 au lieu de 1) ; l'historique rapports_envois déjà enregistré ne change pas.
create or replace function public.rapport_reserver(p_semaine date,p_destinataire text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid;
begin
  if extract(isodow from p_semaine) <> 6 or not exists(select 1 from equipe_profils where role='admin' and etat='actif' and lower(email)=lower(p_destinataire)) then return null; end if;
  insert into rapports_envois(semaine,destinataire) values(p_semaine,lower(p_destinataire)) on conflict do nothing returning id into v;
  return v;
end $$;
revoke all on function public.rapport_reserver(date,text) from public,anon,authenticated;
grant execute on function public.rapport_reserver(date,text) to service_role;

-- ---------- 3. machines à états, vague 2 ----------
-- Même fonction que la vague 1 (etats_transitions, 20261120) ; chaque table « de → vers » recopie EXACTEMENT sa constante
-- TypeScript (test machines-etats-2-coherence) :
--   candidatures_partenaires.statut  TRANSITIONS_CANDIDATURE  src/lib/serveur/services/regles.ts
--   blog_articles.etat               TRANSITIONS_BLOG         src/lib/serveur/blog/regles.ts
--   wiki_pages.etat                  TRANSITIONS_WIKI         src/lib/serveur/equipe/pilotage/regles.ts
--   assistant_sources.etat           TRANSITIONS_SOURCE       src/lib/serveur/assistant/regles.ts
--   equipe_profils.etat              TRANSITIONS_COMPTE       src/lib/serveur/equipe/partage.ts
--   finances_relances.etat           TRANSITIONS_RELANCE      src/lib/serveur/equipe/finances/regles.ts
--   rapports_envois.etat             TRANSITIONS_RAPPORT      src/lib/serveur/equipe/pilotage/regles.ts
-- Sans déclencheur, par choix : blog_versions.etat et contenu_versions.etat (historique, insertion seule) ; contenu_site
-- (aucune colonne d'état : brouillon et valeur publiée, écrits par contenu_ecrire sous la version lue) ;
-- traduction_auto_file.etat (file réécrite par 5 fonctions, presque tout état y mène à « attente » ; un refus bloquerait
-- la file des traductions pour un gain nul) ; demandes.etape (étiquette commerciale que l'agent corrige librement ; les
-- deux étapes posées par le serveur gardent leur filtre etape=in.(…)) ; boutique_commandes.paiement_etat (dérivé, un seul
-- écrivain : boutique_recalculer_commande).
drop trigger if exists etats_transitions on public.candidatures_partenaires;
create trigger etats_transitions before update of statut on public.candidatures_partenaires for each row
  execute function public.etats_transitions('statut', '{"nouvelle":["en_etude","acceptee","refusee"],"en_etude":["acceptee","refusee"],"acceptee":["en_etude"],"refusee":["en_etude"]}');

drop trigger if exists etats_transitions on public.blog_articles;
create trigger etats_transitions before update of etat on public.blog_articles for each row
  execute function public.etats_transitions('etat', '{"brouillon":["relecture","publie"],"relecture":["brouillon","publie"],"publie":["retire"],"retire":["brouillon","publie"]}');

drop trigger if exists etats_transitions on public.assistant_sources;
create trigger etats_transitions before update of etat on public.assistant_sources for each row
  execute function public.etats_transitions('etat', '{"brouillon":["publie"],"publie":["retire"],"retire":["publie"]}');

drop trigger if exists etats_transitions on public.equipe_profils;
create trigger etats_transitions before update of etat on public.equipe_profils for each row
  execute function public.etats_transitions('etat', '{"invite":["actif","suspendu","supprime"],"actif":["suspendu"],"suspendu":["actif","invite","supprime"],"supprime":[]}');

drop trigger if exists etats_transitions on public.finances_relances;
create trigger etats_transitions before update of etat on public.finances_relances for each row
  execute function public.etats_transitions('etat', '{"reservee":["envoyee","ignoree","incertaine"],"envoyee":[],"ignoree":[],"incertaine":[]}');

drop trigger if exists etats_transitions on public.rapports_envois;
create trigger etats_transitions before update of etat on public.rapports_envois for each row
  execute function public.etats_transitions('etat', '{"reservee":["envoyee","incertaine"],"envoyee":[],"incertaine":[]}');

-- Posé en dernier : sa présence marque la première application (bloc 1, purge).
drop trigger if exists etats_transitions on public.wiki_pages;
create trigger etats_transitions before update of etat on public.wiki_pages for each row
  execute function public.etats_transitions('etat', '{"brouillon":["publie"],"propose":["publie","refuse"],"publie":["brouillon"],"refuse":["brouillon"]}');

-- ---------- 4. boutique_commandes.statut : contrainte CHECK (point 8 de la vague 1) ----------
-- Les 5 états de TRANSITIONS_COMMANDE. Posée « not valid » (les insertions et mises à jour sont contrôlées tout de suite),
-- puis validée : si une ligne existante sortait des 5 états, la validation échoue sans bloquer la migration et la
-- contrainte reste « not valid » (à signaler ; aucune ligne n'est modifiée ici).
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.boutique_commandes'::regclass and conname = 'boutique_commandes_statut_check') then
    alter table public.boutique_commandes add constraint boutique_commandes_statut_check
      check (statut in ('a_confirmer', 'a_preparer', 'prete', 'remise', 'annulee')) not valid;
  end if;
  begin
    alter table public.boutique_commandes validate constraint boutique_commandes_statut_check;
  exception when check_violation then
    raise notice 'boutique_commandes_statut_check reste « not valid » : une ligne existante sort des 5 états';
  end;
end $$;
