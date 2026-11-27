-- Boîte de réception « comme Gmail » (26/11/2026). Migration additive et rejouable, aucune ligne perdue ni réécrite.
-- 1. courriels_envoyes.reponse_a et demande_id : un e-mail écrit en réponse à un courriel reçu (actions.ts) garde le
--    courriel d'origine et le dossier auquel celui-ci est rattaché. Posés seulement pour une réponse ; null sinon.
-- 2. imap_releves.tente_le et imap_reserver(p_boite, p_intervalle) : heure de la dernière relève lancée, et intervalle
--    minimal (en secondes) demandé par la relève automatique de l'écran boîte (imap-actions.ts, releverBoiteAuto). Une
--    réservation refusée (relève en cours ou trop récente) rend null, comme avant. imap_reserver(p_boite) garde sa
--    signature et ses droits (relève manuelle, tâche quotidienne, reprise message par message de imap.ts) : elle appelle
--    la nouvelle avec un intervalle nul, et note donc aussi tente_le. Aucun paramètre par défaut : les deux appels
--    PostgREST ({p_boite} et {p_boite, p_intervalle}) ont chacun une seule fonction possible.
-- Idempotente ; sans begin/commit : scripts/migrations-production.mjs met chaque migration dans sa transaction.

alter table public.courriels_envoyes add column if not exists reponse_a uuid references public.courriels_recus (id) on delete set null;
alter table public.courriels_envoyes add column if not exists demande_id uuid references public.demandes (id) on delete set null;
create index if not exists courriels_envoyes_demande on public.courriels_envoyes (demande_id, cree_le desc) where demande_id is not null;

alter table public.imap_releves add column if not exists tente_le timestamptz;

create or replace function public.imap_reserver(p_boite text, p_intervalle integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r imap_releves; v uuid:=gen_random_uuid();
begin
  if length(p_boite)<>64 or p_intervalle is null or p_intervalle not between 0 and 86400 then return null; end if;
  insert into imap_releves(boite) values(p_boite) on conflict do nothing;
  select * into r from imap_releves where boite=p_boite for update;
  if r.reserve_jusqu_au>now() then return null; end if;
  if p_intervalle>0 and r.tente_le>now()-make_interval(secs=>p_intervalle) then return null; end if;
  update imap_releves set jeton=v,reserve_jusqu_au=now()+interval '3 minutes',tente_le=now() where boite=p_boite;
  return jsonb_build_object('jeton',v,'validite',r.validite,'dernier_uid',r.dernier_uid);
end $$;
revoke all on function public.imap_reserver(text,integer) from public,anon,authenticated;
grant execute on function public.imap_reserver(text,integer) to service_role;

create or replace function public.imap_reserver(p_boite text)
returns jsonb language sql security definer set search_path=public as $$ select public.imap_reserver(p_boite, 0) $$;
revoke all on function public.imap_reserver(text) from public,anon,authenticated;
grant execute on function public.imap_reserver(text) to service_role;
