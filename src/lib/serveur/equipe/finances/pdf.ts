import "server-only";
import { langueDoc } from "@/lib/suivi";
import { rendrePdf, type CertificationPdf, type DossierPdf } from "../../documents/pdf";
import { lireConfirmee } from "../../emcf/operations";
import { validerDemandeEmcf } from "../../emcf/client";
import type { MentionsDoc } from "../../documents/mentions";
import type { Facture } from "./lectures";
import { taxeDocument, type VentilationTva } from "./fiscalite-regles";

/** F-/A- : données figées à l’émission, sans relire le devis, le dossier ou les prix actuels. */
export async function pdfFinancier(f: Facture, avoirId?: string): Promise<{ pdf: Uint8Array<ArrayBuffer>; numero: string } | null> {
  const a = avoirId === undefined ? null : f.avoirs.find((x) => x.id === avoirId);
  if (avoirId !== undefined && !a) return null;
  let numero = a?.numero ?? f.numero;
  let date = a?.cree ?? f.emise;
  const montant = a?.montant ?? f.montant;
  let lignes = a
    ? [{ libelle: a.motif, quantite: 1, prixUnitaire: a.montant }]
    : f.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixUnitaire: l.prix_unitaire }));
  let langue = langueDoc(f.client.langue);
  let reference = a ? f.numero : `DEM-${f.demande.slice(0, 6).toUpperCase()}`;
  let client = { nom: f.client.nom, email: f.client.email };
  let fiscalite = taxeDocument(f.fiscalite, montant);
  let emcf: CertificationPdf | undefined;
  // Une panne de lecture ne doit jamais convertir silencieusement une facture certifiée en reçu.
  const operation = await lireConfirmee(f.id, avoirId);
  if (operation) {
    const { identite: i, requete, calcul, securite } = operation;
    const champs = ["raisonSociale", "forme", "adresse", "ifu", "rccm", "telephone", "email", "pied", "mentions", "signataire", "fonction"] as const;
    const taxe = i.fiscalite as VentilationTva | null;
    if (operation.environnement !== "production" || operation.etat !== "confirmee"
      || !validerDemandeEmcf(requete) || !calcul || !securite || calcul.uid !== operation.uid
      || calcul.total !== montant || !Number.isSafeInteger(calcul.total)
      || !champs.every((cle) => i[cle] === null || typeof i[cle] === "string")
      || !i.raisonSociale || i.ifu !== requete.ifu || i.ifu !== operation.ifu || i.nim !== securite.nim
      || i.documentNumero !== numero || typeof i.documentDate !== "string" || !Number.isFinite(Date.parse(i.documentDate))
      || typeof i.documentReference !== "string" || !i.documentReference
      || typeof i.langue !== "string" || !["FR", "EN", "ES", "DE", "PT", "HT", "GCF"].includes(i.langue)
      || !requete.client?.name || typeof requete.client.contact !== "string"
      || !(a ? ["FA", "EA"] : ["FV", "EV"]).includes(requete.type)
      || a && !requete.reference
      || !requete.items.every((l) => Number.isSafeInteger(l.price * l.quantity))
      || requete.items.reduce((total, l) => total + l.price * l.quantity, 0) !== montant
      || taxe !== null && (!taxe || typeof taxe.tva_active !== "boolean" || !Number.isFinite(taxe.tva_taux)
        || taxe.tva_taux < 0 || taxe.tva_taux > 100
        || ![taxe.ht, taxe.tva, taxe.ttc].every((v) => Number.isSafeInteger(v) && v >= 0)
        || taxe.ttc !== montant || taxe.ht + taxe.tva !== montant)) throw new Error("emcf_document_incoherent");
    const mentions = Object.fromEntries(champs.map((cle) => [cle, i[cle]])) as Omit<MentionsDoc, "signature" | "cachet">;
    emcf = { environnement: "production", etat: "confirmee", requete, calcul, securite, identite: { ...mentions, signature: null, cachet: null } };
    numero = i.documentNumero;
    date = i.documentDate;
    reference = i.documentReference;
    langue = langueDoc(i.langue);
    client = { nom: requete.client.name, email: requete.client.contact };
    lignes = requete.items.map((l) => ({ libelle: l.name, quantite: l.quantity, prixUnitaire: l.price }));
    fiscalite = taxeDocument(taxe, montant);
  }
  const dossier: DossierPdf = {
    jeton: "", cas: "pret", langue, reference,
    ticket: { numero, date }, client,
    objet: { type: "voyage", intention: "voyage", circuit: null, arrivee: null, depart: null, adultes: 0, enfants: 0 },
    statut: "pret", montant: { valeur: montant, devise: "XOF" }, paiement: null,
    fiscalite,
    document: { type: a ? "avoir" : "facture", numero, date, url: "" },
    devis: { lignes, montant, valableJusquAu: null, note: null }, billets: [], lie: null, emcf,
  };
  return { pdf: await rendrePdf(dossier, null), numero };
}
