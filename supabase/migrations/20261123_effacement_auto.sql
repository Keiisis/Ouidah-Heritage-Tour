-- Effacement automatique depuis /mes-donnees (13/11/2026, demande de Kevin) : dès que la personne ouvre le lien reçu dans sa
-- boîte e-mail (jeton de 30 minutes, acces_donnees) et confirme, ses données sont effacées tout de suite, dans UNE
-- transaction. Plus de file « à traiter » pour ce parcours.
-- Périmètre et garde comptable recopiés de src/lib/serveur/equipe/securite/personne.ts (chercher + effacerTout) :
--   gardés (obligation comptable) : factures, avoirs, paiements, liens payés, réservations payées ou entrées, commandes
--   remises ou payées, et les demandes/devis qui les portent (message, note de l'équipe, WhatsApp vidés) ;
--   gardés aussi : les numéros de ticket, reçu et devis déjà remis (T-/R-/D-, table documents) : sans eux, le compteur
--   reviendrait en arrière et un numéro remis serait redonné à quelqu'un d'autre ;
--   tout le reste est supprimé, puis anonymiser_services (rendez-vous, candidatures, jetons, e-mails reçus).
-- Les fichiers du stockage ne se suppriment pas en SQL : leurs chemins sont renvoyés au serveur, qui les efface ensuite.
-- requetes_effacement : une ligne « traitee » est inscrite directement (jamais a_traiter), adresse déjà anonymisée.
-- donnees_demandes : historique avec l'adresse en HMAC (EQUIPE_SEL), calculé par le serveur, comme l'écran Sécurité.
-- Machines à états : requetes_effacement perd en_cours → a_traiter (TRANSITIONS_EFFACEMENT, src/lib/serveur/services/regles.ts).
-- Migration additive : create or replace, drop trigger if exists. Aucune donnée lue ni modifiée à l'application.

-- Numéros remis : une suppression faite par effacer_par_acces (réglage local oht.garder_numeros) garde la ligne documents.
create or replace function public.documents_suivre_suppression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('oht.garder_numeros', true) = 'on' then return old; end if;
  delete from public.documents where source = tg_argv[0] and source_id = old.id;
  update public.documents_compteurs c
     set dernier = m.dernier
    from (
      select c2.type, c2.annee, coalesce((select max(d.rang) from public.documents d where d.type = c2.type and d.annee = c2.annee), 0) as dernier
        from public.documents_compteurs c2
    ) m
   where c.type = m.type and c.annee = m.annee and c.dernier <> m.dernier;
  return old;
end;
$$;
revoke all on function public.documents_suivre_suppression() from public, anon, authenticated;

-- Le lien sert encore à télécharger ses données ; l'effacement passe par effacer_par_acces.
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
    'candidatures',coalesce((select jsonb_agg(to_jsonb(x)) from (select nom,email,organisation,activite,ville,site,message,statut,cree_le from candidatures_partenaires where email=v_ac.email) x),'[]'::jsonb)
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

  -- Rendez-vous, candidatures, jetons (celui-ci compris : consommé et anonymisé), e-mails reçus, anciennes requêtes.
  perform anonymiser_services(e);
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

-- Machines à états : plus de retour en_cours → a_traiter (Kevin, 13/11). Recopie TRANSITIONS_EFFACEMENT.
drop trigger if exists etats_transitions on public.requetes_effacement;
create trigger etats_transitions before update of statut on public.requetes_effacement for each row
  execute function public.etats_transitions('statut', '{"a_traiter":["en_cours","traitee"],"en_cours":["traitee","refusee"],"traitee":[],"refusee":[]}');

-- Politique de confidentialité publiée (rubrique « legal », FR et traductions de 20261107) : le lien efface tout de suite,
-- la loi impose de garder les pièces comptables. Remplacement exact, sans effet si l'équipe a déjà réécrit la phrase.
-- HT et GCF : traductions à faire relire par un locuteur.
create function pg_temp.politique(p_cle text,p_ancien text,p_nouveau text) returns void language sql as $f$
  update public.contenu_site set valeur=replace(valeur::text,p_ancien,p_nouveau)::jsonb where cle=p_cle and strpos(valeur::text,p_ancien)>0;
  update public.contenu_site set brouillon=replace(brouillon::text,p_ancien,p_nouveau)::jsonb where cle=p_cle and brouillon is not null and strpos(brouillon::text,p_ancien)>0;
$f$;
select pg_temp.politique('legal',$t$Ce lien permet de télécharger vos données ou de transmettre une demande d’effacement à l’équipe. Les justificatifs nécessaires au suivi des paiements et à la comptabilité sont conservés.$t$,$t$Ce lien permet de télécharger vos données ou de les effacer tout de suite. La loi nous oblige à garder les pièces comptables : factures, reçus de paiement, et les réservations, commandes ou devis qu’elles concernent. Tout le reste est effacé.$t$);
select pg_temp.politique('EN:legal',$t$This link lets you download your data or submit a deletion request to the team. Records needed to track payments and for accounting are retained.$t$,$t$This link lets you download your data or delete it straight away. The law requires us to keep accounting records: invoices, payment receipts, and the bookings, orders or quotes they relate to. Everything else is deleted.$t$);
select pg_temp.politique('ES:legal',$t$El enlace permite descargar sus datos o enviar una solicitud de eliminación al equipo. Se conservan los justificantes necesarios para el seguimiento de los pagos y la contabilidad.$t$,$t$El enlace permite descargar sus datos o eliminarlos en el acto. La ley nos obliga a conservar los documentos contables: facturas, recibos de pago y las reservas, pedidos o presupuestos a los que se refieren. Todo lo demás se elimina.$t$);
select pg_temp.politique('DE:legal',$t$Damit können Sie Ihre Daten herunterladen oder dem Team einen Löschantrag senden. Für die Zahlungsverfolgung und Buchhaltung erforderliche Belege werden aufbewahrt.$t$,$t$Damit können Sie Ihre Daten herunterladen oder sofort löschen. Das Gesetz verpflichtet uns, Buchhaltungsunterlagen aufzubewahren: Rechnungen, Zahlungsbelege und die Buchungen, Bestellungen oder Angebote, auf die sie sich beziehen. Alles andere wird gelöscht.$t$);
select pg_temp.politique('PT:legal',$t$O link permite descarregar os seus dados ou enviar um pedido de eliminação à equipa. Os comprovativos necessários para acompanhar os pagamentos e para a contabilidade são conservados.$t$,$t$O link permite descarregar os seus dados ou apagá-los de imediato. A lei obriga-nos a conservar os documentos contabilísticos: faturas, recibos de pagamento e as reservas, encomendas ou orçamentos a que se referem. Tudo o resto é apagado.$t$);
select pg_temp.politique('HT:legal',$t$Lyen sa a pèmèt ou telechaje done ou oswa voye yon demann pou efase yo bay ekip la. Nou konsève dokiman ki nesesè pou swiv peman yo ak pou kontablite.$t$,$t$Lyen sa a pèmèt ou telechaje done ou oswa efase yo touswit. Lalwa oblije nou kenbe papye kontablite yo : fakti, resi peman, ak rezèvasyon, kòmand oswa devi yo konsène. Tout rès la efase.$t$);
select pg_temp.politique('GCF:legal',$t$Lyen-lasa ka pèwmèt ou téléchajé doné a-w oben voyé on demann pou éfasé-yo ba ékip-la. Nou ka konsèwvé jistifikatif ki nésésè pou suiv péman é pou kontabilité.$t$,$t$Lyen-lasa ka pèwmèt ou téléchajé doné a-w oben éfasé-yo tousuit. Lalwa ka oblijé nou gadé papyé kontabilité-la : fakti, résu péyiman, èvè rézèvasyon, kòmand oben dévi yo ka konsèwné. Tout lòt bagay éfasé.$t$);
