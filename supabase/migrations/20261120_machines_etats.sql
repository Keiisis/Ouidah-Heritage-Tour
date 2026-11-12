-- Machines à états, vague 1 (argent et engagements), 11/11/2026. Migration idempotente : aucune donnée lue ni modifiée.
-- Chaque table « de → vers » recopie EXACTEMENT la constante TypeScript de son domaine (test machines-etats-coherence) :
--   reservations.statut         TRANSITIONS_RESERVATION  src/lib/serveur/paiement/types.ts
--   devis.statut                TRANSITIONS_DEVIS        src/lib/serveur/equipe/finances/regles.ts
--   factures.statut             TRANSITIONS_FACTURE      src/lib/serveur/equipe/finances/regles.ts
--   boutique_commandes.statut   TRANSITIONS_COMMANDE     src/lib/serveur/equipe/terrain/regles.ts
--   demandes.statut             TRANSITIONS_DEMANDE      src/lib/serveur/equipe/dossiers-regles.ts
--   rendez_vous.statut          TRANSITIONS_RDV          src/lib/serveur/services/regles.ts
--   requetes_effacement.statut  TRANSITIONS_EFFACEMENT   src/lib/serveur/services/regles.ts
--   courriels_envoyes.statut    TRANSITIONS_COURRIEL     src/lib/serveur/equipe/messages/regles.ts
--   lettre_numeros.statut       TRANSITIONS_NUMERO       src/lib/serveur/equipe/messages/regles.ts
--   lettre_envois.statut        TRANSITIONS_ENVOI_LETTRE src/lib/serveur/equipe/messages/regles.ts
-- paiements_manuels.etat reste gardé par paiements_figes (20261103_finances.sql), déjà conforme à TRANSITIONS_PAIEMENT ;
-- emcf_operations.etat par emcf_operation_figer (20261111_emcf_connecteur.sql). Les liens de paiement n'ont pas de colonne
-- d'état (état dérivé de leurs dates, etatLien) : rien ici.
-- Un état inchangé passe toujours ; un état absent de la table est refusé. Les insertions ne sont pas concernées.

create or replace function public.etats_transitions()
returns trigger language plpgsql set search_path = public as $$
declare
  colonne text := tg_argv[0];
  permises jsonb := tg_argv[1]::jsonb;
  de text := to_jsonb(old) ->> colonne;
  vers text := to_jsonb(new) ->> colonne;
begin
  if de is not distinct from vers then return new; end if;
  if not coalesce((permises -> de) ? vers, false) then
    raise exception 'transition_interdite' using errcode = 'P0001',
      detail = format('%s.%s : %s -> %s', tg_table_name, colonne, de, vers);
  end if;
  return new;
end;
$$;
revoke all on function public.etats_transitions() from public, anon, authenticated;

drop trigger if exists etats_transitions on public.reservations;
create trigger etats_transitions before update of statut on public.reservations for each row
  execute function public.etats_transitions('statut', '{"attente":["paye"],"paye":["rembourse","attente"],"rembourse":[]}');

drop trigger if exists etats_transitions on public.devis;
create trigger etats_transitions before update of statut on public.devis for each row
  execute function public.etats_transitions('statut', '{"brouillon":["pret"],"pret":["paye"],"paye":["pret"],"annule":[]}');

drop trigger if exists etats_transitions on public.factures;
create trigger etats_transitions before update of statut on public.factures for each row
  execute function public.etats_transitions('statut', '{"emise":["payee","a_regulariser","annulee"],"payee":["emise","a_regulariser"],"a_regulariser":["emise","payee","annulee"],"annulee":["a_regulariser"]}');

drop trigger if exists etats_transitions on public.boutique_commandes;
create trigger etats_transitions before update of statut on public.boutique_commandes for each row
  execute function public.etats_transitions('statut', '{"a_confirmer":["a_preparer","annulee"],"a_preparer":["prete","annulee"],"prete":["remise","annulee"],"remise":[],"annulee":["a_preparer"]}');

drop trigger if exists etats_transitions on public.demandes;
create trigger etats_transitions before update of statut on public.demandes for each row
  execute function public.etats_transitions('statut', '{"brouillon":["envoyee"],"envoyee":[]}');

drop trigger if exists etats_transitions on public.rendez_vous;
create trigger etats_transitions before update of statut on public.rendez_vous for each row
  execute function public.etats_transitions('statut', '{"confirme":["annule","termine"],"annule":[],"termine":[]}');

drop trigger if exists etats_transitions on public.requetes_effacement;
create trigger etats_transitions before update of statut on public.requetes_effacement for each row
  execute function public.etats_transitions('statut', '{"a_traiter":["en_cours","traitee"],"en_cours":["traitee","refusee","a_traiter"],"traitee":[],"refusee":[]}');

drop trigger if exists etats_transitions on public.courriels_envoyes;
create trigger etats_transitions before update of statut on public.courriels_envoyes for each row
  execute function public.etats_transitions('statut', '{"brouillon":["envoye","echec"],"envoye":[],"echec":[]}');

drop trigger if exists etats_transitions on public.lettre_numeros;
create trigger etats_transitions before update of statut on public.lettre_numeros for each row
  execute function public.etats_transitions('statut', '{"brouillon":["en_cours"],"en_cours":["envoye"],"envoye":[]}');

drop trigger if exists etats_transitions on public.lettre_envois;
create trigger etats_transitions before update of statut on public.lettre_envois for each row
  execute function public.etats_transitions('statut', '{"envoi":["envoye","echec"],"envoye":[],"echec":[]}');
