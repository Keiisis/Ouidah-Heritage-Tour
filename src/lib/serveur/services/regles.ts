// Validation commune, indépendante du serveur. Les mêmes bornes sont imposées en SQL.
export const LANGUES_SERVICES = ["FR", "EN", "ES", "DE", "PT", "HT", "GCF"] as const;
export type LangueService = typeof LANGUES_SERVICES[number];
export const UUID_SERVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Même adresse simple que le parcours d'effacement de l'espace Sécurité : aucun joker PostgREST.
const emailValide = /^[^\s@*%"\\(),]+@[^\s@*%"\\(),]+\.[^\s@*%"\\(),]{2,}$/;
export function objet(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }
export const texte = (v: unknown) => typeof v === "string" ? v.trim() : "";
export const langueService = (v: unknown): LangueService => LANGUES_SERVICES.includes(v as LangueService) ? v as LangueService : "FR";
export function lireContact(v: unknown) {
  const c = objet(v), nom = texte(c.nom), email = texte(c.email).toLowerCase(), telephone = texte(c.telephone), message = texte(c.message);
  if (!nom || nom.length > 120 || email.length > 254 || !emailValide.test(email) || telephone.length > 32 || (telephone && !/^\+?[\d () .-]{6,32}$/.test(telephone)) || message.length > 2000 || c.consentement !== true) return null;
  return { nom, email, telephone: telephone || null, message: message || null, langue: langueService(c.langue) };
}
export function lireEmail(v: unknown) { const e = texte(v).toLowerCase(); return e.length <= 254 && emailValide.test(e) ? e : null; }
export function lireCandidature(v: unknown) {
  const c = objet(v), contact = lireContact(c), organisation = texte(c.organisation), activite = texte(c.activite), ville = texte(c.ville), site = texte(c.site);
  if (!contact || !organisation || organisation.length > 160 || !activite || activite.length > 120 || !ville || ville.length > 120 || site.length > 500) return null;
  if (site) { try { const u = new URL(site); if (u.protocol !== "https:" || u.username || u.password) return null; } catch { return null; } }
  return { ...contact, organisation, activite, ville, site: site || null };
}
export function lireCreneau(v: unknown, maintenant: number) {
  const c = objet(v), debut = texte(c.debut), fin = texte(c.fin), lieu = texte(c.lieu), agent = texte(c.agent_id);
  const d = Date.parse(debut), f = Date.parse(fin);
  if (!UUID_SERVICE.test(agent) || !Number.isFinite(d) || !Number.isFinite(f) || d <= maintenant || d > maintenant + 366 * 86400000 || f <= d || f - d > 4 * 3600000 || !lieu || lieu.length > 280 || !["telephone", "sur_place"].includes(String(c.mode))) return null;
  return { agent_id: agent, debut: new Date(d).toISOString(), fin: new Date(f).toISOString(), mode: c.mode as "telephone" | "sur_place", lieu };
}
