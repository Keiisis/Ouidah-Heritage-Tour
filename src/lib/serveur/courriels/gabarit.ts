import { echapper } from "../courriel";

// Gabarit « la lettre illustrée » (piste E validée par Kevin le 03/11/2026, Assets OHT/Emails/maquettes/e) : fonctions
// pures, sans base ni réseau. Chaque bloc rend son HTML (tableaux role=presentation, styles en ligne) et sa version texte,
// assemblés par `courriel()`. Toute donnée passe par `echapper` ; images en adresses absolues `${origine}/courriels/…`.
export type Bloc = { h: string; t: string };
export type Courriel = { sujet: string; html: string; texte: string };
export type Lien = { libelle: string; href: string };
export type Phrase = { prenom?: string | null; avant: string; trait?: string | null; apres?: string };
/** Tampon PAYÉ : image animée (GIF, version PNG pour Outlook) en français et en allemand, sinon tampon en texte. */
export type Tampon = { alt: string; image: "paye" | "bezahlt" | null };
export type Note = { libelle: string; valeur: string | string[]; fort?: boolean };
export type Article = { titre: string; detail?: string | null; montant: string; valeur?: number; image?: { src: string; alt: string; largeur: number; hauteur: number } | null };

const SANS = "Manrope, 'Segoe UI', Arial, sans-serif";
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif";
const NUM = "font-variant-numeric:tabular-nums lining-nums;";
const P = `margin:0;font-family:${SANS};font-weight:400;font-size:16px;line-height:26px;color:#0f162d;`;
const GRIS = `margin:0;font-family:${SANS};font-weight:400;font-size:15px;line-height:24px;color:#3f4863;${NUM}`;
const IMG = "border:0;outline:none;text-decoration:none;";
const TAMPONS = { paye: 77, bezahlt: 117 } as const;
const vide: Bloc = { h: "", t: "" };

// ---------- typographie ----------
const FRANCAISE = new Set(["FR", "GCF"]); // espace insécable avant « : ; ? ! »

