-- Boutique : paiement immédiat à la commande (décision de Kevin du 09/11/2026). Migration additive : aucune donnée effacée.
-- Quand une passerelle est active, la commande est payée tout de suite, sans confirmation de l'équipe :
--   * le serveur relit prix, stock et frais de livraison en base, crée la commande « à préparer » et RÉSERVE le stock dans
--     la même transaction (boutique_commander), avec une échéance de paiement (paiement_expire_le, 30 min par défaut) ;
--   * paiement réussi (lien payé, déclencheur liens_commande_regle) : la commande est réglée, la réservation devient
--     définitive ; le stock physique ne sort qu'à la remise (modèle du 06/11 inchangé : « sortie physique à la remise ») ;
--   * pas de paiement à l'échéance : boutique_expirer_commandes annule la commande et rend le stock (appelée avant chaque
--     commande, par la purge planifiée et à la lecture d'un suivi expiré) ; un paiement arrivé après coup (session ouverte
--     avant l'échéance) remet la commande en réservation si le stock le permet, sinon l'argent reçu reste « à régulariser ».
-- Livraison : grille de frais par zone saisie dans l'admin (boutique_livraison_zones). Zones créées SANS prix : tant
-- qu'une zone n'a pas de frais, la livraison vers elle n'est pas payable en ligne. Le retrait à Ouidah est gratuit.
-- Total payé = articles + frais, en XOF entier, toujours recalculé par la base.

alter table public.boutique_produits add column if not exists delai_fabrication_jours integer
  check (delai_fabrication_jours is null or delai_fabrication_jours between 1 and 365);

alter table public.boutique_commandes add column if not exists frais_livraison_xof integer check (frais_livraison_xof is null or frais_livraison_xof >= 0);
alter table public.boutique_commandes add column if not exists livraison_zone text;
alter table public.boutique_commandes add column if not exists paiement_expire_le timestamptz;
alter table public.boutique_commandes add column if not exists expiree boolean not null default false;
create index if not exists boutique_commandes_echeance on public.boutique_commandes (paiement_expire_le)
  where statut = 'a_preparer' and paiement_etat = 'attente' and paiement_expire_le is not null;

