// Frontière Next du chargeur de contenu pour les tests Node seuls.
// Les règles, la lecture de base et les rendus restent réels ; le cache et l'aperçu
// nécessitent Next et sont vérifiés séparément sur le serveur de production local.
export const cacheTag = () => {};
export const cacheLife = () => {};
export const draftMode = async () => ({ isEnabled: false });
