-- Appels aux passerelles de paiement déclenchés par un visiteur (audit de sécurité du 23/11/2026, lot 6) : retour du
-- client (POST /api/paiement/verifier) et page /payer (lancer, vérifier) appelaient KKiaPay, FedaPay, Stripe, Paystack ou
-- Flutterwave avec les clés marchandes d'OHT sans aucune limite (FedaPay : une transaction neuve par lancement). Chaque
-- appel est désormais noté ici AVANT de partir (src/lib/serveur/paiement/appels.ts) ; le déclencheur le refuse sous verrou
-- (des requêtes simultanées ne passent pas ensemble), exception « limite », rendue en 429 :
--   20 appels par heure et par empreinte de connexion : un client réel en fait 2 à 5 (retour de la passerelle, un ou
--      deux « vérifier à nouveau », un second lancement) ; la marge couvre plusieurs clients derrière une même adresse ;
--   10 appels par heure pour une même réservation ou un même lien, toutes connexions confondues.
-- Un appel refusé n'est pas compté. Lignes de plus d'une heure effacées à chaque note (empreinte gardée une heure au
-- plus). Les webhooks, authentifiés par la passerelle, ne passent pas ici. Idempotente.

create table if not exists public.paiement_appels (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  ip_hash text not null check (char_length(ip_hash) <= 128),
  reference uuid not null
);
create index if not exists paiement_appels_ip on public.paiement_appels (ip_hash, cree_le);
create index if not exists paiement_appels_reference on public.paiement_appels (reference, cree_le);
create index if not exists paiement_appels_cree on public.paiement_appels (cree_le);
alter table public.paiement_appels enable row level security;
revoke all on public.paiement_appels from public, anon, authenticated;
grant insert on public.paiement_appels to service_role;

create or replace function public.limiter_appels_paiement() returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.cree_le := now(); -- l'heure de la base, jamais une date envoyée
  -- toujours dans cet ordre (connexion puis référence) : deux appels ne s'attendent jamais en croix
  perform pg_advisory_xact_lock(hashtextextended('paiement-ip:'||new.ip_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('paiement-ref:'||new.reference::text,0));
  delete from public.paiement_appels where id in (select id from public.paiement_appels where cree_le < now()-interval '1 hour' for update skip locked);
  if (select count(*) from public.paiement_appels where ip_hash=new.ip_hash and cree_le>=now()-interval '1 hour')>=20
     or (select count(*) from public.paiement_appels where reference=new.reference and cree_le>=now()-interval '1 hour')>=10 then
    raise exception 'limite';
  end if;
  return new;
end; $$;
revoke all on function public.limiter_appels_paiement() from public, anon, authenticated;

drop trigger if exists limiter_appels on public.paiement_appels;
create trigger limiter_appels before insert on public.paiement_appels for each row execute function public.limiter_appels_paiement();
