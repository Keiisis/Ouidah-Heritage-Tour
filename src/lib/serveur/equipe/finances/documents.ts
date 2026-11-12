import "server-only";
import { copiesFacture, modesClient } from "@/content/espace-finances";
import { lireContenu } from "@/lib/contenu";
import { iso } from "@/lib/jours";
import { langueDoc, type Dossier, type LangueDoc } from "@/lib/suivi";
import { echapper } from "../../courriel";
import { emettre } from "../../documents/emettre";
import { jetonSuivi } from "../../documents/jeton";
import { rendrePdf } from "../../documents/pdf";
import type { Facture, Reglages } from "./lectures";
import { lire, virementActif } from "./lectures";
import { taxeDocument } from "./fiscalite-regles";

// Documents du lot « finances » rendus avec les modules partagés de la session documents (appel seulement) : le reçu de
// paiement R- d'une facture payée (numéro emettre("R", "devis", …), PDF rendrePdf, dans la langue du client) et l'e-mail
// de facture, lui aussi dans la langue du client. Les PDF F-/A- sont construits dans finances/pdf.ts.

type Info = { libelle: string; valeur: string | string[] | null; visible: boolean };
/** Mentions publiques de l'agence (legal.json, en respectant « visible ») ; jamais le siège privé, la direction ni le capital. */
export async function mentionsAgence(): Promise<string[]> {
  const societe = (await lireContenu("legal")).societe as Record<string, Info>;
  const info = (cle: string) => {
    const i = societe[cle];
    if (!i?.visible || i.valeur === null) return null;
    const v = Array.isArray(i.valeur) ? i.valeur.map((x) => x.trim()).filter(Boolean).join(" · ") : String(i.valeur).trim();
    return v || null;
  };
  const avec = (cle: string) => {
    const v = info(cle);
    return v ? `${societe[cle].libelle} ${v}` : null;
  };
  return [[info("denomination"), info("forme")].filter(Boolean).join(", "), [info("quartier"), info("ville")].filter(Boolean).join(", "), avec("rccm"), avec("ifu"), info("carte"), info("email"), info("telephones")].filter((x): x is string => Boolean(x));
}

type BrutDemande = { id: string; intention: "voyage" | "groupe" | "question"; circuit: string | null; dossier: { sejour?: { arrivee: number; depart: number } | null } | null; reponses: { adultes?: number; enfants?: number } | null };

/** Reçu R- d'une facture payée, en PDF dans la langue du client ; null si la facture n'est pas payée ou si la base ne répond pas. */
export async function pdfRecu(f: Facture, origine: string | null): Promise<{ pdf: Uint8Array<ArrayBuffer>; numero: string } | null> {
  if (f.statut !== "payee") return null;
  const tours = await lireContenu("fr.tours");
  const [d] = (await lire<BrutDemande>(`demandes?select=id,intention,circuit,dossier,reponses&id=eq.${f.demande}&limit=1`)) ?? [];
  if (!d) return null;
  const [ticket, recu, enLigne, datesSection] = await Promise.all([
    emettre("T", "demande", d.id),
    emettre("R", "devis", f.devis),
    lire<{ passerelle: string; transaction_id: string }>(`liens_paiement?select=passerelle,transaction_id&facture_id=eq.${f.id}&paye_le=not.is.null&order=paye_le.asc`),
    lireContenu("fr.datesSection"),
  ]);
  if (!ticket || !recu || !enLigne) return null;
  const langue = langueDoc(f.client.langue);
  const confirmes = f.paiements.filter((p) => p.etat === "confirme" && !p.inverse);
  // paiement en ligne (lien payé) : la passerelle et sa transaction, jamais « virement » par défaut
  const passerelles = datesSection.talon.passerelles as Record<string, { nom: string }>;
  const moyens = [...new Set([...confirmes.map((p) => modesClient[langue][p.mode]), ...enLigne.map((l) => passerelles[l.passerelle]?.nom ?? l.passerelle)])];
  const refs = [...confirmes.map((p) => p.reference), ...enLigne.map((l) => l.transaction_id)].filter((r): r is string => Boolean(r));
  const sejour = d.dossier?.sejour ?? null;
  const dossier: Dossier = {
    jeton: jetonSuivi("d", d.id) ?? "",
    cas: "paiement",
    langue,
    reference: `DEM-${d.id.slice(0, 6).toUpperCase()}`,
    ticket: { numero: ticket.numero, date: ticket.cree_le },
    client: { nom: f.client.nom, email: f.client.email },
    objet: { type: "voyage", intention: d.intention, circuit: d.circuit ? (tours.find((t) => t.slug === d.circuit)?.title ?? null) : null, arrivee: sejour ? iso(sejour.arrivee) : null, depart: sejour ? iso(sejour.depart) : null, adultes: d.reponses?.adultes ?? 0, enfants: d.reponses?.enfants ?? 0 },
    statut: "paye",
    montant: { valeur: f.recu, devise: "XOF" },
    fiscalite: taxeDocument(f.fiscalite, f.recu),
    paiement: { passerelle: moyens.join(" + ") || modesClient[langue].virement, le: f.payee ?? recu.cree_le, transaction: refs.join(", ") || null },
    document: { type: "recu", numero: recu.numero, date: recu.cree_le, url: "" },
    devis: null,
    billets: [],
    lie: null,
  };
  // sans jeton de suivi (secret absent), aucun QR n'est dessiné : l'origine est retirée
  return { pdf: await rendrePdf(dossier, dossier.jeton ? origine : null), numero: recu.numero };
}

