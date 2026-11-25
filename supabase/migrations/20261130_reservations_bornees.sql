-- Réservations bornées par demandeur et dans le temps (audit de sécurité du 24/11/2026, lot 3). Idempotente : aucune
-- donnée lue ni modifiée, une colonne ajoutée à reservations, un index unique retiré.
--   1. Boutique : au plus une commande à paiement immédiat impayée et non échue par empreinte d'IP et par adresse e-mail
--      (verrous consultatifs pris avant tout autre, refus { erreur: 'attente' }, rendu en 429 par la route). Le catalogue
--      ne compte plus une retenue échue, sans attendre qu'une autre commande ou la purge quotidienne la rende
--      (boutique_retenues, lu par lireCatalogue).
--   2. Rendez-vous : au plus un rendez-vous futur confirmé par empreinte d'IP et par adresse, dans le déclencheur
--      limiter_services_publics (exception « limite », déjà rendue en 429 par la route).
--   3. Jauge d'un événement revérifiée au passage attente → payé d'un paiement en ligne, sous un verrou par (événement,
--      date). Complet : la réservation reste en attente, complet_le est noté (le passage n'est plus jamais retenté, même si
--      une place se libère), la transaction et le montant reçus restent sur la ligne ; l'équipe est avertie pour
--      rembourser (finaliser.ts). Un règlement manuel saisi par l'équipe n'est pas concerné.
--   4. Candidatures partenaires : toutes gardées (index candidatures_en_cours retiré) ; une candidature anonyme ne prend
--      plus la place de celle du vrai partenaire.
-- Compatible avec 20261129_limites_atomiques.sql (5 écritures par heure et par empreinte, inchangées).

-- ---------- 1. boutique ----------
-- Recopie de 20261113_boutique_paiement_immediat.sql ; seul ajout : le bloc « une seule commande impayée en cours ».
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
  -- une seule commande impayée en cours par connexion et par adresse : verrous pris avant ceux des commandes et des
  -- articles (toujours IP puis adresse), compte relu sous ces verrous
  perform pg_advisory_xact_lock(hashtextextended('boutique-retenue-ip:' || coalesce(p->>'empreinte_ip', ''), 0));
  perform pg_advisory_xact_lock(hashtextextended('boutique-retenue-email:' || lower(coalesce(p->'contact'->>'email', '')), 0));
  if exists (select 1 from public.boutique_commandes c
             where c.statut = 'a_preparer' and c.paiement_etat = 'attente' and c.montant_recu = 0 and c.paiement_expire_le > now()
               and (c.empreinte_ip = p->>'empreinte_ip' or lower(c.contact->>'email') = lower(p->'contact'->>'email'))) then
    return jsonb_build_object('erreur', 'attente');
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

-- Retenues des commandes à paiement immédiat impayées (mêmes conditions que boutique_expirer_commandes), par article :
-- quantité dont l'échéance est passée (le catalogue ne la compte plus) et présence d'une retenue encore en cours (le
-- catalogue en cache se relit alors dans la minute, pour montrer l'article dès l'échéance).
create or replace function public.boutique_retenues()
returns table (slug text, echue integer, en_cours boolean) language sql stable security definer set search_path = public as $$
  select p.slug, (coalesce(sum(r.quantite) filter (where c.paiement_expire_le <= now()), 0))::integer, bool_or(c.paiement_expire_le > now())
  from public.boutique_reservations_stock r
  join public.boutique_commandes c on c.id = r.commande_id
  join public.boutique_produits p on p.id = r.produit_id
  where r.primaire and c.statut = 'a_preparer' and c.paiement_etat = 'attente' and c.montant_recu = 0 and c.paiement_expire_le is not null
    and not exists (select 1 from public.liens_paiement l where l.commande_id = c.id and l.paye_le is not null)
  group by p.slug;
$$;
revoke all on function public.boutique_retenues() from public, anon, authenticated;
grant execute on function public.boutique_retenues() to service_role;

-- ---------- 2. rendez-vous ----------
-- Recopie de 20261107_services_publics.sql ; seul ajout : le bloc rendez_vous.
create or replace function public.limiter_services_publics() returns trigger language plpgsql security definer set search_path=public as $$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('services-ip:'||tg_table_name||':'||new.ip_hash,0));
  execute format('select count(*) from public.%I where ip_hash=$1 and cree_le>now()-interval ''1 hour''',tg_table_name) into v_n using new.ip_hash;
  if v_n>=5 then raise exception 'limite'; end if;
  if tg_table_name='acces_donnees' then
    perform pg_advisory_xact_lock(hashtextextended('services-email:'||new.email,0));
    select count(*) into v_n from acces_donnees where email=new.email and cree_le>now()-interval '1 hour';
    if v_n>=3 then raise exception 'limite'; end if;
  end if;
  if tg_table_name='rendez_vous' then
    perform pg_advisory_xact_lock(hashtextextended('services-rdv-email:'||new.email,0));
    if exists(select 1 from rendez_vous r join rdv_creneaux c on c.id=r.creneau_id
              where r.statut='confirme' and c.debut>now() and (r.ip_hash=new.ip_hash or r.email=new.email)) then
      raise exception 'limite';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.limiter_services_publics() from public,anon,authenticated;

-- ---------- 3. jauge au paiement ----------
-- capacite : jauge de l'édition lue dans le contenu à la création (null : sans jauge). complet_le : passage au paiement
-- refusé parce que l'événement était complet.
alter table public.reservations add column if not exists capacite integer check (capacite is null or capacite >= 0);
alter table public.reservations add column if not exists complet_le timestamptz;

create or replace function public.reservation_jauge() returns trigger language plpgsql security definer set search_path = public as $$
declare v_payees integer;
begin
  if old.complet_le is not null then
    new.statut := 'attente'; new.paye_le := null; new.complet_le := old.complet_le;
    return new;
  end if;
  if new.capacite is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('jauge:' || new.evenement || ':' || new.occurrence::text, 0));
  select coalesce(sum(quantite), 0) into v_payees from public.reservations
    where evenement = new.evenement and occurrence = new.occurrence and statut = 'paye' and id <> new.id;
  if v_payees + new.quantite > new.capacite then
    new.statut := 'attente'; new.paye_le := null; new.complet_le := now();
  end if;
  return new;
end;
$$;
revoke all on function public.reservation_jauge() from public, anon, authenticated;
-- Nom choisi pour passer avant etats_transitions et finances_verrou (ordre alphabétique des déclencheurs BEFORE) : ils
-- voient la ligne telle qu'elle sera écrite.
drop trigger if exists capacite_paiement on public.reservations;
create trigger capacite_paiement before update of statut on public.reservations for each row
  when (old.statut = 'attente' and new.statut = 'paye' and not new.reglement_manuel)
  execute function public.reservation_jauge();

-- ---------- 4. candidatures ----------
drop index if exists public.candidatures_en_cours;
