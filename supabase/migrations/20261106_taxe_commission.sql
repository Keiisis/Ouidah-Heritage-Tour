-- TVA incluse : les prix annoncés et les encaissements restent inchangés. Activation et taux décidés par l’admin.
-- Les documents existants gardent fiscalite = NULL ; aucune ventilation ni commission rétroactive.
create table public.finances_regles (
  id boolean primary key default true check (id),
  tva_active boolean not null default false,
  tva_taux numeric(5,2) not null default 0 check (tva_taux between 0 and 100),
  commission_active boolean not null default false,
  commission_taux numeric(5,2) not null default 0 check (commission_taux between 0 and 100),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils(id) on delete set null
);
insert into public.finances_regles(id) values(true);
alter table public.finances_regles enable row level security;
revoke all on public.finances_regles from public, anon, authenticated, service_role;
grant select on public.finances_regles to service_role;

create table public.finances_regles_historique (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  auteur uuid references public.equipe_profils(id) on delete set null,
  avant jsonb not null, apres jsonb not null
);
alter table public.finances_regles_historique enable row level security;
revoke all on public.finances_regles_historique from public, anon, authenticated, service_role;
grant select on public.finances_regles_historique to service_role;
create or replace function public.finances_regles_historique_immuable()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'historique_regles_immuable'; end;
$$;
create trigger finances_regles_historique_fige before update or delete or truncate on public.finances_regles_historique
for each statement execute function public.finances_regles_historique_immuable();

create or replace function public.finances_regler(p_tva_active boolean, p_tva_taux numeric, p_commission_active boolean, p_commission_taux numeric, p_par uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare ancien public.finances_regles; nouveau public.finances_regles;
begin
  if not exists(select 1 from public.equipe_profils where id=p_par and role='admin' and etat='actif') then return false; end if;
  if p_tva_active is null or p_commission_active is null or p_tva_taux is null or p_commission_taux is null
     or p_tva_taux not between 0 and 100 or p_commission_taux not between 0 and 100
     or p_tva_taux <> round(p_tva_taux,2) or p_commission_taux <> round(p_commission_taux,2) then return false; end if;
  select * into ancien from public.finances_regles where id=true for update;
  update public.finances_regles set tva_active=p_tva_active,tva_taux=p_tva_taux,
    commission_active=p_commission_active,commission_taux=p_commission_taux,modifie_le=clock_timestamp(),modifie_par=p_par
    where id=true returning * into nouveau;
  insert into public.finances_regles_historique(auteur,avant,apres) values(p_par,to_jsonb(ancien),to_jsonb(nouveau));
  return true;
end;
$$;
revoke all on function public.finances_regler(boolean,numeric,boolean,numeric,uuid) from public,anon,authenticated;
grant execute on function public.finances_regler(boolean,numeric,boolean,numeric,uuid) to service_role;

alter table public.devis add column fiscalite jsonb;
alter table public.factures add column fiscalite jsonb;
alter table public.boutique_commandes add column fiscalite jsonb;

create or replace function public.finances_ventiler(p_ttc bigint,p_agent uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.finances_regles; ht bigint; agent uuid;
begin
  if p_ttc is null then return null; end if;
  if p_ttc < 0 then raise exception 'montant_invalide'; end if;
  select * into r from public.finances_regles where id=true for share;
  if not found then raise exception 'regles_absentes'; end if;
  select id into agent from public.equipe_profils where id=p_agent and role='agent';
  ht := case when r.tva_active then round(p_ttc::numeric*100/(100+r.tva_taux))::bigint else p_ttc end;
  return jsonb_build_object('tva_active',r.tva_active,'tva_taux',case when r.tva_active then r.tva_taux else 0 end,
    'ht',ht,'tva',p_ttc-ht,'ttc',p_ttc,'commission_active',r.commission_active and agent is not null,
    'commission_taux',case when r.commission_active and agent is not null then r.commission_taux else 0 end,
    'agent_id',agent,'regles_le',r.modifie_le);
end;
$$;
revoke all on function public.finances_ventiler(bigint,uuid) from public,anon,authenticated;
grant execute on function public.finances_ventiler(bigint,uuid) to service_role;

create or replace function public.figer_fiscalite_document()
returns trigger language plpgsql security definer set search_path=public as $$
declare agent uuid; attendu jsonb;
begin
  if tg_table_name='devis' then
    if tg_op='UPDATE' and old.publie_le is not null then
      if new.fiscalite is distinct from old.fiscalite then raise exception 'fiscalite_figee'; end if;
      return new;
    end if;
    if new.publie_le is null then new.fiscalite:=null; return new; end if;
    select agent_id into agent from public.demandes where id=new.demande_id;
    attendu:=public.finances_ventiler(new.montant,agent);
    -- L’aperçu PDF envoyé par l’action doit encore employer les mêmes règles à la publication.
    if new.fiscalite->>'regles_le' is not null and (new.fiscalite->>'regles_le')::timestamptz is distinct from (attendu->>'regles_le')::timestamptz then
      raise exception 'regles_modifiees';
    end if;
    new.fiscalite:=attendu;
  elsif tg_table_name='factures' then
    if tg_op='UPDATE' then
      if new.fiscalite is distinct from old.fiscalite then raise exception 'fiscalite_figee'; end if;
    else
      select fiscalite into new.fiscalite from public.devis where id=new.devis_id;
    end if;
  elsif tg_table_name='boutique_commandes' then
    if tg_op='UPDATE' then
      if new.fiscalite is distinct from old.fiscalite then raise exception 'fiscalite_figee'; end if;
      if old.total_xof is null and new.total_xof is not null and old.statut='a_confirmer' then
        new.fiscalite:=public.finances_ventiler(new.total_xof,null);
      end if;
    else new.fiscalite:=public.finances_ventiler(new.total_xof,null);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.figer_fiscalite_document() from public,anon,authenticated;
create trigger devis_fiscalite_figee before insert or update on public.devis for each row execute function public.figer_fiscalite_document();
create trigger facture_fiscalite_figee before insert or update on public.factures for each row execute function public.figer_fiscalite_document();
create trigger boutique_fiscalite_figee before insert or update on public.boutique_commandes for each row execute function public.figer_fiscalite_document();