function typo(s: string, langue: string) {
  let t = echapper(s).replace(/[  ]/g, "&nbsp;");
  if (FRANCAISE.has(langue)) t = t.replace(/ ([:;?!»])/g, "&nbsp;$1").replace(/« /g, "«&nbsp;");
  return t
    .replace(/(\d) (?=\p{L})/gu, "$1&nbsp;") // 24 heures, 30 000 FCFA
    .replace(/(?<![\p{L}\p{N}&#-])([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+)(?![\p{L}\p{N}-])/gu, '<span style="white-space:nowrap;">$1</span>'); // e-mail, T-2026-000042
}

/** Texte échappé et mis en forme ; retours à la ligne en <br>, adresses web cliquables. */
export function txt(s: string, langue: string) {
  return s
    .split(/(https?:\/\/[^\s<>"]+)/)
    .map((x, i) => {
      if (i % 2 === 0) return typo(x, langue).replace(/\n/g, "<br>");
      const [, url, fin] = /^(.*?)([.,;:!?)]*)$/.exec(x)!;
      return `<a class="lien" href="${echapper(url)}" style="color:#122460;text-decoration:underline;text-underline-offset:3px;">${echapper(url)}</a>${echapper(fin)}`;
    })
    .join("");
}
const insecable = (s: string) => s.replace(/ /g, " ");
const sansVeuve = (s: string) => s.replace(/ (\S+)$/, " $1"); // le dernier mot ne reste jamais seul
const rang = (contenu: string, pad: string, cls = "px") => `<tr><td class="${cls}" style="padding:${pad};">${contenu}</td></tr>`;

// ---------- blocs ----------
export function entete(origine: string): Bloc {
  return { h: rang(`<img class="med" src="${echapper(origine)}/courriels/oht-embleme-medaillon-128.png" width="56" height="56" alt="Ouidah Heritage Tour" style="display:block;width:56px;height:56px;${IMG}font-family:${SANS};font-size:15px;line-height:20px;color:#0f162d;">`, "24px 24px 20px", "px haut"), t: "" };
}

export function photo(origine: string, fichier: string, alt: string): Bloc {
  return { h: `<tr><td style="padding:0;font-size:0;line-height:0;"><img src="${echapper(origine)}/courriels/${echapper(fichier)}" width="600" height="340" alt="${echapper(alt)}" style="display:block;width:100%;max-width:600px;height:auto;${IMG}background:#dde1ea;font-family:${SANS};font-size:15px;line-height:22px;color:#3f4863;"></td></tr>`, t: "" };
}

function tampon(t: Tampon, origine: string, langue: string) {
  const style = (affiche: string) => `display:${affiche};${IMG}vertical-align:middle;font-family:${SANS};font-size:15px;line-height:20px;color:#ac3215;`;
  if (!t.image) return `<span class="tampon" style="display:inline-block;padding:3px 10px;border:2px solid #ac3215;border-radius:3px;font-family:${SANS};font-weight:700;font-size:15px;line-height:23px;letter-spacing:3px;color:#ac3215;vertical-align:middle;white-space:nowrap;">${echapper(t.alt.toLocaleUpperCase(langue.toLowerCase()))}</span>`;
  const l = TAMPONS[t.image], src = (s: string) => `${echapper(origine)}/courriels/tampon-${t.image}${s}`, alt = echapper(t.alt);
  return `<!--[if mso]><img src="${src(".png")}" width="${l}" height="35" alt="${alt}" style="${style("inline-block")}"><![endif]--><!--[if !mso]><!--><img class="clair" src="${src(".gif")}" width="${l}" height="35" alt="${alt}" style="${style("inline-block")}"><img class="sombre" src="${src("-sombre.gif")}" width="${l}" height="35" alt="${alt}" style="${style("none")}"><!--<![endif]-->`;
}

/** Phrase titre (prénom, puis la phrase avec son trait Soleil), date et montant facultatifs. */
export function titre(o: { phrase: Phrase; donnee?: string | null; montant?: string | null; tampon?: Tampon | null }, langue: string, origine: string): Bloc {
  const p = { ...o.phrase, avant: o.phrase.prenom ? o.phrase.avant : o.phrase.avant.charAt(0).toLocaleUpperCase(langue.toLowerCase()) + o.phrase.avant.slice(1) };
  const h1 = `${p.prenom ? `${txt(p.prenom, langue)},<br>` : ""}${txt(p.trait ? p.avant : sansVeuve(p.avant), langue)}${p.trait ? ` <span class="trait" style="border-bottom:6px solid #fdbf28;">${txt(insecable(p.trait), langue)}</span>` : ""}${txt(p.apres ?? "", langue)}`;
  const donnee = o.donnee ? `<p class="donnee t-lbl" style="margin:20px 0 0;font-family:${SANS};font-weight:600;font-size:17px;line-height:24px;color:#122460;${NUM}">${txt(o.donnee, langue)}</p>` : "";
  const montant = o.montant ? `<p class="t-encre" style="margin:8px 0 0;font-family:${SANS};font-weight:700;font-size:24px;line-height:35px;color:#0f162d;${NUM}"><span style="white-space:nowrap;vertical-align:middle;">${txt(o.montant, langue)}</span>${o.tampon ? ` ${tampon(o.tampon, origine, langue)}` : ""}</p>` : "";
  return {
    h: rang(`<h1 class="phrase t-encre" style="margin:0;font-family:${SERIF};font-weight:600;font-size:32px;line-height:40px;letter-spacing:-0.4px;color:#0f162d;text-wrap:balance;overflow-wrap:break-word;mso-line-height-rule:exactly;">${h1}</h1>${donnee}${montant}`, "32px 24px 28px", "px titre"),
    t: [`${p.prenom ? `${p.prenom},\n` : ""}${p.avant}${p.trait ? ` ${p.trait}` : ""}${p.apres ?? ""}`, o.donnee, o.montant && `${o.montant}${o.tampon ? ` · ${o.tampon.alt}` : ""}`].filter(Boolean).join("\n"),
  };
}

export function paragraphes(liste: string[], langue: string, pad = "0px 24px 28px", ecart = 16): Bloc {
  if (!liste.length) return vide;
  return { h: rang(liste.map((x, i) => `<p class="t-encre" style="${P.replace("margin:0;", `margin:${i === liste.length - 1 ? "0" : `0 0 ${ecart}px`};`)}">${txt(x, langue)}</p>`).join(""), pad), t: liste.join("\n\n") };
}

export function boutons(o: { principal?: Lien | null; secondaire?: Lien | null }, sep: string, pad: string): Bloc {
  const { principal: a, secondaire: b } = o;
  if (!a && !b) return vide;
  const h = [
    a && `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="btn-fond" bgcolor="#0f162d" style="background:#0f162d;border-radius:26px;"><a class="btn-texte" href="${echapper(a.href)}" style="display:inline-block;padding:14px 24px;font-family:${SANS};font-weight:700;font-size:16px;line-height:20px;color:#ffffff;text-decoration:none;white-space:nowrap;border-radius:26px;">${echapper(a.libelle)}</a></td></tr></table>`,
    b && `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${a ? "12px" : "0"} 0 0;"><a class="lien" href="${echapper(b.href)}" style="display:inline-block;padding:12px 0;font-family:${SANS};font-weight:600;font-size:16px;line-height:20px;color:#122460;text-decoration:underline;text-underline-offset:4px;">${echapper(b.libelle)}</a></td></tr></table>`,
  ].filter(Boolean).join("");
  return { h: rang(h, pad), t: [a, b].filter((x): x is Lien => Boolean(x)).map((x) => `${x.libelle}${sep}${x.href}`).join("\n") };
}

/** Détails en deux colonnes (libellé, valeur), puis lignes grises (numéros, références). */
export function notes(lignes: Note[], gris: string[], langue: string, sep: string, pad = "32px 24px 0px"): Bloc {
  if (!lignes.length && !gris.length) return vide;
  const valeur = (n: Note) => (Array.isArray(n.valeur) ? n.valeur : [n.valeur]).map((v) => txt(v, langue)).join("<br>");
  const table = lignes.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>\n${lignes
        .map(
          (n) =>
            `<td class="lbl t-lbl" width="120" valign="top" style="width:120px;padding:0 16px 16px 0;font-family:${SANS};font-weight:600;font-size:15px;line-height:24px;color:#122460;">${txt(n.libelle, langue)}</td>\n<td class="t-encre" valign="top" style="padding:0 0 16px;font-family:${SANS};font-weight:400;font-size:16px;line-height:24px;color:#0f162d;${NUM}">${n.fort ? `<span style="font-weight:700;font-size:18px;line-height:24px;letter-spacing:0.2px;white-space:nowrap;">${valeur(n)}</span>` : valeur(n)}</td>`,
        )
        .join("\n</tr><tr>\n")}\n</tr>\n</table>`
    : "";
  return {
    h: rang(table + gris.map((g) => `<p class="t-gris" style="${GRIS}">${txt(g, langue)}</p>`).join(""), pad),
    t: [...lignes.map((n) => `${n.libelle.replace(/­/g, "")}${sep}${Array.isArray(n.valeur) ? n.valeur.join(", ") : n.valeur}`), ...gris].join("\n"),
  };
}

/** Lignes chiffrées et total (devis, commande). `valeur` : montant entier repris en data-montant / data-total. */
export function addition(lignes: Article[], total: { libelle: string; montant: string; valeur?: number }, langue: string, sep: string, pad: string): Bloc {
  const images = lignes.some((l) => l.image);
  const data = (nom: string, v?: number) => (v === undefined ? "" : ` ${nom}="${Math.round(v)}"`);
  const prix = `font-family:${SANS};font-weight:600;font-size:16px;line-height:24px;color:#0f162d;text-align:right;white-space:nowrap;${NUM}`;
  const rangs = lignes.map((l) => {
    const img = !images ? "" : `<td width="56" valign="top" style="width:56px;padding:0 14px 20px 0;">${l.image ? `<img src="${echapper(l.image.src)}" width="56" height="${Math.max(1, Math.round((56 * l.image.hauteur) / (l.image.largeur || 1)))}" alt="${echapper(l.image.alt)}" style="display:block;width:56px;height:auto;${IMG}background:#ffffff;border-radius:6px;font-family:${SANS};font-size:15px;line-height:20px;color:#3f4863;">` : ""}</td>\n`;
    const detail = l.detail ? `<p class="t-gris" style="margin:2px 0 0;font-family:${SANS};font-weight:400;font-size:15px;line-height:22px;color:#3f4863;${NUM}">${txt(l.detail, langue)}</p>` : "";
    return `${img}<td width="100%" valign="top" style="padding:0 16px 20px 0;"><p class="t-encre" style="margin:0;font-family:${SANS};font-weight:600;font-size:16px;line-height:24px;color:#0f162d;">${txt(l.titre, langue)}</p>${detail}</td>\n<td class="t-encre" valign="top" align="right"${data("data-montant", l.valeur)} style="padding:0 0 20px;${prix}">${txt(l.montant, langue)}</td>`;
  });
  const bord = "border-top:2px solid #0f162d;";
  const fin = `<tr>\n<td class="addition t-encre"${images ? ' colspan="2"' : ""} width="100%" valign="top" style="padding:16px 16px 0 0;${bord}font-family:${SANS};font-weight:700;font-size:16px;line-height:24px;color:#0f162d;">${txt(total.libelle, langue)}</td>\n<td class="addition t-encre" valign="top" align="right"${data("data-total", total.valeur)} style="padding:16px 0 0;${bord}${prix.replace("font-weight:600", "font-weight:700")}">${txt(total.montant, langue)}</td>\n</tr>`;
  return {
    h: rang(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>\n${rangs.join("\n</tr><tr>\n")}\n</tr>\n${fin}\n</table>`, pad),
    t: [...lignes.map((l) => `${l.titre}${l.detail ? ` (${l.detail})` : ""}${sep}${l.montant}`), `${total.libelle}${sep}${total.montant}`].join("\n"),
  };
}

/** Mot d'une personne (note de l'agent, message du client), filet à gauche. */
export function mot(texte: string, auteur: string | null, langue: string, pad = "8px 24px 0px"): Bloc {
  if (!texte.trim()) return vide;
  return {
    h: rang(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:2px 0 2px 18px;border-left:2px solid #dde1ea;"><p class="t-encre" style="${P}">${txt(texte, langue)}</p>${auteur ? `<p class="t-gris" style="${GRIS.replace("margin:0;", "margin:8px 0 0;")}">${txt(auteur, langue)}</p>` : ""}</td></tr></table>`, pad),
    t: `« ${texte} »${auteur ? `\n${auteur}` : ""}`,
  };
}

/** Liste en paragraphes : terme en gras, puis son texte (thèmes de la lettre). */
export function liste(items: { fort: string; texte: string }[], langue: string, sep: string, pad = "0px 24px 20px"): Bloc {
  if (!items.length) return vide;
  return {
    h: rang(items.map((x, i) => `<p class="t-encre" style="${P.replace("margin:0;", `margin:${i ? "12px 0 0" : "0"};`)}"><span style="font-weight:600;">${txt(x.fort, langue)}</span>${txt(sep, langue)}${txt(x.texte, langue)}</p>`).join(""), pad),
    t: items.map((x) => `${x.fort}${sep}${x.texte}`).join("\n"),
  };
}

export function code(valeur: string, pad = "4px 24px 32px"): Bloc {
  const v = valeur.replace(/\s+/g, "");
  const h = v.length === 6 ? `<span style="margin-right:16px;">${echapper(v.slice(0, 3))}</span><span>${echapper(v.slice(3))}</span>` : echapper(v);
  return { h: rang(`<p class="code t-encre" style="margin:0;font-family:${SANS};font-weight:700;font-size:40px;line-height:48px;letter-spacing:4px;color:#0f162d;${NUM}">${h}</p>`, pad), t: v };
}

export function fin(o: { phrase?: string | null; salutation: string; equipe: string }, langue: string, pad = "32px 24px 48px"): Bloc {
  const phrase = o.phrase ? `<p class="t-encre" style="${P.replace("margin:0;", "margin:0 0 24px;")}">${txt(o.phrase, langue)}</p>` : "";
  return {
    h: rang(`${phrase}<p class="t-encre" style="${P.replace("margin:0;", "margin:0 0 4px;")}">${txt(o.salutation, langue)}</p><p class="t-encre serif" style="margin:0;font-family:${SERIF};font-weight:600;font-size:22px;line-height:30px;color:#0f162d;">${txt(sansVeuve(o.equipe), langue)}</p>`, pad),
    t: [o.phrase, `${o.salutation}\n${o.equipe}`].filter(Boolean).join("\n\n"),
  };
}

export function pied(o: { adresse: string; email: string; raison: string; lien?: Lien | null; consigne?: string | null }, langue: string, sep: string): Bloc {
  const p = (marge: string, couleur: string, contenu: string) => `<p class="" style="margin:${marge};font-family:${SANS};font-weight:400;font-size:15px;line-height:24px;color:${couleur};">${contenu}</p>`;
  const a = (l: Lien) => `<a href="${echapper(l.href)}" style="color:#f7f1e8;text-decoration:underline;text-underline-offset:3px;">${echapper(l.libelle)}</a>`;
  const h = [
    p("0", "#f7f1e8", txt(o.adresse, langue)),
    p("0 0 12px", "#f7f1e8", a({ libelle: o.email, href: `mailto:${o.email}` })),
    p("0", "#dde1ea", txt(o.raison, langue)),
    o.consigne ? p("12px 0 0", "#dde1ea", txt(o.consigne, langue)) : "",
    o.lien ? p("12px 0 0", "#f7f1e8", a(o.lien)) : "",
  ].join("");
  return {
    h: `<tr><td class="px pied" bgcolor="#0f162d" style="padding:28px 24px 32px;background:#0f162d;">${h}</td></tr>`,
    t: ["—", o.adresse, o.email, o.raison, o.consigne, o.lien && `${o.lien.libelle}${sep}${o.lien.href}`].filter(Boolean).join("\n"),
  };
}

// ---------- document ----------
const ADAPTE = `  .px { padding-left:48px !important; padding-right:48px !important; }
  .haut { padding-top:32px !important; padding-bottom:28px !important; }
  .med { width:64px !important; height:64px !important; }
  .titre { padding-top:48px !important; }
  .phrase { font-size:42px !important; line-height:52px !important; letter-spacing:-0.6px !important; }
  .donnee { font-size:18px !important; line-height:26px !important; }
  .code { font-size:52px !important; line-height:60px !important; letter-spacing:6px !important; }
  .lbl { width:168px !important; }`;
const ENTETE = (lang: string, titre: string) => `<!doctype html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${titre}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&amp;family=Manrope:wght@400;600;700&amp;display=swap" rel="stylesheet">
<!--<![endif]-->
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
a:focus-visible { outline:2px solid #fdbf28; outline-offset:4px; }
a:active { opacity:0.8; }
h1 { overflow-wrap:break-word; text-wrap:balance; }
@media only screen and (min-width:601px) {
${ADAPTE}
}
@media (prefers-color-scheme: dark) {
  .bg { background:#0b1638 !important; }
  .t-encre { color:#f7f1e8 !important; }
  .t-gris { color:#dde1ea !important; }
  .t-lbl { color:#dde1ea !important; }
  .btn-fond { background:#f5f7fb !important; border:1px solid #122460 !important; }
  .btn-texte { color:#0f162d !important; }
  .lien { color:#f7f1e8 !important; }
  .addition { border-color:#dde1ea !important; }
  .pied { border-top:1px solid #3f4863 !important; }
  .tampon { background:#ac3215 !important; color:#0b1638 !important; }
  .clair { display:none !important; }
  .sombre { display:inline-block !important; }
}
</style>
<style>
@media screen and (prefers-reduced-motion: no-preference) {
  .trait { background:linear-gradient(#fdbf28,#fdbf28) 0 100% / 0% 6px no-repeat border-box; animation:trace 1800ms cubic-bezier(.22,1,.36,1) 500ms backwards; }
}
@keyframes trace {
  0% { border-bottom-color:transparent; background-size:0% 6px; }
  100% { border-bottom-color:transparent; background-size:100% 6px; }
}
</style>
<!--[if mso]><style>
${ADAPTE}
  body, table, td, p, a, span { font-family:Arial, sans-serif !important; }
  h1, .serif { font-family:Georgia, 'Times New Roman', serif !important; }
</style><![endif]-->
</head>`;

/** E-mail complet : en-tête (langue, objet), texte d'aperçu caché, blocs dans l'ordre ; version texte assemblée des blocs. */
export function courriel(o: { langue: string; sujet: string; apercu: string }, blocs: Bloc[]): Courriel {
  const html = `${ENTETE(o.langue.toLowerCase(), echapper(o.sujet))}
<body class="bg" bgcolor="#ffffff" style="margin:0;padding:0;width:100%;background:#ffffff;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#ffffff;">${echapper(o.apercu)}${"&#847;&zwnj;&nbsp;".repeat(36)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg" bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="bg" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;">
${blocs.map((b) => b.h).filter(Boolean).join("\n")}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
  return { sujet: o.sujet, html, texte: blocs.map((b) => b.t).filter(Boolean).join("\n\n") };
}
