-- Services publics : disponibilités, rendez-vous, candidatures et accès personnel à usage unique.
-- Aucune donnée de production ni suppression. Toutes les tables sont réservées au serveur.
create table public.rdv_creneaux (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  agent_id uuid not null references public.equipe_profils(id),
  debut timestamptz not null,
  fin timestamptz not null,
  mode text not null check (mode in ('telephone','sur_place')),
  lieu text not null check (char_length(lieu) between 1 and 280),
  ouvert boolean not null default true,
  check (fin > debut and fin <= debut + interval '4 hours')
);
create index rdv_creneaux_debut on public.rdv_creneaux(debut) where ouvert;
create table public.rendez_vous (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  creneau_id uuid not null references public.rdv_creneaux(id),
  nom text not null check (char_length(nom) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  telephone text check (char_length(telephone) <= 32),
  message text check (char_length(message) <= 2000),
  langue text not null check (langue in ('FR','EN','ES','DE','PT','HT','GCF')),
  consentement_le timestamptz not null default now(),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  statut text not null default 'confirme' check (statut in ('confirme','annule','termine')),
  traite_par uuid references public.equipe_profils(id),
  traite_le timestamptz
);
create unique index rendez_vous_unique on public.rendez_vous(creneau_id) where statut <> 'annule';
create index rendez_vous_ip on public.rendez_vous(ip_hash,cree_le);

-- Le verrou de l'agent sérialise aussi deux créations de créneaux qui se chevauchent.
create function public.creer_creneau_rdv(p_agent uuid,p_debut timestamptz,p_fin timestamptz,p_mode text,p_lieu text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('rdv:' || p_agent::text,0));
  if not exists(select 1 from equipe_profils where id=p_agent and etat='actif') then raise exception 'agent'; end if;
  if p_debut<=now() or p_debut>now()+interval '366 days' then raise exception 'date'; end if;
  if exists(select 1 from rdv_creneaux where agent_id=p_agent and ouvert and debut<p_fin and fin>p_debut)
    or exists(select 1 from dossier_moments where agent_id=p_agent and fait_le is null and debut<p_fin and fin>p_debut)
    then raise exception 'chevauchement'; end if;
  insert into rdv_creneaux(agent_id,debut,fin,mode,lieu) values(p_agent,p_debut,p_fin,p_mode,p_lieu) returning id into v_id;
  return v_id;
end; $$;

create function public.reserver_rdv(p_creneau uuid,p_nom text,p_email text,p_telephone text,p_message text,p_langue text,p_ip text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cr rdv_creneaux; v_id uuid;
begin
  select * into v_cr from rdv_creneaux where id=p_creneau;
  if not found then raise exception 'indisponible'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rdv:' || v_cr.agent_id::text,0));
  select * into v_cr from rdv_creneaux where id=p_creneau for update;
  if not found or not v_cr.ouvert or v_cr.debut<=now() then raise exception 'indisponible'; end if;
  if not exists(select 1 from equipe_profils where id=v_cr.agent_id and etat='actif') then raise exception 'indisponible'; end if;
  if v_cr.mode='telephone' and nullif(trim(p_telephone),'') is null then raise exception 'telephone'; end if;
  if exists(select 1 from rendez_vous where creneau_id=p_creneau and statut<>'annule') then raise exception 'indisponible'; end if;
  if exists(select 1 from dossier_moments where agent_id=v_cr.agent_id and fait_le is null and debut<v_cr.fin and fin>v_cr.debut) then raise exception 'indisponible'; end if;
  insert into rendez_vous(creneau_id,nom,email,telephone,message,langue,ip_hash) values(p_creneau,p_nom,p_email,p_telephone,p_message,p_langue,p_ip) returning id into v_id;
  return v_id;
end; $$;

create function public.disponibilites_rdv()
returns table(id uuid,debut timestamptz,fin timestamptz,mode text,lieu text)
language sql stable security definer set search_path=public as $$
  select c.id,c.debut,c.fin,c.mode,c.lieu from rdv_creneaux c join equipe_profils p on p.id=c.agent_id
  where c.ouvert and c.debut>now() and p.etat='actif'
    and not exists(select 1 from rendez_vous r where r.creneau_id=c.id and r.statut<>'annule')
    and not exists(select 1 from dossier_moments m where m.agent_id=c.agent_id and m.fait_le is null and m.debut<c.fin and m.fin>c.debut)
  order by c.debut limit 100;
$$;
create function public.changer_creneau_rdv(p_id uuid,p_agent uuid,p_ouvert boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_cr rdv_creneaux;
begin
  perform pg_advisory_xact_lock(hashtextextended('rdv:'||p_agent::text,0));
  select * into v_cr from rdv_creneaux where id=p_id and agent_id=p_agent for update;
  if not found then raise exception 'acces'; end if;
  if p_ouvert and (v_cr.debut<=now() or exists(select 1 from rdv_creneaux where id<>p_id and agent_id=p_agent and ouvert and debut<v_cr.fin and fin>v_cr.debut)) then raise exception 'chevauchement'; end if;
  update rdv_creneaux set ouvert=p_ouvert where id=p_id;
  return true;
end; $$;
-- L'agenda existant et la réservation publique prennent le même verrou : aucun rendez-vous confirmé ne peut être
-- recouvert par un moment ajouté ultérieurement depuis un dossier.
create function public.proteger_rdv_agenda() returns trigger language plpgsql set search_path=public as $$
begin
  if new.agent_id is null or new.fait_le is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('rdv:' || new.agent_id::text,0));
  if exists(select 1 from rendez_vous r join rdv_creneaux c on c.id=r.creneau_id where c.agent_id=new.agent_id and r.statut='confirme' and c.debut<new.fin and c.fin>new.debut)
    then raise exception 'chevauchement_rdv'; end if;
  return new;
end; $$;
create trigger proteger_rdv_agenda before insert or update of agent_id,debut,fin,fait_le on public.dossier_moments for each row execute function public.proteger_rdv_agenda();

create table public.candidatures_partenaires (
  id uuid primary key default gen_random_uuid(), cree_le timestamptz not null default now(),
  nom text not null check (char_length(nom) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email=lower(email)),
  telephone text check (char_length(telephone)<=32),
  organisation text not null check (char_length(organisation) between 1 and 160),
  activite text not null check (char_length(activite) between 1 and 120),
  ville text not null check (char_length(ville) between 1 and 120),
  site text check (site ~ '^https://' and char_length(site)<=500),
  message text check (char_length(message)<=2000),
  langue text not null check (langue in ('FR','EN','ES','DE','PT','HT','GCF')),
  consentement_le timestamptz not null default now(), ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  statut text not null default 'nouvelle' check(statut in ('nouvelle','en_etude','acceptee','refusee')),
  note_equipe text check(char_length(note_equipe)<=2000),
  traite_par uuid references public.equipe_profils(id), traite_le timestamptz
);
create index candidatures_ip on public.candidatures_partenaires(ip_hash,cree_le);
create unique index candidatures_en_cours on public.candidatures_partenaires(email) where statut in ('nouvelle','en_etude');

create table public.acces_donnees (
  id uuid primary key default gen_random_uuid(), cree_le timestamptz not null default now(),
  email text not null check(char_length(email) between 3 and 254 and email=lower(email)),
  jeton_hash text not null unique check(jeton_hash ~ '^[a-f0-9]{64}$'),
  expire_le timestamptz not null check(expire_le>cree_le and expire_le<=cree_le+interval '31 minutes'),
  consomme_le timestamptz, envoye boolean not null default false,
  ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$')
);
create index acces_donnees_ip on public.acces_donnees(ip_hash,cree_le);
create table public.requetes_effacement (
  id uuid primary key default gen_random_uuid(), cree_le timestamptz not null default now(),
  email text not null, verifie_le timestamptz not null default now(),
  statut text not null default 'a_traiter' check(statut in ('a_traiter','en_cours','traitee','refusee')),
  motif text check(char_length(motif)<=2000), resultat jsonb,
  traite_par uuid references public.equipe_profils(id), traite_le timestamptz
);
create unique index requetes_effacement_en_cours on public.requetes_effacement(email) where statut in ('a_traiter','en_cours');

-- Le contrôle préliminaire HTTP ne suffit pas face à plusieurs requêtes simultanées. Les insertions prennent un
-- verrou par IP puis, pour un accès par courriel, par adresse ; le compte est relu dans la transaction d'insertion.
create function public.limiter_services_publics() returns trigger language plpgsql security definer set search_path=public as $$
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
  return new;
end; $$;
create trigger limiter_rendez_vous before insert on public.rendez_vous for each row execute function public.limiter_services_publics();
create trigger limiter_candidatures before insert on public.candidatures_partenaires for each row execute function public.limiter_services_publics();
create trigger limiter_acces_donnees before insert on public.acces_donnees for each row execute function public.limiter_services_publics();
revoke all on function public.limiter_services_publics() from public,anon,authenticated;

-- Une demande d'effacement est seulement mise en attente : aucune suppression publique.
create function public.utiliser_acces_donnees(p_hash text,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ac acces_donnees; v_id uuid; v_d jsonb;
begin
  if p_action not in ('export','effacement') then raise exception 'action'; end if;
  select * into v_ac from acces_donnees where jeton_hash=p_hash and envoye and expire_le>now() and consomme_le is null for update;
  if not found then raise exception 'jeton'; end if;
  if p_action='effacement' then
    insert into requetes_effacement(email) values(v_ac.email) on conflict(email) where statut in ('a_traiter','en_cours') do update set email=excluded.email returning id into v_id;
    v_d=jsonb_build_object('ok',true,'id',v_id);
  else
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
  end if;
  update acces_donnees set consomme_le=now() where id=v_ac.id;
  return v_d;
end; $$;

-- Complément d'effacement des nouveaux services. Appelé seulement par l'admin après le traitement existant qui
-- conserve les écritures financières. Aucun DELETE, aucune table comptable touchée ; toutes les sessions sont révoquées.
create function public.anonymiser_services(p_email text) returns void language plpgsql security definer set search_path=public as $$
begin
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

alter table public.rdv_creneaux enable row level security;
alter table public.rendez_vous enable row level security;
alter table public.candidatures_partenaires enable row level security;
alter table public.acces_donnees enable row level security;
alter table public.requetes_effacement enable row level security;
revoke all on public.rdv_creneaux,public.rendez_vous,public.candidatures_partenaires,public.acces_donnees,public.requetes_effacement from anon,authenticated;
grant select,insert,update on public.rdv_creneaux,public.rendez_vous,public.candidatures_partenaires,public.acces_donnees,public.requetes_effacement to service_role;
revoke all on function public.creer_creneau_rdv(uuid,timestamptz,timestamptz,text,text),public.reserver_rdv(uuid,text,text,text,text,text,text),public.utiliser_acces_donnees(text,text),public.disponibilites_rdv(),public.proteger_rdv_agenda() from public,anon,authenticated;
grant execute on function public.creer_creneau_rdv(uuid,timestamptz,timestamptz,text,text),public.reserver_rdv(uuid,text,text,text,text,text,text),public.utiliser_acces_donnees(text,text),public.disponibilites_rdv() to service_role;
revoke all on function public.anonymiser_services(text) from public,anon,authenticated;
grant execute on function public.anonymiser_services(text) to service_role;
revoke all on function public.changer_creneau_rdv(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.changer_creneau_rdv(uuid,uuid,boolean) to service_role;
