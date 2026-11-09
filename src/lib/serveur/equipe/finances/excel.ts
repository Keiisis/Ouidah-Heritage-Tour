import { strToU8, zipSync } from "fflate";

type Cellule = string | number | null;
// OOXML minimal : nombres natifs, textes inline (jamais des formules), une feuille par registre.
// fflate est déjà utilisé par le site ; aucun lecteur ou éditeur de classeur n’est nécessaire ici.
export function classeurExcel(feuilles: { nom: string; lignes: Cellule[][] }[]): Uint8Array<ArrayBuffer> {
  const xml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const colonne = (n: number) => {
    let t = "";
    for (n++; n > 0; n = Math.floor((n - 1) / 26)) t = String.fromCharCode(65 + (n - 1) % 26) + t;
    return t;
  };
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const fichiers: Record<string, Uint8Array> = {};
  const ajouter = (nom: string, contenu: string) => { fichiers[nom] = strToU8(declaration + contenu); };
  ajouter("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  ajouter("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  ajouter("xl/workbook.xml", `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${feuilles.map((f, i) => `<sheet name="${xml(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  ajouter("xl/_rels/workbook.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  feuilles.forEach((f, i) => {
    const lignes = f.lignes.map((ligne, r) => `<row r="${r + 1}">${ligne.map((v, c) => v === null ? "" : typeof v === "number"
      ? `<c r="${colonne(c)}${r + 1}"><v>${v}</v></c>`
      : `<c r="${colonne(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join("")}</row>`).join("");
    ajouter(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${lignes}</sheetData></worksheet>`);
  });
  return new Uint8Array(zipSync(fichiers));
}
