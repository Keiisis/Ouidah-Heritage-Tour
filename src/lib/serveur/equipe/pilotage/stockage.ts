import "server-only";
import { base } from "../../base";
import { effacer } from "../dossiers";
import { COMPARTIMENT, UUID } from "./regles";

// Compartiment PRIVÉ « equipe-documents » (Supabase Storage, créé par l'API le 03/11 : public false, 10 Mo, PDF, JPEG, PNG,
// WebP ; aucune politique sur storage.objects, donc rien pour anon ni authenticated). Seul ce module y touche, avec la clé
// secrète en en-tête « apikey ». Les fonctions de Vercel refusent un corps de plus de 4,5 Mo (doc « Vercel Functions
// Limits ») : le fichier va donc du navigateur au stockage par une URL de dépôt signée, propre à un chemin, sans
// remplacement possible ; la lecture passe par une route qui vérifie le dossier puis renvoie un lien signé d'une minute.

const S = () => `${process.env.SUPABASE_URL}/storage/v1`;
const K = () => ({ apikey: process.env.SUPABASE_SECRET_KEY ?? "" });
const cheminValide = (c: string) => {
  const [a, b, reste] = c.split("/");
  return UUID.test(a ?? "") && UUID.test(b ?? "") && reste === undefined;
};

/** URL de dépôt signée pour <demande>/<objet> (valable 2 h côté Supabase, un seul dépôt : x-upsert absent). */
export async function urlDepot(chemin: string): Promise<string | null> {
  if (!cheminValide(chemin)) return null;
  try {
    const r = await fetch(`${S()}/object/upload/sign/${COMPARTIMENT}/${chemin}`, { method: "POST", headers: { ...K(), "content-type": "application/json" }, body: "{}", cache: "no-store" });
    const j = r.ok ? ((await r.json()) as { url?: string }) : null;
    return j?.url?.startsWith(`/object/upload/sign/${COMPARTIMENT}/${chemin}?token=`) ? `${S()}${j.url}` : null;
  } catch {
    return null;
  }
}

/** Début d'un objet déposé (16 octets), avec le type et la taille vus par le stockage ; « absent » s'il n'existe pas. */
export async function debutObjet(chemin: string): Promise<{ octets: Uint8Array; type: string; taille: number } | "absent" | null> {
  if (!cheminValide(chemin)) return "absent";
  try {
    const r = await fetch(`${S()}/object/authenticated/${COMPARTIMENT}/${chemin}`, { headers: { ...K(), range: "bytes=0-15" }, cache: "no-store" });
    if (r.status === 400 || r.status === 404) return "absent";
    if (r.status !== 206 && r.status !== 200) return null;
    const total = Number(r.headers.get("content-range")?.split("/")[1] ?? r.headers.get("content-length"));
    const octets = new Uint8Array(await r.arrayBuffer()).slice(0, 16);
    return Number.isInteger(total) && total > 0 ? { octets, type: r.headers.get("content-type") ?? "", taille: total } : null;
  } catch {
    return null;
  }
}

/** Lien de lecture signé, valable `secondes` (60 par défaut). */
export async function lienLecture(chemin: string, secondes = 60): Promise<string | null> {
  if (!cheminValide(chemin)) return null;
  try {
    const r = await fetch(`${S()}/object/sign/${COMPARTIMENT}/${chemin}`, { method: "POST", headers: { ...K(), "content-type": "application/json" }, body: JSON.stringify({ expiresIn: secondes }), cache: "no-store" });
    const j = r.ok ? ((await r.json()) as { signedURL?: string }) : null;
    return j?.signedURL?.startsWith(`/object/sign/${COMPARTIMENT}/`) ? `${S()}${j.signedURL}` : null;
  } catch {
    return null;
  }
}

/** Efface des objets du compartiment ; true si le stockage a répondu. */
export async function effacerObjets(chemins: string[]): Promise<boolean> {
  const ok = chemins.filter(cheminValide);
  if (!ok.length) return true;
  try {
    const r = await fetch(`${S()}/object/${COMPARTIMENT}`, { method: "DELETE", headers: { ...K(), "content-type": "application/json" }, body: JSON.stringify({ prefixes: ok }), cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Efface tous les documents d'une demande : fichiers du stockage, puis fiches. À appeler AVANT d'effacer la demande
 * (droit à l'effacement, lot « securite ») : la clé étrangère « on delete restrict » refuse sinon la suppression.
 * Renvoie le nombre de documents effacés, ou null si la base ou le stockage ne répond pas (rien n'est alors effacé en
 * base tant que les fichiers ne le sont pas). L'appelant vérifie lui-même le rôle admin.
 */
export async function effacerDocumentsDuDossier(demandeId: string): Promise<number | null> {
  if (!UUID.test(demandeId)) return null;
  try {
    const r = await base(`equipe_documents?select=chemin&demande_id=eq.${demandeId}&limit=1000`);
    if (!r.ok) return null;
    const chemins = ((await r.json()) as { chemin: string }[]).map((d) => d.chemin);
    if (!chemins.length) return 0;
    if (!(await effacerObjets(chemins))) return null;
    const l = await effacer<{ id: string }>(`equipe_documents?demande_id=eq.${demandeId}&select=id`);
    return l ? l.length : null;
  } catch {
    return null;
  }
}
