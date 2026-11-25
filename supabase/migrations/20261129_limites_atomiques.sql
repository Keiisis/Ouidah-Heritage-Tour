-- Limites par connexion des formulaires publics recomptées dans la transaction d'écriture (audit de sécurité du
-- 24/11/2026, lot 2). Le pré-contrôle des routes (garde.ts, limiteAtteinte) lit puis écrit : des requêtes simultanées
-- d'une même connexion passaient toutes. Ici un verrou consultatif par empreinte d'IP sérialise ces écritures et le
-- compte est refait sous ce verrou (modèle : limiter_services_publics, 20261107). Seuils inchangés : 5 par heure et par
-- empreinte. Refus : exception « limite », rendue en 429 par les routes.
--   abonnes_lettre     /api/lettre (une adresse déjà connue, ignorée par ON CONFLICT DO NOTHING, n'ajoute rien) ;
--   boutique_commandes /api/boutique/commande, insertion directe ou rpc boutique_commander (empreinte_ip) ;
--   reservations       /api/devis, billet payable ;
--   demandes           /api/devis, à l'envoi : insertion « envoyee » ou passage brouillon → envoyee. Seules les demandes
--                      du questionnaire /devis (réponses non vides) sont limitées ; une conversation de l'assistant
--                      transformée en demande (versDemande, aussi appelée par l'équipe) garde ses propres limites. Le
--                      compte reprend toutes les demandes envoyées de l'empreinte, comme limiteAtteinte.
-- Arguments du déclencheur : colonne de l'empreinte, puis statut compté (facultatif). Idempotente.

create or replace function public.limiter_formulaires_publics() returns trigger language plpgsql security definer set search_path=public as $$
declare v_ip text := to_jsonb(new)->>tg_argv[0]; v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('formulaires-ip:'||tg_table_name||':'||v_ip,0));
  execute format('select count(*) from public.%I where %I=$1 and cree_le>=now()-interval ''1 hour''%s', tg_table_name, tg_argv[0],
    case when tg_nargs>1 then format(' and statut=%L', tg_argv[1]) else '' end) into v_n using v_ip;
  if v_n>=5 then raise exception 'limite'; end if;
  return new;
end; $$;
revoke all on function public.limiter_formulaires_publics() from public,anon,authenticated;

drop trigger if exists limiter_formulaire on public.abonnes_lettre;
create trigger limiter_formulaire before insert on public.abonnes_lettre for each row execute function public.limiter_formulaires_publics('ip_hash');
drop trigger if exists limiter_formulaire on public.boutique_commandes;
create trigger limiter_formulaire before insert on public.boutique_commandes for each row execute function public.limiter_formulaires_publics('empreinte_ip');
drop trigger if exists limiter_formulaire on public.reservations;
create trigger limiter_formulaire before insert on public.reservations for each row execute function public.limiter_formulaires_publics('ip_hash');
drop trigger if exists limiter_formulaire on public.demandes;
create trigger limiter_formulaire before insert on public.demandes for each row
  when (new.statut='envoyee' and new.reponses<>'{}'::jsonb) execute function public.limiter_formulaires_publics('ip_hash','envoyee');
drop trigger if exists limiter_formulaire_envoi on public.demandes;
create trigger limiter_formulaire_envoi before update of statut on public.demandes for each row
  when (old.statut<>'envoyee' and new.statut='envoyee' and new.reponses<>'{}'::jsonb) execute function public.limiter_formulaires_publics('ip_hash','envoyee');
