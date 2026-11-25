-- Données personnelles (audit de sécurité, lot 5, 25/11/2026) : l'effacement emporte les conversations de l'assistant.
-- Avant : effacer_par_acces (/mes-donnees) et l'effacement par l'équipe laissaient les conversations (nom, e-mail,
-- WhatsApp, messages) ; une conversation devenue demande perdait son lien (on delete set null) et l'équipe pouvait en
-- refaire une demande pour la personne effacée.
-- - anonymiser_services, étape SQL partagée par les deux chemins : supprime les conversations de l'adresse (laissée dans
--   la conversation, ou celle d'une de ses demandes), leurs messages (cascade) et les notifications « conversation_agent ».
-- - effacer_par_acces l'appelle avant de supprimer les demandes (même transaction). L'équipe (securite/personne.ts)
--   supprime d'abord les conversations de son inventaire, puis appelle ce complément après son effacement.
-- - utiliser_acces_donnees : l'export d'accès contient les conversations et leurs messages.
-- - notifications : droit DELETE écrit pour service_role (l'équipe efface celles des conversations effacées).
-- Pièces comptables (factures, avoirs, reçus, paiements, numéros remis) : conservées, règles de 20261123 inchangées.
-- Migration additive et rejouable : create or replace, grant. Aucune donnée lue ni modifiée à l'application.

grant delete on public.notifications to service_role;

create or replace function public.anonymiser_services(p_email text) returns void language plpgsql security definer set search_path=public as $$
begin
  -- Conversations : par l'adresse laissée, ou par une de ses demandes encore là. Messages en cascade ; notifications de
  -- l'équipe qui les signalent dans la même instruction.
  with c as (
    delete from conversations where lower(contact_email)=p_email or demande_id in (select id from demandes where lower(email)=p_email)
    returning id)
  delete from notifications n using c where n.type='conversation_agent' and n.objet_id=c.id;
  update rendez_vous set nom='Personne anonymisée', email='efface-'||id::text||'@invalid.local',telephone=null,message=null,ip_hash=repeat('0',64),statut=case when statut='confirme' then 'annule' else statut end where email=p_email;
  update candidatures_partenaires set nom='Personne anonymisée',email='efface-'||id::text||'@invalid.local',telephone=null,organisation='Anonymisée',activite='Anonymisée',ville='Anonymisée',site=null,message=null,note_equipe=null,ip_hash=repeat('0',64),statut='refusee' where email=p_email;
  update acces_donnees set email='efface-'||id::text||'@invalid.local',consomme_le=coalesce(consomme_le,now()),ip_hash=repeat('0',64) where email=p_email;
  update courriels_recus set expediteur='efface-'||id::text||'@invalid.local',nom='',objet='',texte='',pieces='[]'::jsonb,message_id=null where lower(expediteur)=p_email;
  -- Une requête en cours est finalisée par son action propriétaire ; les demandes plus anciennes ne gardent pas
  -- l'identité après un effacement lancé directement depuis l'écran Sécurité.
  update requetes_effacement set email='efface-'||id::text||'@invalid.local',motif=null,resultat=null,
    statut=case when statut='a_traiter' then 'traitee' else statut end,traite_le=coalesce(traite_le,now())
    where email=p_email and statut<>'en_cours';
end; $$;

revoke all on function public.anonymiser_services(text) from public,anon,authenticated;
grant execute on function public.anonymiser_services(text) to service_role;

create or replace function public.utiliser_acces_donnees(p_hash text,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ac acces_donnees; v_d jsonb;
begin
  if p_action is distinct from 'export' then raise exception 'action'; end if;
  select * into v_ac from acces_donnees where jeton_hash=p_hash and envoye and expire_le>now() and consomme_le is null for update;
  if not found then raise exception 'jeton'; end if;
  -- Colonnes publiques explicites : aucun jeton, empreinte, note interne, identité d'agent ou secret passerelle.
  select jsonb_build_object(
    'email',v_ac.email,'exporte_le',now(),
    'clients',coalesce((select jsonb_agg(to_jsonb(x)) from (select nom,email,pays,langue,telephone from clients where lower(email)=v_ac.email) x),'[]'::jsonb),
    'demandes',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,cree_le,statut,intention,circuit,langue,dossier,reponses,nom,email,whatsapp,pays,message from demandes where lower(email)=v_ac.email) x),'[]'::jsonb),
    'devis',coalesce((select jsonb_agg(to_jsonb(x)) from (select v.id,v.cree_le,v.statut,v.lignes,v.montant,v.devise,v.valable_jusqu_au,v.note from devis v join demandes d on d.id=v.demande_id where lower(d.email)=v_ac.email and v.statut<>'brouillon') x),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,cree_le,evenement,occurrence,formule_nom,quantite,montant,devise,statut,nom,email,telephone,paye_le,montant_recu from reservations where lower(email)=v_ac.email) x),'[]'::jsonb),
    'commandes',coalesce((select jsonb_agg(to_jsonb(x)) from (select reference,statut,lignes,contact,remise,message,devise,total_eur,cree_le from boutique_commandes where lower(contact->>'email')=v_ac.email) x),'[]'::jsonb),
    'lettre',coalesce((select jsonb_agg(to_jsonb(x)) from (select email,langue,sujets,consentement_le,desinscrit_le from abonnes_lettre where lower(email)=v_ac.email) x),'[]'::jsonb),
    'factures',coalesce((select jsonb_agg(to_jsonb(x)) from (select f.numero,f.cree_le,f.client,f.lignes,f.montant,f.devise,f.statut from factures f join demandes d on d.id=f.demande_id where lower(d.email)=v_ac.email) x),'[]'::jsonb),
    'avoirs',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.numero,a.cree_le,a.montant,a.motif from avoirs a join factures f on f.id=a.facture_id join demandes d on d.id=f.demande_id where lower(d.email)=v_ac.email) x),'[]'::jsonb),
    'paiements',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.cree_le,p.mode,p.montant,p.etat from paiements_manuels p where p.devis_id in (select v.id from devis v join demandes d on d.id=v.demande_id where lower(d.email)=v_ac.email) or p.reservation_id in (select id from reservations where lower(email)=v_ac.email) or p.commande_id in (select id from boutique_commandes where lower(contact->>'email')=v_ac.email)) x),'[]'::jsonb),
    'courriels',coalesce((select jsonb_agg(to_jsonb(x)) from (select objet,corps,envoye_le from courriels_envoyes where lower(destinataire)=v_ac.email and statut='envoye') x),'[]'::jsonb),
    'courriels_recus',coalesce((select jsonb_agg(to_jsonb(x)) from (select recu_le,expediteur,nom,objet,texte,pieces from courriels_recus where lower(expediteur)=v_ac.email) x),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.nom,e.type,e.type_mime,e.taille,e.cree_le from equipe_documents e join demandes d on d.id=e.demande_id where lower(d.email)=v_ac.email) x),'[]'::jsonb),
    'rendez_vous',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.nom,r.email,r.telephone,r.message,r.statut,c.debut,c.fin,c.mode,c.lieu from rendez_vous r join rdv_creneaux c on c.id=r.creneau_id where r.email=v_ac.email) x),'[]'::jsonb),
    'candidatures',coalesce((select jsonb_agg(to_jsonb(x)) from (select nom,email,organisation,activite,ville,site,message,statut,cree_le from candidatures_partenaires where email=v_ac.email) x),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(to_jsonb(x)) from (select c.cree_le,c.langue,c.mode,c.resume,c.contact_nom,c.contact_email,c.contact_whatsapp,c.contact_accord_le,
       coalesce((select jsonb_agg(jsonb_build_object('cree_le',m.cree_le,'auteur',m.auteur,'texte',m.texte) order by m.id) from conversation_messages m where m.conversation_id=c.id),'[]'::jsonb) messages
       from conversations c where lower(c.contact_email)=v_ac.email or c.demande_id in (select id from demandes where lower(email)=v_ac.email)) x),'[]'::jsonb)
  ) into v_d;
  update acces_donnees set consomme_le=now() where id=v_ac.id;
  return v_d;
