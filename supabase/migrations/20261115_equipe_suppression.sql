-- Équipe : suppression d'un compte (15/11/2026). Le profil d'un membre supprimé n'est jamais effacé : plusieurs tables le
-- citent sans cascade (taux_historique et emcf_operations « on delete restrict », rdv_creneaux, finances_relances,
-- demandes traitées) et le journal perdrait son auteur (« on delete set null »). Il passe à l'état « supprime », anonymisé par le
-- serveur (prénom, nom et adresse remplacés, téléphone et droits vidés) : l'adresse redevient libre pour une nouvelle
-- invitation et aucune session ne vaut hors de l'état « actif » (session.ts). Le compte Supabase Auth est supprimé en
-- mode « soft delete » (adresse rendue illisible, aucune cascade vers le profil). Migration additive : l'état gagne une
-- valeur, rien d'autre ne change.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.equipe_profils'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%etat%'
  loop
    execute format('alter table public.equipe_profils drop constraint %I', c);
  end loop;
end $$;

alter table public.equipe_profils add constraint equipe_profils_etat_check check (etat in ('invite', 'actif', 'suspendu', 'supprime'));
