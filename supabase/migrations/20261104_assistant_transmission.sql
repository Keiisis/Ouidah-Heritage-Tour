-- Assistant du site, décision de Kevin du 04/11/2026 : plus d'accord à donner ; la conversation avec l'assistant IA est
-- effacée quand le visiteur quitte la page (ou après 30 minutes sans activité) ; seul ce que l'assistant transmet à
-- l'équipe est gardé (90 jours). Migration additive, aucune ligne perdue ni réécrite :
-- - conversations.transmise_le : première transmission à l'équipe ; le résumé est complété dans resume (2000 caractères
--   au plus, contrainte existante). conversations.finie_le : conversation transmise dont les messages ont été effacés
--   (visiteur parti) ; elle n'accepte plus aucun message, seule la ligne reste pour l'équipe.
-- - assistant_consommation.conversation_id : ON DELETE SET NULL au lieu de CASCADE, pour qu'effacer une conversation ne
--   rende jamais de budget du jour (contrainte remplacée, lignes intactes).
-- - assistant_compteurs : une ligne par message de visiteur et par conversation ouverte, sans aucun contenu (empreinte IP,
--   date, genre). Les limites par connexion y sont comptées : effacer une conversation ne les remet pas à zéro.
-- Accès serveur seulement, comme les autres tables de l'assistant (RLS active, aucune politique, rien pour anon /
-- authenticated).
begin;

alter table public.conversations add column if not exists transmise_le timestamptz;
alter table public.conversations add column if not exists finie_le timestamptz;
create index if not exists conversations_transmise on public.conversations (transmise_le desc) where transmise_le is not null;
create index if not exists conversations_actives on public.conversations (vu_le) where mode = 'assistant' and finie_le is null;

alter table public.assistant_consommation drop constraint if exists assistant_consommation_conversation_id_fkey;
alter table public.assistant_consommation
  add constraint assistant_consommation_conversation_id_fkey foreign key (conversation_id) references public.conversations (id) on delete set null;

create table if not exists public.assistant_compteurs (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  ip_hash text not null check (char_length(ip_hash) <= 128),
  genre text not null check (genre in ('message', 'conversation'))
);
create index if not exists assistant_compteurs_ip on public.assistant_compteurs (ip_hash, genre, cree_le);
create index if not exists assistant_compteurs_cree on public.assistant_compteurs (cree_le);
alter table public.assistant_compteurs enable row level security;
revoke all on public.assistant_compteurs from anon, authenticated;
grant select, insert, delete on public.assistant_compteurs to service_role;

-- messages d'une conversation transmise effacés à la fin (le droit existait par défaut ; il est écrit ici)
grant delete on public.conversation_messages to service_role;

commit;
