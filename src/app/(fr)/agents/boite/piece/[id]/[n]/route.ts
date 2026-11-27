import { courrielRecu, lirePiece, MAX_PIECE } from "@/lib/serveur/equipe/messages/imap";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";

// Pièce jointe d'un courriel reçu (écran boîte), relue à la demande sur le serveur IMAP : rien n'est stocké ailleurs, aucune
// URL publique. Session exigée avec les droits de l'écran : l'admin, ou l'agent qui a le droit « demandes » et seulement
// pour un courriel d'un dossier qui lui est attribué ; sinon 404 (rien ne dit qu'il existe). Toujours en téléchargement
// (Content-Disposition: attachment), nom de fichier assaini ; tout type hors de la liste SURS (HTML, SVG, exécutables…)
// part en application/octet-stream, et nosniff empêche le navigateur de le deviner.

const PRIVE = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const SURS = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet",
]);

/** Nom gardé lisible, sans caractère de contrôle, de séparateur de chemin, ni d'inversion de sens (« gpj.exe »). */
function nomSur(nom: string) {
  const n = nom.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[\\/:*?"<>|]/g, "_").replace(/^[.\s]+/, "").trim().slice(0, 150);
  return n || "piece-jointe";
}
function disposition(nom: string) {
  const n = nomSur(nom), ascii = n.replace(/[^\x20-\x7e]/g, "_").replace(/[%;\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(n).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const s = await exigerDroit("demandes"); // droit « Demandes et devis » ; un admin les a tous
  if (!s) return new Response(null, { status: 403, headers: PRIVE });
  const { id, n } = await params;
  const c = /^\d{1,2}$/.test(n) ? await courrielRecu(s, id) : "non";
  if (c === null) return new Response(null, { status: 503, headers: PRIVE });
  const p = c === "non" ? null : c.pieces[Number(n)];
  if (c === "non" || !p?.partie || !(p.taille <= MAX_PIECE)) return new Response(null, { status: 404, headers: PRIVE });
  const contenu = await lirePiece(c, p.partie);
  if (contenu === null) return new Response(null, { status: 503, headers: PRIVE });
  if (contenu === "absent") return new Response(null, { status: 404, headers: PRIVE });
  const type = p.type.toLowerCase().split(";")[0].trim();
  return new Response(new Uint8Array(contenu), {
    headers: {
      ...PRIVE,
      "content-type": SURS.has(type) ? type : "application/octet-stream",
      "content-disposition": disposition(p.nom),
      "content-length": String(contenu.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