end; $$;

-- p_email : adresse du jeton, relue par le serveur pour calculer p_hmac ; revérifiée ici sous verrou.
-- Erreurs : 'champs' (paramètres), 'jeton' (inconnu, non envoyé, expiré ou déjà utilisé). Rejeu après succès : {deja:true}.
create or replace function public.effacer_par_acces(p_hash text,p_email text,p_hmac text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_ac acces_donnees; e text; v_req uuid := gen_random_uuid(); n integer;
  v_dem uuid[]; v_dem_eff uuid[]; v_dem_gar uuid[]; v_devis uuid[]; v_devis_eff uuid[];
  v_resa uuid[]; v_resa_eff uuid[]; v_cmd uuid[]; v_cmd_eff uuid[]; v_payes uuid[]; v_chemins text[];
  v_efface jsonb := '{}'::jsonb; v_garde jsonb; v_numeros integer; l record;
begin
  if p_hash !~ '^[a-f0-9]{64}$' or p_hmac !~ '^[0-9a-f]{64}$' or p_email is null then raise exception 'champs'; end if;
  select * into v_ac from acces_donnees where jeton_hash=p_hash for update;
  if not found then raise exception 'jeton'; end if;
  if v_ac.consomme_le is not null and v_ac.email ~ '^efface-.*@invalid\.local$' then return jsonb_build_object('deja',true); end if;
  if not v_ac.envoye or v_ac.expire_le<=now() or v_ac.consomme_le is not null or v_ac.email<>lower(p_email) then raise exception 'jeton'; end if;
  e := v_ac.email;
  perform set_config('oht.garder_numeros','on',true);

  -- Inventaire (mêmes règles que personne.ts chercher).
  select coalesce(array_agg(id),'{}') into v_dem from demandes where lower(email)=e;
  select coalesce(array_agg(id),'{}') into v_devis from devis where demande_id=any(v_dem);
  select coalesce(array_agg(id),'{}') into v_resa from reservations where lower(email)=e;
  select coalesce(array_agg(id),'{}') into v_cmd from boutique_commandes where lower(contact->>'email')=e;
  select coalesce(array_agg(x),'{}') into v_payes from (
    select unnest(array[devis_id,reservation_id,commande_id]) x from paiements_manuels
     where devis_id=any(v_devis) or reservation_id=any(v_resa) or commande_id=any(v_cmd)
    union select commande_id from liens_paiement where commande_id=any(v_cmd) and paye_le is not null) p where x is not null;
  select coalesce(array_agg(r.id),'{}') into v_resa_eff from reservations r
   where r.id=any(v_resa) and r.statut='attente' and not r.id=any(v_payes)
     and not exists(select 1 from billets_entrees b where b.reservation_id=r.id);
  select coalesce(array_agg(d.id),'{}') into v_dem_eff from demandes d where d.id=any(v_dem)
     and not exists(select 1 from factures f where f.demande_id=d.id)
     and not exists(select 1 from liens_paiement k where k.demande_id=d.id and k.paye_le is not null)
     and not exists(select 1 from devis v where v.demande_id=d.id and v.id=any(v_payes))
     and not exists(select 1 from reservations r where r.demande_id=d.id and not r.id=any(v_resa_eff));
  select coalesce(array_agg(x),'{}') into v_dem_gar from unnest(v_dem) x where not x=any(v_dem_eff);
  select coalesce(array_agg(id),'{}') into v_devis_eff from devis where demande_id=any(v_dem_eff);
  select coalesce(array_agg(c.id),'{}') into v_cmd_eff from boutique_commandes c
   where c.id=any(v_cmd) and c.statut<>'remise' and not c.id=any(v_payes);

  -- Rendez-vous, candidatures, jetons (celui-ci compris : consommé et anonymisé), e-mails reçus, anciennes requêtes,
  -- conversations : avant les demandes, dont la suppression laisserait le lien des conversations à null.
  perform anonymiser_services(e);

  -- Documents de l'équipe (passeports, billets…) : fiches supprimées ici, fichiers par le serveur.
  select coalesce(array_agg(chemin),'{}') into v_chemins from equipe_documents where demande_id=any(v_dem);
  delete from equipe_documents where demande_id=any(v_dem); get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('documents',n);
  delete from dossier_moments where demande_id=any(v_dem); get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('moments',n);
  delete from liens_paiement where paye_le is null and (demande_id=any(v_dem_eff) or devis_id=any(v_devis_eff) or commande_id=any(v_cmd_eff));
  get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('liens',n);
  delete from devis where id=any(v_devis_eff); get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('devis',n);
  delete from reservations where id=any(v_resa_eff); get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('reservations',n);
  delete from demandes where id=any(v_dem_eff); get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('demandes',n);
  delete from clients where lower(email)=e; get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('clients',n);
  delete from courriels_envoyes where lower(destinataire)=e; get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('courriels',n);
  delete from abonnes_lettre where lower(email)=e; get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('abonnes',n);
  -- Commande non réglée et non remise : son stock réservé est rendu avant la suppression.
  perform 1 from boutique_produits where id in (select produit_id from boutique_reservations_stock where commande_id=any(v_cmd_eff) and primaire) order by id for update;
  for l in select * from boutique_reservations_stock where commande_id=any(v_cmd_eff) and primaire order by produit_id loop
    update boutique_produits set stock_reserve=stock_reserve-l.quantite where id=l.produit_id;
  end loop;
  delete from boutique_reservations_stock where commande_id=any(v_cmd_eff);
  delete from boutique_commandes where id=any(v_cmd_eff); get diagnostics n=row_count; v_efface:=v_efface||jsonb_build_object('commandes',n);
  -- Demandes gardées pour les comptes : le texte libre, la note de l'équipe et le WhatsApp ne servent pas à la loi.
  update demandes set message=null,note_equipe=null,whatsapp=null,modifie_le=now() where id=any(v_dem_gar);

  select count(*) into v_numeros from documents where source_id=any(v_dem||v_devis||v_resa||v_cmd);
  v_garde := jsonb_build_object(
    'factures',(select count(*) from factures where demande_id=any(v_dem_gar)),
    'avoirs',(select count(*) from avoirs a join factures f on f.id=a.facture_id where f.demande_id=any(v_dem_gar)),
    'paiements',(select count(*) from paiements_manuels where devis_id=any(v_devis) or reservation_id=any(v_resa) or commande_id=any(v_cmd)),
    'demandes',cardinality(v_dem_gar),
    'devis',(select count(*) from devis where demande_id=any(v_dem_gar)),
    'reservations',cardinality(v_resa)-cardinality(v_resa_eff),
    'commandes',cardinality(v_cmd)-cardinality(v_cmd_eff),
    'numeros',v_numeros);

  insert into requetes_effacement(id,email,statut,motif,resultat,traite_le)
    values(v_req,'efface-'||v_req::text||'@invalid.local','traitee','Effacement automatique après vérification par e-mail (/mes-donnees).',
           jsonb_build_object('efface',v_efface,'garde',v_garde),now());
  insert into donnees_demandes(type,recue_le,email_hmac,resultat)
    values('effacement',(now() at time zone 'Africa/Porto-Novo')::date,p_hmac,
           jsonb_build_object('efface',(select coalesce(sum(value::int),0) from jsonb_each_text(v_efface)),
                              'garde',(select coalesce(sum(value::int),0) from jsonb_each_text(v_garde)),'complet',true,'automatique',true));
  return jsonb_build_object('ok',true,'id',v_req,'efface',v_efface,'garde',v_garde,'chemins',to_jsonb(v_chemins));
end; $$;
revoke all on function public.effacer_par_acces(text,text,text) from public,anon,authenticated;
grant execute on function public.effacer_par_acces(text,text,text) to service_role;