/** E-mail de facture dans la langue du client : lignes, total, avoirs, reste à payer, coordonnées de virement si saisies. */
export async function courrielFacture(f: Facture, r: Reglages | null) {
  const [mentions, copiesDocuments] = await Promise.all([mentionsAgence(), lireContenu("documents.copiesDocuments")]);
  const langue: LangueDoc = langueDoc(f.client.langue);
  const c = copiesFacture[langue];
  const d = copiesDocuments[langue];
  const nombre = new Intl.NumberFormat(d.intl, { maximumFractionDigits: 0 });
  const somme = (n: number) => `${nombre.format(n)} FCFA`;
  const date = new Intl.DateTimeFormat(d.intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Porto-Novo" }).format(Date.parse(f.emise));
  const avoirs = f.avoirs.reduce((t, a) => t + a.montant, 0);
  const virement = virementActif(r) && r
    ? [[c.titulaire, r.titulaire], [c.banque, r.banque], [c.iban, r.iban], [c.bic, r.bic]].filter((x): x is [string, string] => Boolean(x[1]))
    : [];
  const mobile = r?.mobile ?? [];
  const sujet = c.sujet(f.numero);
  const e = echapper;
  const p = (t: string, gras = false) => `<p style="margin:0 0 12px;font:${gras ? "700 " : ""}15px/1.55 Arial,sans-serif;color:#0f162d">${e(t)}</p>`;
  const td = (t: string, droite = false, gras = false) => `<td style="padding:8px 6px;border-bottom:1px solid #dde1ea;font:${gras ? "700 " : ""}14px/1.4 Arial,sans-serif;color:#0f162d;${droite ? "text-align:right;white-space:nowrap" : ""}">${e(t)}</td>`;
  const lignes = f.lignes.map((l) => `<tr>${td(l.libelle)}${td(nombre.format(l.quantite), true)}${td(somme(l.prix_unitaire), true)}${td(somme(l.quantite * l.prix_unitaire), true)}</tr>`).join("");
  const totaux = [[c.total, somme(f.montant)], ...(avoirs ? [[c.avoirs, `− ${somme(avoirs)}`], [c.reste, somme(f.net)]] : [])];
  const html = [
    `<!doctype html><html lang="${d.langue}"><body style="margin:0;padding:24px;background:#ffffff"><div style="max-width:600px;margin:0 auto">`,
    p(c.bonjour(f.client.nom)),
    p(c.intro),
    `<p style="margin:16px 0 4px;font:700 20px/1.3 Georgia,serif;color:#0f162d">${e(`${c.facture} ${f.numero}`)}</p>`,
    p(`${c.date}${d.sep}${date}`),
    `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 16px"><tr>${td(d.designation, false, true)}${td(d.quantite, true, true)}${td(d.prixUnitaire, true, true)}${td(d.montant.recu, true, true)}</tr>${lignes}</table>`,
    totaux.map(([k, v]) => p(`${k}${d.sep}${v}`, true)).join(""),
    p(c.sansAcompte),
    virement.length || mobile.length ? `<p style="margin:20px 0 8px;font:700 16px/1.3 Arial,sans-serif;color:#0f162d">${e(c.virement)}</p>${[...virement.map(([k, v]) => `${k}${d.sep}${v}`), ...mobile.map((m) => `${c.mobile}${d.sep}${m}`)].map((t) => p(t)).join("")}${p(c.reference(f.numero))}` : "",
    p(c.fin),
    `<p style="margin:24px 0 0;font:12px/1.5 Arial,sans-serif;color:#3f4863">${mentions.map(e).join(" · ")}</p>`,
    "</div></body></html>",
  ].join("");
  const texte = [
    c.bonjour(f.client.nom),
    c.intro,
    `${c.facture} ${f.numero} · ${date}`,
    ...f.lignes.map((l) => `${l.libelle} · ${nombre.format(l.quantite)} × ${somme(l.prix_unitaire)} = ${somme(l.quantite * l.prix_unitaire)}`),
    ...totaux.map(([k, v]) => `${k}${d.sep}${v}`),
    c.sansAcompte,
    ...(virement.length || mobile.length ? [c.virement, ...virement.map(([k, v]) => `${k}${d.sep}${v}`), ...mobile.map((m) => `${c.mobile}${d.sep}${m}`), c.reference(f.numero)] : []),
    c.fin,
    mentions.join(" · "),
  ].join("\n\n");
  return { sujet, html, texte, langue };
}
