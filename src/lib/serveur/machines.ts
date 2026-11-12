// Machines à états (vague 1, 11/11) : une table « de → vers » par colonne d'état, déclarée dans le fichier de règles de son
// domaine et recopiée telle quelle par supabase/migrations/20261120_machines_etats.sql (déclencheur etats_transitions).
// Toute écriture d'état passe par peutPasser, en gardant le filtre « etat=eq.<de> » de la mise à jour. Aucun secret, aucun
// accès à la base : les écrans peuvent embarquer ce fichier.

export type Transitions<E extends string> = { readonly [K in E]: readonly E[] };

/** Vrai si l'écriture « de → vers » est permise : état inchangé, ou transition listée dans la table. */
export function peutPasser<E extends string>(table: Transitions<E>, de: E, vers: E): boolean {
  return de === vers || (table[de]?.includes(vers) ?? false);
}