-- ---------- grille de livraison ----------
-- Une zone couvre une ville d'un pays (Ouidah), une liste de pays ISO 3166-1, ou le reste du monde. La plus précise
-- l'emporte : ville, puis pays, puis reste du monde. Une zone inactive ou sans frais n'est pas payable en ligne.
create table if not exists public.boutique_livraison_zones (
  code text primary key check (code ~ '^[a-z0-9-]{1,40}$'),
  libelle text not null check (char_length(btrim(libelle)) between 1 and 80),
  pays text[] not null default '{}' check (cardinality(pays) <= 260 and array_to_string(pays, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  ville text check (ville is null or char_length(btrim(ville)) between 1 and 80),
  reste_du_monde boolean not null default false,
  frais_xof integer check (frais_xof is null or frais_xof between 0 and 100000000),
  delai_jours integer check (delai_jours is null or delai_jours between 1 and 365),
  actif boolean not null default true,
  ordre integer not null default 0,
  modifie_le timestamptz not null default now(),
  check (not reste_du_monde or (cardinality(pays) = 0 and ville is null)),
  check (ville is null or cardinality(pays) = 1)
);
alter table public.boutique_livraison_zones enable row level security;
revoke all on public.boutique_livraison_zones from public, anon, authenticated;
grant select, insert, update on public.boutique_livraison_zones to service_role;

-- Zones de départ, sans aucun tarif (rien d'inventé) : l'admin saisit les frais. Listes de pays modifiables dans l'admin.
insert into public.boutique_livraison_zones (code, libelle, pays, ville, reste_du_monde, ordre) values
  ('ouidah', 'Ouidah', '{BJ}', 'Ouidah', false, 1),
  ('benin', 'Bénin', '{BJ}', null, false, 2),
  ('afrique-ouest', 'Afrique de l''Ouest', '{BF,CI,CV,GH,GM,GN,GW,LR,ML,MR,NE,NG,SL,SN,TG}', null, false, 3),
  ('europe', 'Europe', '{AD,AL,AT,AX,BA,BE,BG,BY,CH,CY,CZ,DE,DK,EE,ES,FI,FO,FR,GB,GG,GI,GR,HR,HU,IE,IM,IS,IT,JE,LI,LT,LU,LV,MC,MD,ME,MK,MT,NL,NO,PL,PT,RO,RS,SE,SI,SJ,SK,SM,UA,VA,XK}', null, false, 4),
  ('monde', 'Reste du monde', '{}', null, true, 5)
on conflict (code) do nothing;

-- Zone de livraison d'une adresse (pays ISO, ville saisie) : jsonb de la zone, ou null si aucune ne la couvre.
create or replace function public.boutique_zone_livraison(p_pays text, p_ville text)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(z) from public.boutique_livraison_zones z
  where z.reste_du_monde
     or (upper(btrim(coalesce(p_pays, ''))) = any (z.pays)
         and (z.ville is null or lower(btrim(z.ville)) = lower(btrim(coalesce(p_ville, '')))))
  order by (z.ville is not null) desc, z.reste_du_monde, z.ordre, z.code
  limit 1;
$$;
revoke all on function public.boutique_zone_livraison(text, text) from public, anon, authenticated;
grant execute on function public.boutique_zone_livraison(text, text) to service_role;

-- ---------- stock ----------
-- Premier article d'un panier qui ne peut pas être réservé (slug ; '' si l'article n'existe plus), ou null. Verrouille
-- les articles du panier dans un ordre stable (par id) : deux commandes concurrentes du dernier exemplaire s'attendent,
-- la seconde relit le stock déjà réservé et échoue. Même règle que la confirmation par l'équipe (20261106).
create or replace function public.boutique_stock_manquant(p_lignes jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare p public.boutique_produits; q integer; v_slug text;
begin
  select x->>'slug' into v_slug from jsonb_array_elements(p_lignes) x
    where not exists (select 1 from public.boutique_produits where slug = x->>'slug') limit 1;
  if found then return coalesce(v_slug, ''); end if;
  for p in select pr.* from public.boutique_produits pr where pr.slug in (select x->>'slug' from jsonb_array_elements(p_lignes) x) order by pr.id for update loop
    select sum((x->>'quantite')::integer) into q from jsonb_array_elements(p_lignes) x where x->>'slug' = p.slug;
    if not p.publie or q < 1 or (p.piece_unique and q > 1)
       or (coalesce(p.stock, case when p.piece_unique then 1 end) is not null and coalesce(p.stock, 1) - p.stock_reserve < q) then
      return p.slug;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.boutique_stock_manquant(jsonb) from public, anon, authenticated;

-- Réserve le panier d'une commande (après boutique_stock_manquant, verrous déjà pris). Stock non suivi : réservé quand
-- même, comme à la confirmation équipe, pour qu'une limite ajoutée ensuite couvre ces quantités.
create or replace function public.boutique_reserver_stock(p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.boutique_commandes; p public.boutique_produits; q integer;
begin
  select * into c from public.boutique_commandes where id = p_commande;
  for p in select pr.* from public.boutique_produits pr where pr.slug in (select x->>'slug' from jsonb_array_elements(c.lignes) x) order by pr.id for update loop
    select sum((x->>'quantite')::integer) into q from jsonb_array_elements(c.lignes) x where x->>'slug' = p.slug;
    update public.boutique_produits set stock = case when piece_unique then coalesce(stock, 1) else stock end,
      stock_reserve = stock_reserve + q where id = p.id;
    insert into public.boutique_reservations_stock (commande_id, produit_id, quantite) values (c.id, p.id, q)
      on conflict (commande_id, produit_id) do update set quantite = excluded.quantite, primaire = true;
  end loop;
  update public.boutique_commandes set stock_confirme = true where id = c.id;
end;
$$;
revoke all on function public.boutique_reserver_stock(uuid) from public, anon, authenticated;

-- Commandes à paiement immédiat dont l'échéance est passée sans paiement : annulées, stock rendu, lien ouvert annulé.
-- Ordre des verrous : commande, puis liens SANS attente (skip locked : un lien verrouillé est en cours de paiement, son
-- déclencheur traitera la commande), puis articles. Le paiement (lien → commande) ne peut donc pas s'interbloquer avec elle.
create or replace function public.boutique_expirer_commandes()
returns integer language plpgsql security definer set search_path = public as $$
declare k uuid; c public.boutique_commandes; l record; n integer := 0;
begin
  for k in select id from public.boutique_commandes
    where statut = 'a_preparer' and paiement_etat = 'attente' and montant_recu = 0 and paiement_expire_le <= now() order by id loop
    select * into c from public.boutique_commandes where id = k for update skip locked;
    if not found or c.statut <> 'a_preparer' or c.paiement_etat <> 'attente' or c.montant_recu <> 0 or c.paiement_expire_le > now()
       or exists (select 1 from public.liens_paiement where commande_id = k and paye_le is not null) then
      continue;
    end if;
    update public.liens_paiement set annule_le = now(), modifie_le = now()
      where id in (select id from public.liens_paiement where commande_id = k and paye_le is null and annule_le is null for update skip locked);
    perform 1 from public.boutique_produits where id in (select produit_id from public.boutique_reservations_stock where commande_id = k and primaire) order by id for update;
    for l in select * from public.boutique_reservations_stock where commande_id = k and primaire order by produit_id loop
      update public.boutique_produits set stock_reserve = stock_reserve - l.quantite where id = l.produit_id;
    end loop;
    update public.boutique_reservations_stock set primaire = false where commande_id = k;
    update public.boutique_commandes set statut = 'annulee', annule_le = now(), expiree = true,
      motif_annulation = 'Paiement en ligne non reçu dans le délai : stock rendu automatiquement.' where id = k;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.boutique_expirer_commandes() from public, anon, authenticated;
grant execute on function public.boutique_expirer_commandes() to service_role;

-- ---------- commande ----------
-- Commande à paiement immédiat. Rien du navigateur ne fixe un montant : noms, prix et délais de fabrication sont relus
-- ici sous verrou, les frais viennent de la zone de livraison, total = articles + frais (XOF entier). La commande naît
-- « à préparer », stock réservé, avec son échéance de paiement. L'ancien parcours (aucune passerelle active) reste
-- l'insertion « à confirmer » de la route, sans réservation.
-- Retour : {ok,id,total_xof,frais_livraison_xof} ou {erreur: champs|stock|prix|zone|montant, slug?}.
create or replace function public.boutique_commander(p jsonb, p_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb; pr public.boutique_produits; q numeric; v_lignes jsonb := '[]'::jsonb; somme bigint := 0;
  z jsonb; frais integer := 0; v_id uuid; v_manque text;
begin
  if jsonb_typeof(p->'lignes') is distinct from 'array' or jsonb_array_length(p->'lignes') not between 1 and 30
     or p_minutes is null or p_minutes not between 5 and 120 then
    return jsonb_build_object('erreur', 'champs');
  end if;
  perform public.boutique_expirer_commandes(); -- stock des paniers abandonnés rendu avant de relire le stock
  -- verrous des articles d'abord (ordre stable) : prix et stock lus ensuite ne changent plus jusqu'à la fin
  perform 1 from public.boutique_produits where slug in (select x->>'slug' from jsonb_array_elements(p->'lignes') x) order by id for update;
  for l in select x from jsonb_array_elements(p->'lignes') x loop
    select * into pr from public.boutique_produits where slug = l->>'slug' and publie;
    if not found then return jsonb_build_object('erreur', 'stock', 'slug', coalesce(l->>'slug', '')); end if;
    if pr.prix_xof is null then return jsonb_build_object('erreur', 'prix', 'slug', pr.slug); end if;
    if jsonb_typeof(l->'quantite') is distinct from 'number' then return jsonb_build_object('erreur', 'champs'); end if;
    q := (l->>'quantite')::numeric;
    if q < 1 or q > 10 or q <> trunc(q) then return jsonb_build_object('erreur', 'champs'); end if;
    somme := somme + pr.prix_xof::bigint * q::bigint;
    v_lignes := v_lignes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('slug', pr.slug, 'nom', pr.nom, 'prix_xof', pr.prix_xof,
      'quantite', q::integer, 'options', coalesce(l->'options', '{}'::jsonb), 'delai_fabrication_jours', pr.delai_fabrication_jours)));
  end loop;
  if p->'remise'->>'mode' = 'livraison' then
    z := public.boutique_zone_livraison(p->'remise'->>'pays', p->'remise'->>'ville');
    if z is null or not (z->>'actif')::boolean or z->>'frais_xof' is null then return jsonb_build_object('erreur', 'zone'); end if;
    frais := (z->>'frais_xof')::integer;
  end if;
  if somme + frais > 2147483647 then return jsonb_build_object('erreur', 'montant'); end if;
  v_manque := public.boutique_stock_manquant(v_lignes);
  if v_manque is not null then return jsonb_build_object('erreur', 'stock', 'slug', v_manque); end if;
  insert into public.boutique_commandes (reference, statut, lignes, contact, remise, message, devise, total_xof, total_eur,
    taux_eur, taux_usd, taux_usd_le, taux_usd_source, empreinte_ip, langue, frais_livraison_xof, livraison_zone, paiement_expire_le)
  values (p->>'reference', 'a_preparer', v_lignes, p->'contact', p->'remise', nullif(p->>'message', ''), p->>'devise',
    somme + frais, round((somme + frais) / 655.957, 2),
    coalesce((p->>'taux_eur')::numeric, 655.957), (p->>'taux_usd')::numeric, (p->>'taux_usd_le')::timestamptz, p->>'taux_usd_source',
    p->>'empreinte_ip', coalesce(p->>'langue', 'FR'), frais, z->>'code', now() + make_interval(mins => p_minutes))
  returning id into v_id;
  perform public.boutique_reserver_stock(v_id);
  return jsonb_build_object('ok', true, 'id', v_id, 'total_xof', somme + frais, 'frais_livraison_xof', frais);
end;
$$;
revoke all on function public.boutique_commander(jsonb, integer) from public, anon, authenticated;
grant execute on function public.boutique_commander(jsonb, integer) to service_role;

-- Frais et zone figés avec les montants (mêmes règles qu'au 06/11).
create or replace function public.boutique_commande_montants_figes()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.statut <> 'a_confirmer' and new.statut = 'a_confirmer' then
    raise exception 'commande_figee' using errcode='P0001';
  end if;
  if (old.statut <> 'a_confirmer' or new.statut <> 'a_confirmer')
    and row(new.lignes,new.total_xof,new.total_eur,new.devise,new.contact,new.remise,new.reference,new.frais_livraison_xof,new.livraison_zone)
      is distinct from row(old.lignes,old.total_xof,old.total_eur,old.devise,old.contact,old.remise,old.reference,old.frais_livraison_xof,old.livraison_zone) then
    raise exception 'commande_figee' using errcode='P0001';
  end if;
  return new;
end;
$$;

-- Chiffrage par l'équipe (ancien parcours) : les frais de livraison figés à la commande s'ajoutent aux articles.
create or replace function public.chiffrer_commande_boutique(p_id uuid, p_par uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.boutique_commandes;
  l jsonb;
  v_lignes jsonb := '[]'::jsonb;
  prix numeric;
  quantite numeric;
  total numeric := 0;
begin
  if not exists(select 1 from public.equipe_profils where id=p_par and role='admin' and etat='actif') then
    return jsonb_build_object('erreur','refuse');
  end if;
  select * into c from public.boutique_commandes where id=p_id for update;
  if not found or c.statut <> 'a_confirmer' or c.total_xof is not null or c.total_eur is not null then
    return jsonb_build_object('erreur','etat');
  end if;
  perform 1 from public.boutique_produits where slug in (select x->>'slug' from jsonb_array_elements(c.lignes) x)
    order by id for share;
  for l in select x from jsonb_array_elements(c.lignes) x loop
    if jsonb_typeof(l->'quantite') is distinct from 'number' then return jsonb_build_object('erreur','champs'); end if;
    quantite := (l->>'quantite')::numeric;
    if quantite < 1 or quantite <> trunc(quantite) or quantite > 2147483647 then return jsonb_build_object('erreur','champs'); end if;
    if l->>'prix_xof' is not null then
      if jsonb_typeof(l->'prix_xof') is distinct from 'number' then return jsonb_build_object('erreur','prix'); end if;
      prix := (l->>'prix_xof')::numeric;
    elsif l->>'prix_eur' is not null then
      if jsonb_typeof(l->'prix_eur') is distinct from 'number' or (l->>'prix_eur')::numeric < 0 then return jsonb_build_object('erreur','prix'); end if;
      prix := round((l->>'prix_eur')::numeric * 655.957);
      l := jsonb_set(l,'{prix_xof}',to_jsonb(prix));
    else
      select prix_xof into prix from public.boutique_produits where slug = l->>'slug';
      if not found or prix is null then return jsonb_build_object('erreur','prix'); end if;
      l := jsonb_set(l,'{prix_xof}',to_jsonb(prix));
    end if;
    if prix < 0 or prix <> trunc(prix) or prix > 2147483647 then return jsonb_build_object('erreur','prix'); end if;
    total := total + prix * quantite;
    if total > 2147483647 then return jsonb_build_object('erreur','montant'); end if;
    v_lignes := v_lignes || jsonb_build_array(l);
  end loop;
  total := total + coalesce(c.frais_livraison_xof, 0);
  if total > 2147483647 then return jsonb_build_object('erreur','montant'); end if;
  update public.boutique_commandes set lignes=v_lignes, total_xof=total::integer, total_eur=round(total/655.957,2) where id=c.id;
  return jsonb_build_object('ok',true,'total_xof',total);
end;
$$;

-- État de règlement (version du 09/11, complétée) : une commande annulée n'est jamais « payée ». Annulée faute de
-- paiement dans le délai puis payée en ligne : remise en réservation si le stock le permet ; sinon tout argent reçu sur
-- une commande annulée est « à régulariser » (remboursement manuel par l'équipe), sans reçu R-.
create or replace function public.boutique_recalculer_commande(p_commande uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.boutique_commandes; manuel bigint; en_ligne bigint; total bigint; attendu integer; v_etat text;
begin
  select * into c from public.boutique_commandes where id = p_commande for update;
  if not found then raise exception 'commande_introuvable'; end if;
  attendu := coalesce(c.total_xof,round(c.total_eur * 655.957)::integer);
  select coalesce(sum(case when devise = 'EUR' then sign(montant)*round(abs(montant)::numeric*655957/100000) else montant end),0)
    into manuel from public.paiements_manuels where commande_id = c.id and etat = 'confirme';
  select coalesce(sum(montant),0) into en_ligne from public.liens_paiement where commande_id = c.id and paye_le is not null;
  total := manuel + en_ligne;
  if c.statut = 'annulee' and c.expiree and en_ligne > 0 and public.boutique_stock_manquant(c.lignes) is null then
    perform public.boutique_reserver_stock(c.id);
    update public.boutique_commandes set statut = 'a_preparer', annule_le = null, motif_annulation = null, expiree = false where id = c.id;
    c.statut := 'a_preparer';
  end if;
  v_etat := case when c.statut = 'annulee' then case when total = 0 then 'attente' else 'a_regulariser' end
    when attendu > 0 and total = attendu then 'paye' when total = 0 then 'attente' else 'a_regulariser' end;
  update public.boutique_commandes set montant_recu = total, paiement_etat = v_etat,
    paye_le = case when v_etat = 'paye' then coalesce(paye_le,now()) else null end where id = c.id;
  if v_etat = 'paye' then
    perform public.emettre_document('R','commande',c.id);
    update public.liens_paiement set annule_le = now(), modifie_le = now()
      where commande_id = c.id and paye_le is null and annule_le is null;
  end if;
  return v_etat;
end;
$$;
revoke all on function public.boutique_recalculer_commande(uuid) from public, anon, authenticated;

-- ---------- textes de la boutique ----------
-- Le règlement « à la confirmation par l'équipe » devient faux (décision du 09/11). Phrases remplacées seulement si elles
-- sont encore celles d'origine (une retouche de l'admin est conservée) ; nouvelles phrases ajoutées seulement si absentes.
-- Traductions rédigées le 09/11 ; HT et GCF à faire relire par un locuteur, comme le reste du site.
update public.contenu_site set valeur = jsonb_set(valeur, '{panier,note}', to_jsonb($t$Paiement en une fois à la commande, sans acompte. Frais de livraison selon la zone, indiqués avant le paiement. Prix en euros ou en francs CFA au taux fixe de 1 € = 655,957 FCFA ; en dollars, à titre indicatif, au taux fixé par OHT.$t$::text)) where cle = 'boutique.boutique' and valeur #>> '{panier,note}' = $t$Paiement en une fois, à la confirmation de la commande par l’équipe OHT. Prix en euros ou en francs CFA au taux fixe de 1 € = 655,957 FCFA ; en dollars, à titre indicatif, au taux fixé par OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,note}', to_jsonb($t$Paiement en une fois à la commande, sans acompte. Frais de livraison selon la zone, indiqués avant le paiement. Prix en euros ou en francs CFA au taux fixe de 1 € = 655,957 FCFA ; en dollars, à titre indicatif, au taux fixé par OHT.$t$::text)) where cle = 'boutique.boutique' and valeur #>> '{commande,note}' = $t$Paiement en une fois, à la confirmation de la commande par l’équipe OHT. Prix en euros ou en francs CFA au taux fixe de 1 € = 655,957 FCFA ; en dollars, à titre indicatif, au taux fixé par OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,retraitTexte,1}', to_jsonb($t$Paiement en une fois à la commande, sans acompte. Frais de livraison selon la zone, indiqués avant le paiement.$t$::text)) where cle = 'boutique.boutique' and valeur #>> '{fiche,retraitTexte,1}' = $t$Paiement en une fois, à la confirmation de la commande par l’équipe OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,info,0}', to_jsonb($t$Paiement en une fois à la commande, sans acompte. Frais de livraison selon la zone, indiqués avant le paiement.$t$::text)) where cle = 'boutique.boutique' and valeur #>> '{fiche,info,0}' = $t$Paiement en une fois, à la confirmation de la commande par l’équipe OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,prixNote}', to_jsonb($t$Paiement en une fois, à la commande.$t$::text)) where cle = 'boutique.boutique' and valeur #>> '{fiche,prixNote}' = $t$Paiement en une fois, à la confirmation de la commande.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{reassurance,points,0,texte}', to_jsonb($t$Vous réglez votre commande en une fois au moment de commander, sans acompte.$t$::text)) where cle = 'boutique.boutique' and valeur #>> '{reassurance,points,0,texte}' = $t$L’équipe OHT confirme votre commande avec vous ; vous la réglez alors en une fois, sans acompte.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{panier,note}', to_jsonb($t$One‑off payment when you order, no deposit. Delivery fees depend on the zone and are shown before payment. Price in euros or CFA francs at the fixed rate of €1 = 655.957 FCFA; in dollars, indicative, at the rate set by OHT.$t$::text)) where cle = 'EN:boutique.boutique' and valeur #>> '{panier,note}' = $t$One‑off payment upon order confirmation by the OHT team. Price in euros or CFA francs at the fixed rate of €1 = 655.957 FCFA; in dollars, indicative, at the rate set by OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,note}', to_jsonb($t$One‑off payment when you order, no deposit. Delivery fees depend on the zone and are shown before payment. Price in euros or CFA francs at the fixed rate of €1 = 655.957 FCFA; in dollars, indicative, at the rate set by OHT.$t$::text)) where cle = 'EN:boutique.boutique' and valeur #>> '{commande,note}' = $t$One‑off payment upon order confirmation by the OHT team. Price in euros or CFA francs at the fixed rate of €1 = 655.957 FCFA; in dollars, indicative, at the rate set by OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,retraitTexte,1}', to_jsonb($t$One‑off payment when you order, no deposit. Delivery fees depend on the zone and are shown before payment.$t$::text)) where cle = 'EN:boutique.boutique' and valeur #>> '{fiche,retraitTexte,1}' = $t$One‑off payment upon order confirmation by the OHT team.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,info,0}', to_jsonb($t$One‑off payment when you order, no deposit. Delivery fees depend on the zone and are shown before payment.$t$::text)) where cle = 'EN:boutique.boutique' and valeur #>> '{fiche,info,0}' = $t$One‑off payment upon order confirmation by the OHT team.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,prixNote}', to_jsonb($t$One‑off payment when you order.$t$::text)) where cle = 'EN:boutique.boutique' and valeur #>> '{fiche,prixNote}' = $t$One‑off payment upon order confirmation.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{reassurance,points,0,texte}', to_jsonb($t$You pay for your order in full when you place it, without a deposit.$t$::text)) where cle = 'EN:boutique.boutique' and valeur #>> '{reassurance,points,0,texte}' = $t$The OHT team confirms your order with you; you then pay it in full, without a deposit.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,payer}', to_jsonb($t$Order and pay$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,payer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiement}', to_jsonb($t$Opening payment…$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiement}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,reservation}', to_jsonb($t$Your items are reserved for 30 minutes while you pay.$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,reservation}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,fraisLivraison}', to_jsonb($t$Delivery fees$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,fraisLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,gratuit}', to_jsonb($t$Free$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,gratuit}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,totalPayer}', to_jsonb($t$Total to pay$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,totalPayer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,delaiLivraison}', to_jsonb($t$Estimated delivery time: {n} days$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,delaiLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,zoneSansPrix}', to_jsonb($t$Delivery to this country cannot be paid online yet. Choose collection in Ouidah or write to us to arrange it.$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,zoneSansPrix}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,nousEcrire}', to_jsonb($t$Write to an agent$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,nousEcrire}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiementPlusTard}', to_jsonb($t$Payment could not be opened. You can pay for the order from its tracking page for 30 minutes.$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiementPlusTard}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabrication}', to_jsonb($t$Made for you, ready in {n} days.$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabrication}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabricationEquipe}', to_jsonb($t$Made for you, lead time confirmed by the team.$t$::text)) where cle = 'EN:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabricationEquipe}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{panier,note}', to_jsonb($t$Pago único al hacer el pedido, sin anticipo. Gastos de envío según la zona, indicados antes del pago. Precio en euros o en francos CFA al tipo fijo de 1 € = 655,957 FCFA; en dólares, a modo indicativo, al tipo fijado por OHT.$t$::text)) where cle = 'ES:boutique.boutique' and valeur #>> '{panier,note}' = $t$Pago único, al confirmar el pedido por el equipo OHT. Precio en euros o en francos CFA al tipo fijo de 1 € = 655,957 FCFA; en dólares, a modo indicativo, al tipo fijado por OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,note}', to_jsonb($t$Pago único al hacer el pedido, sin anticipo. Gastos de envío según la zona, indicados antes del pago. Precio en euros o en francos CFA al tipo fijo de 1 € = 655,957 FCFA; en dólares, a modo indicativo, al tipo fijado por OHT.$t$::text)) where cle = 'ES:boutique.boutique' and valeur #>> '{commande,note}' = $t$Pago único, al confirmar el pedido por el equipo OHT. Precio en euros o en francos CFA al tipo fijo de 1 € = 655,957 FCFA; en dólares, a modo indicativo, al tipo fijado por OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,retraitTexte,1}', to_jsonb($t$Pago único al hacer el pedido, sin anticipo. Gastos de envío según la zona, indicados antes del pago.$t$::text)) where cle = 'ES:boutique.boutique' and valeur #>> '{fiche,retraitTexte,1}' = $t$Pago único, al confirmar el pedido por el equipo OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,info,0}', to_jsonb($t$Pago único al hacer el pedido, sin anticipo. Gastos de envío según la zona, indicados antes del pago.$t$::text)) where cle = 'ES:boutique.boutique' and valeur #>> '{fiche,info,0}' = $t$Pago único, al confirmar el pedido por el equipo OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,prixNote}', to_jsonb($t$Pago único, al hacer el pedido.$t$::text)) where cle = 'ES:boutique.boutique' and valeur #>> '{fiche,prixNote}' = $t$Pago único, al confirmar el pedido.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{reassurance,points,0,texte}', to_jsonb($t$Paga su pedido de una sola vez al realizarlo, sin anticipo.$t$::text)) where cle = 'ES:boutique.boutique' and valeur #>> '{reassurance,points,0,texte}' = $t$El equipo OHT confirma su pedido con usted; lo paga de una sola vez, sin anticipo.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,payer}', to_jsonb($t$Pedir y pagar$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,payer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiement}', to_jsonb($t$Abriendo el pago…$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiement}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,reservation}', to_jsonb($t$Sus piezas quedan reservadas 30 minutos mientras paga.$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,reservation}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,fraisLivraison}', to_jsonb($t$Gastos de envío$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,fraisLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,gratuit}', to_jsonb($t$Gratis$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,gratuit}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,totalPayer}', to_jsonb($t$Total a pagar$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,totalPayer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,delaiLivraison}', to_jsonb($t$Plazo orientativo: {n} días$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,delaiLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,zoneSansPrix}', to_jsonb($t$El envío a este país aún no se puede pagar en línea. Elija la recogida en Ouidah o escríbanos para organizarlo.$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,zoneSansPrix}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,nousEcrire}', to_jsonb($t$Escribir a un agente$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,nousEcrire}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiementPlusTard}', to_jsonb($t$No se pudo abrir el pago. Puede pagar el pedido desde su seguimiento durante 30 minutos.$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiementPlusTard}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabrication}', to_jsonb($t$Hecho para usted, listo en {n} días.$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabrication}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabricationEquipe}', to_jsonb($t$Hecho para usted, plazo indicado por el equipo.$t$::text)) where cle = 'ES:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabricationEquipe}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{panier,note}', to_jsonb($t$Vollständige Zahlung bei der Bestellung, ohne Anzahlung. Versandkosten je nach Zone, vor der Zahlung angezeigt. Preise in Euro oder CFA-Franc zum festen Kurs von 1 € = 655,957 FCFA; Dollarpreise dienen der Orientierung und beruhen auf dem von OHT festgelegten Kurs.$t$::text)) where cle = 'DE:boutique.boutique' and valeur #>> '{panier,note}' = $t$Vollständige Zahlung nach Bestätigung der Bestellung durch das OHT-Team. Preise in Euro oder CFA-Franc zum festen Kurs von 1 € = 655,957 FCFA; Dollarpreise dienen der Orientierung und beruhen auf dem von OHT festgelegten Kurs.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,note}', to_jsonb($t$Vollständige Zahlung bei der Bestellung, ohne Anzahlung. Versandkosten je nach Zone, vor der Zahlung angezeigt. Preise in Euro oder CFA-Franc zum festen Kurs von 1 € = 655,957 FCFA; Dollarpreise dienen der Orientierung und beruhen auf dem von OHT festgelegten Kurs.$t$::text)) where cle = 'DE:boutique.boutique' and valeur #>> '{commande,note}' = $t$Vollständige Zahlung nach Bestätigung der Bestellung durch das OHT-Team. Preise in Euro oder CFA-Franc zum festen Kurs von 1 € = 655,957 FCFA; Dollarpreise dienen der Orientierung und beruhen auf dem von OHT festgelegten Kurs.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,retraitTexte,1}', to_jsonb($t$Vollständige Zahlung bei der Bestellung, ohne Anzahlung. Versandkosten je nach Zone, vor der Zahlung angezeigt.$t$::text)) where cle = 'DE:boutique.boutique' and valeur #>> '{fiche,retraitTexte,1}' = $t$Vollständige Zahlung nach Bestätigung der Bestellung durch das OHT-Team.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,info,0}', to_jsonb($t$Vollständige Zahlung bei der Bestellung, ohne Anzahlung. Versandkosten je nach Zone, vor der Zahlung angezeigt.$t$::text)) where cle = 'DE:boutique.boutique' and valeur #>> '{fiche,info,0}' = $t$Vollständige Zahlung nach Bestätigung der Bestellung durch das OHT-Team.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,prixNote}', to_jsonb($t$Vollständige Zahlung bei der Bestellung.$t$::text)) where cle = 'DE:boutique.boutique' and valeur #>> '{fiche,prixNote}' = $t$Vollständige Zahlung nach Bestätigung der Bestellung.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{reassurance,points,0,texte}', to_jsonb($t$Sie bezahlen Ihre Bestellung vollständig beim Bestellen, ohne Anzahlung.$t$::text)) where cle = 'DE:boutique.boutique' and valeur #>> '{reassurance,points,0,texte}' = $t$Das OHT-Team bestätigt Ihre Bestellung mit Ihnen. Anschließend bezahlen Sie den gesamten Betrag, ohne Anzahlung.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,payer}', to_jsonb($t$Bestellen und bezahlen$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,payer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiement}', to_jsonb($t$Zahlung wird geöffnet…$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiement}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,reservation}', to_jsonb($t$Ihre Artikel sind während der Zahlung 30 Minuten lang reserviert.$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,reservation}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,fraisLivraison}', to_jsonb($t$Versandkosten$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,fraisLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,gratuit}', to_jsonb($t$Kostenlos$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,gratuit}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,totalPayer}', to_jsonb($t$Zu zahlender Betrag$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,totalPayer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,delaiLivraison}', to_jsonb($t$Voraussichtliche Lieferzeit: {n} Tage$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,delaiLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,zoneSansPrix}', to_jsonb($t$Die Lieferung in dieses Land kann noch nicht online bezahlt werden. Wählen Sie die Abholung in Ouidah oder schreiben Sie uns, um sie zu vereinbaren.$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,zoneSansPrix}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,nousEcrire}', to_jsonb($t$Einem Mitarbeiter schreiben$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,nousEcrire}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiementPlusTard}', to_jsonb($t$Die Zahlung konnte nicht geöffnet werden. Sie können die Bestellung 30 Minuten lang über die Seite Ihrer Bestellung bezahlen.$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiementPlusTard}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabrication}', to_jsonb($t$Für Sie gefertigt, fertig in {n} Tagen.$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabrication}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabricationEquipe}', to_jsonb($t$Für Sie gefertigt, die Fertigungszeit nennt Ihnen das Team.$t$::text)) where cle = 'DE:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabricationEquipe}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{panier,note}', to_jsonb($t$Pagamento único no momento da encomenda, sem sinal. Portes de envio conforme a zona, indicados antes do pagamento. Preços em euros ou francos CFA à taxa fixa de 1 € = 655,957 FCFA; em dólares, a título indicativo, à taxa definida pela OHT.$t$::text)) where cle = 'PT:boutique.boutique' and valeur #>> '{panier,note}' = $t$Pagamento único, quando a equipa OHT confirmar a encomenda. Preços em euros ou francos CFA à taxa fixa de 1 € = 655,957 FCFA; em dólares, a título indicativo, à taxa definida pela OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,note}', to_jsonb($t$Pagamento único no momento da encomenda, sem sinal. Portes de envio conforme a zona, indicados antes do pagamento. Preços em euros ou francos CFA à taxa fixa de 1 € = 655,957 FCFA; em dólares, a título indicativo, à taxa definida pela OHT.$t$::text)) where cle = 'PT:boutique.boutique' and valeur #>> '{commande,note}' = $t$Pagamento único, quando a equipa OHT confirmar a encomenda. Preços em euros ou francos CFA à taxa fixa de 1 € = 655,957 FCFA; em dólares, a título indicativo, à taxa definida pela OHT.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,retraitTexte,1}', to_jsonb($t$Pagamento único no momento da encomenda, sem sinal. Portes de envio conforme a zona, indicados antes do pagamento.$t$::text)) where cle = 'PT:boutique.boutique' and valeur #>> '{fiche,retraitTexte,1}' = $t$Pagamento único, quando a equipa OHT confirmar a encomenda.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,info,0}', to_jsonb($t$Pagamento único no momento da encomenda, sem sinal. Portes de envio conforme a zona, indicados antes do pagamento.$t$::text)) where cle = 'PT:boutique.boutique' and valeur #>> '{fiche,info,0}' = $t$Pagamento único, quando a equipa OHT confirmar a encomenda.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,prixNote}', to_jsonb($t$Pagamento único, no momento da encomenda.$t$::text)) where cle = 'PT:boutique.boutique' and valeur #>> '{fiche,prixNote}' = $t$Pagamento único, na confirmação da encomenda.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{reassurance,points,0,texte}', to_jsonb($t$Paga a sua encomenda de uma só vez ao fazê-la, sem sinal.$t$::text)) where cle = 'PT:boutique.boutique' and valeur #>> '{reassurance,points,0,texte}' = $t$A equipa OHT confirma consigo a encomenda; nessa altura, paga o valor total, sem sinal.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,payer}', to_jsonb($t$Encomendar e pagar$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,payer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiement}', to_jsonb($t$A abrir o pagamento…$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiement}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,reservation}', to_jsonb($t$As suas peças ficam reservadas durante 30 minutos, enquanto paga.$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,reservation}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,fraisLivraison}', to_jsonb($t$Portes de envio$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,fraisLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,gratuit}', to_jsonb($t$Grátis$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,gratuit}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,totalPayer}', to_jsonb($t$Total a pagar$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,totalPayer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,delaiLivraison}', to_jsonb($t$Prazo indicativo: {n} dias$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,delaiLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,zoneSansPrix}', to_jsonb($t$A entrega para este país ainda não pode ser paga online. Escolha o levantamento em Ouidah ou escreva-nos para a combinar.$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,zoneSansPrix}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,nousEcrire}', to_jsonb($t$Escrever a um agente$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,nousEcrire}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiementPlusTard}', to_jsonb($t$Não foi possível abrir o pagamento. Pode pagar a encomenda a partir do seu acompanhamento durante 30 minutos.$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiementPlusTard}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabrication}', to_jsonb($t$Feito para si, pronto em {n} dias.$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabrication}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabricationEquipe}', to_jsonb($t$Feito para si, prazo indicado pela equipa.$t$::text)) where cle = 'PT:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabricationEquipe}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{panier,note}', to_jsonb($t$Peman yon sèl kou lè w fè kòmann nan, san avans. Frè livrezon depann de zòn nan, yo parèt anvan peman an. Pri an ewo oswa an fran CFA nan to fiks 1 € = 655,957 FCFA ; an dola, pou enfòmasyon sèlman, nan to OHT fikse a.$t$::text)) where cle = 'HT:boutique.boutique' and valeur #>> '{panier,note}' = $t$Peman yon sèl kou, lè ekip OHT la konfime kòmann nan. Pri an ewo oswa an fran CFA nan to fiks 1 € = 655,957 FCFA ; an dola, pou enfòmasyon sèlman, nan to OHT fikse a.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,note}', to_jsonb($t$Peman yon sèl kou lè w fè kòmann nan, san avans. Frè livrezon depann de zòn nan, yo parèt anvan peman an. Pri an ewo oswa an fran CFA nan to fiks 1 € = 655,957 FCFA ; an dola, pou enfòmasyon sèlman, nan to OHT fikse a.$t$::text)) where cle = 'HT:boutique.boutique' and valeur #>> '{commande,note}' = $t$Peman yon sèl kou, lè ekip OHT la konfime kòmann nan. Pri an ewo oswa an fran CFA nan to fiks 1 € = 655,957 FCFA ; an dola, pou enfòmasyon sèlman, nan to OHT fikse a.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,retraitTexte,1}', to_jsonb($t$Peman yon sèl kou lè w fè kòmann nan, san avans. Frè livrezon depann de zòn nan, yo parèt anvan peman an.$t$::text)) where cle = 'HT:boutique.boutique' and valeur #>> '{fiche,retraitTexte,1}' = $t$Peman yon sèl kou, lè ekip OHT la konfime kòmann nan.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,info,0}', to_jsonb($t$Peman yon sèl kou lè w fè kòmann nan, san avans. Frè livrezon depann de zòn nan, yo parèt anvan peman an.$t$::text)) where cle = 'HT:boutique.boutique' and valeur #>> '{fiche,info,0}' = $t$Peman yon sèl kou, lè ekip OHT la konfime kòmann nan.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,prixNote}', to_jsonb($t$Peman yon sèl kou, lè w fè kòmann nan.$t$::text)) where cle = 'HT:boutique.boutique' and valeur #>> '{fiche,prixNote}' = $t$Peman yon sèl kou, lè kòmann nan konfime.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{reassurance,points,0,texte}', to_jsonb($t$Ou peye kòmann ou an yon sèl kou lè w fè l, san avans.$t$::text)) where cle = 'HT:boutique.boutique' and valeur #>> '{reassurance,points,0,texte}' = $t$Ekip OHT la konfime kòmann ou an avèk ou ; lè sa a, ou peye l yon sèl kou, san avans.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,payer}', to_jsonb($t$Kòmande epi peye$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,payer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiement}', to_jsonb($t$N ap louvri peman an…$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiement}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,reservation}', to_jsonb($t$Atik ou yo rezève pandan 30 minit, tan pou w peye.$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,reservation}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,fraisLivraison}', to_jsonb($t$Frè livrezon$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,fraisLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,gratuit}', to_jsonb($t$Gratis$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,gratuit}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,totalPayer}', to_jsonb($t$Total pou peye$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,totalPayer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,delaiLivraison}', to_jsonb($t$Delè apeprè : {n} jou$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,delaiLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,zoneSansPrix}', to_jsonb($t$Livrezon nan peyi sa a poko ka peye sou entènèt. Chwazi vin pran nan Ouidah oswa ekri nou pou nou òganize l.$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,zoneSansPrix}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,nousEcrire}', to_jsonb($t$Ekri yon ajan$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,nousEcrire}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiementPlusTard}', to_jsonb($t$Peman an pa t ka louvri. Ou ka peye kòmann nan nan paj swivi li pandan 30 minit.$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiementPlusTard}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabrication}', to_jsonb($t$Fèt pou ou, pare nan {n} jou.$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabrication}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabricationEquipe}', to_jsonb($t$Fèt pou ou, ekip la ap ba w delè a.$t$::text)) where cle = 'HT:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabricationEquipe}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{panier,note}', to_jsonb($t$Péman an sèl kou lè zot ka komandé, san avans. Frè livrézon ka dépann di zòn-lan, yo ka parèt avan péman-lan. Pri an léwo oben an fran CFA épi to fiks 1 € = 655,957 FCFA ; an dola, pou bay an lidé, épi to OHT fikse-a.$t$::text)) where cle = 'GCF:boutique.boutique' and valeur #>> '{panier,note}' = $t$Péman an sèl kou, lè lékip OHT konfimen komand-lan. Pri an léwo oben an fran CFA épi to fiks 1 € = 655,957 FCFA ; an dola, pou bay an lidé, épi to OHT fikse-a.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,note}', to_jsonb($t$Péman an sèl kou lè zot ka komandé, san avans. Frè livrézon ka dépann di zòn-lan, yo ka parèt avan péman-lan. Pri an léwo oben an fran CFA épi to fiks 1 € = 655,957 FCFA ; an dola, pou bay an lidé, épi to OHT fikse-a.$t$::text)) where cle = 'GCF:boutique.boutique' and valeur #>> '{commande,note}' = $t$Péman an sèl kou, lè lékip OHT konfimen komand-lan. Pri an léwo oben an fran CFA épi to fiks 1 € = 655,957 FCFA ; an dola, pou bay an lidé, épi to OHT fikse-a.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,retraitTexte,1}', to_jsonb($t$Péman an sèl kou lè zot ka komandé, san avans. Frè livrézon ka dépann di zòn-lan, yo ka parèt avan péman-lan.$t$::text)) where cle = 'GCF:boutique.boutique' and valeur #>> '{fiche,retraitTexte,1}' = $t$Péman an sèl kou, lè lékip OHT konfimen komand-lan.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,info,0}', to_jsonb($t$Péman an sèl kou lè zot ka komandé, san avans. Frè livrézon ka dépann di zòn-lan, yo ka parèt avan péman-lan.$t$::text)) where cle = 'GCF:boutique.boutique' and valeur #>> '{fiche,info,0}' = $t$Péman an sèl kou, lè lékip OHT konfimen komand-lan.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,prixNote}', to_jsonb($t$Péman an sèl kou, lè zot ka komandé.$t$::text)) where cle = 'GCF:boutique.boutique' and valeur #>> '{fiche,prixNote}' = $t$Péman an sèl kou, lè komand-lan konfimen.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{reassurance,points,0,texte}', to_jsonb($t$Zot ka péyé komand zot an sèl kou lè zot ka fè’y, san avans.$t$::text)) where cle = 'GCF:boutique.boutique' and valeur #>> '{reassurance,points,0,texte}' = $t$Lékip OHT ka konfimen komand zot épi zot ; lè-tala zot ka péyé’y an sèl kou, san avans.$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,payer}', to_jsonb($t$Komandé é péyé$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,payer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiement}', to_jsonb($t$Péman-lan ka ouvè…$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiement}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,reservation}', to_jsonb($t$Pyès zot rézèvé pandan 30 minit, tan zot ka péyé.$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,reservation}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,fraisLivraison}', to_jsonb($t$Frè livrézon$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,fraisLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,gratuit}', to_jsonb($t$Gratis$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,gratuit}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,totalPayer}', to_jsonb($t$Total pou péyé$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,totalPayer}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,delaiLivraison}', to_jsonb($t$Délè apépré : {n} jou$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,delaiLivraison}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,zoneSansPrix}', to_jsonb($t$Livrézon an péyi-lasa pa pòkò pé péyé asi entènèt. Chwazi pran Ouidah oben ékri nou pou òganizé’y.$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,zoneSansPrix}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,nousEcrire}', to_jsonb($t$Ékri an ajan$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,nousEcrire}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{commande,paiementPlusTard}', to_jsonb($t$Péman-lan pa té pé ouvè. Zot pé péyé komand-lan asi paj suivi a’y pandan 30 minit.$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{commande}') = 'object' and valeur #> '{commande,paiementPlusTard}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabrication}', to_jsonb($t$Fèt pou zot, paré adan {n} jou.$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabrication}' is null;
update public.contenu_site set valeur = jsonb_set(valeur, '{fiche,fabricationEquipe}', to_jsonb($t$Fèt pou zot, lékip-la ké di zot délè-a.$t$::text)) where cle = 'GCF:boutique.boutique' and jsonb_typeof(valeur #> '{fiche}') = 'object' and valeur #> '{fiche,fabricationEquipe}' is null;

-- Rupture de stock : « Épuisé » plutôt qu'« Indisponible » (Kevin, 09/11). Remplacé seulement si la traduction est encore
-- celle d'origine (HT « Fini », GCF « Fin » : à faire relire par un locuteur).
update public.contenu_site set valeur = jsonb_set(valeur, '{carte,indisponible}', to_jsonb($t$Sold out$t$::text)) where cle = 'EN:boutique.boutique' and valeur #>> '{carte,indisponible}' = $t$Unavailable$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{carte,indisponible}', to_jsonb($t$Agotado$t$::text)) where cle = 'ES:boutique.boutique' and valeur #>> '{carte,indisponible}' = $t$No disponible$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{carte,indisponible}', to_jsonb($t$Ausverkauft$t$::text)) where cle = 'DE:boutique.boutique' and valeur #>> '{carte,indisponible}' = $t$Nicht verfügbar$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{carte,indisponible}', to_jsonb($t$Esgotado$t$::text)) where cle = 'PT:boutique.boutique' and valeur #>> '{carte,indisponible}' = $t$Indisponível$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{carte,indisponible}', to_jsonb($t$Fini$t$::text)) where cle = 'HT:boutique.boutique' and valeur #>> '{carte,indisponible}' = $t$Pa disponib$t$;
update public.contenu_site set valeur = jsonb_set(valeur, '{carte,indisponible}', to_jsonb($t$Fin$t$::text)) where cle = 'GCF:boutique.boutique' and valeur #>> '{carte,indisponible}' = $t$Pa disponib$t$;
