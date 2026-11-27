import { LIMITES_PIECES } from "@/content/espace-messages";

// Fichiers joints du composeur d'e-mails : règles pures (ni réseau, ni base ; pas de server-only : le composeur s'en sert
// pour prévenir avant l'envoi, le serveur décide). Un fichier est accepté si son extension est dans TYPES_PIECES ET si son
// contenu porte la signature de ce type ; le type annoncé par le navigateur n'est jamais lu, et le type MIME de la pièce
// vient de l'extension contrôlée. Tout le reste (exécutables, scripts, HTML, SVG, archives) est refusé.

const OOXML = "application/vnd.openxmlformats-officedocument.";
export const TYPES_PIECES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  docx: `${OOXML}wordprocessingml.document`, xlsx: `${OOXML}spreadsheetml.sheet`, pptx: `${OOXML}presentationml.presentation`,
  odt: "application/vnd.oasis.opendocument.text", txt: "text/plain", csv: "text/csv",
};
export const ACCEPT_PIECES = Object.keys(TYPES_PIECES).map((e) => `.${e}`).join(",");
export type RefusPiece = "fichierType" | "fichierLourd" | "fichiersTotal" | "fichiersNombre";

/** Nom gardé lisible, sans caractère de contrôle, de séparateur de chemin, ni d'inversion de sens (« gpj.exe »). */
export function nomSur(nom: string) {
  const n = nom.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[\\/:*?"<>|]/g, "_").replace(/^[.\s]+/, "").trim().slice(0, 150);
  return n || "piece-jointe";
}

/** Extension d'un nom assaini, en minuscules (« Devis.PDF » → « pdf ») ; seule la dernière compte (« a.pdf.exe » → « exe »). */
export const extension = (nom: string) => /\.([a-z0-9]{1,5})$/i.exec(nomSur(nom))?.[1].toLowerCase() ?? "";

/** Refus d'une liste de fichiers d'après leurs noms et leurs tailles (nombre, extension, taille, total), ou null. */
export function refusPieces(l: { name: string; size: number }[]): { erreur: RefusPiece; fichier?: string } | null {
  if (l.length > LIMITES_PIECES.nombre) return { erreur: "fichiersNombre" };
  for (const f of l) {
    if (!f.size || !Object.hasOwn(TYPES_PIECES, extension(f.name))) return { erreur: "fichierType", fichier: nomSur(f.name) };
    if (f.size > LIMITES_PIECES.total) return { erreur: "fichierLourd", fichier: nomSur(f.name) };
  }
  return l.reduce((n, f) => n + f.size, 0) > LIMITES_PIECES.total ? { erreur: "fichiersTotal" } : null;
}

/** Le contenu porte-t-il la signature du type que son extension annonce ? */
export function signatureValide(ext: string, o: Uint8Array): boolean {
  const a = (i: number, ...v: number[]) => v.every((x, k) => o[i + k] === x);
  const latin = (fin?: number) => new TextDecoder("latin1").decode(fin ? o.subarray(0, fin) : o);
  switch (ext) {
    case "pdf":
      return a(0, 0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
    case "jpg":
    case "jpeg":
      return a(0, 0xff, 0xd8, 0xff);
    case "png":
      return a(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "webp":
      return a(0, 0x52, 0x49, 0x46, 0x46) && a(8, 0x57, 0x45, 0x42, 0x50); // RIFF….WEBP
    case "docx":
    case "xlsx":
    case "pptx": {
      // archive ZIP d'un document Office : table des types, dossier du format, aucune macro ; une autre archive est refusée
      if (!a(0, 0x50, 0x4b, 0x03, 0x04)) return false;
      const t = latin();
      return t.includes("[Content_Types].xml") && t.includes({ docx: "word/", xlsx: "xl/", pptx: "ppt/" }[ext]) && !t.includes("vbaProject");
    }
    case "odt":
      // OpenDocument : première entrée « mimetype », non compressée, qui nomme le format
      return a(0, 0x50, 0x4b, 0x03, 0x04) && latin(100).startsWith("mimetypeapplication/vnd.oasis.opendocument.text", 30);
    case "txt":
    case "csv":
      // texte : aucun octet de contrôle (un binaire en a), et ni balisage ni script en tête (HTML, SVG, XML, « #! »)
      return !o.some((x) => x < 0x20 && x !== 0x09 && x !== 0x0a && x !== 0x0d) && !/^(?:\xef\xbb\xbf)?\s*(?:<[a-z!?/]|#!)/i.test(latin(512));
    default:
      return false;
  }
}
