import { espace as T } from "@/content/espace";
import { finances as F } from "@/content/espace-finances";
import { lire } from "@/lib/serveur/equipe/finances/lectures";
import { classeurExcel } from "@/lib/serveur/equipe/finances/excel";
import { aujourdhuiOuidah, bornesMois, csv, enXof, moisCourant, moisValide } from "@/lib/serveur/equipe/finances/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";

// Exports CSV d'un mois (admin seulement) : encaissements (passerelles, liens payés, paiements manuels confirmés, avec
// mode, référence, payeur et justificatif), dépenses, factures et avoirs. Séparateur « ; » et BOM UTF-8 : Excel les ouvre
// tels quels. Montants en FCFA ; un paiement reçu en euros garde aussi son montant d'origine.
const mode = (m: string) => (T.modes as Record<string, string>)[m] ?? (F.modesDepense as Record<string, string>)[m] ?? m;
type Cellules = (string | number | null)[][];

async function toutes<T>(requete: string): Promise<T[] | null> {
  const lignes: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await lire<T>(`${requete}&limit=1000&offset=${offset}`);
    if (!page) return null;
    lignes.push(...page);
    if (page.length < 1000) return lignes;
  }
}

async function encaissements(b: ReturnType<typeof bornesMois>): Promise<Cellules | null> {
  const [resas, liens, manuels] = await Promise.all([
    toutes<{ paye_le: string; passerelle: string; montant: number; montant_recu: number | null; transaction_id: string | null; nom: string }>(`reservations?select=paye_le,passerelle,montant,montant_recu,transaction_id,nom&statut=eq.paye&reglement_manuel=is.false&paye_le=gte.${encodeURIComponent(b.debut)}&paye_le=lt.${encodeURIComponent(b.fin)}&order=paye_le.asc,id.asc`),
    toutes<{ paye_le: string; passerelle: string; montant: number; transaction_id: string | null; demande: { nom: string | null } | null }>(`liens_paiement?select=paye_le,passerelle,montant,transaction_id,demande:demandes(nom)&paye_le=gte.${encodeURIComponent(b.debut)}&paye_le=lt.${encodeURIComponent(b.fin)}&order=paye_le.asc,id.asc`),
    toutes<{ recu_le: string; mode: string; montant: number; devise: string; reference: string | null; payeur: string | null; justificatif_id: string | null; inverse_de: string | null; facture: { numero: string } | null }>(`paiements_manuels?select=recu_le,mode,montant,devise,reference,payeur,justificatif_id,inverse_de,facture:factures!paiements_manuels_facture_id_fkey(numero)&etat=eq.confirme&recu_le=gte.${b.jourDebut}&recu_le=lt.${b.jourFin}&order=recu_le.asc,id.asc`),
  ]);
  if (!resas || !liens || !manuels) return null;
  return [
    ["date", "mode", "montant_fcfa", "devise_origine", "montant_origine", "reference", "payeur", "justificatif", "facture", "ecriture"],
    ...resas.map((r) => [aujourdhuiOuidah(Date.parse(r.paye_le)), mode(r.passerelle), r.montant_recu ?? r.montant, "XOF", r.montant_recu ?? r.montant, r.transaction_id, r.nom, null, null, "reservation"]),
    ...liens.map((l) => [aujourdhuiOuidah(Date.parse(l.paye_le)), mode(l.passerelle), l.montant, "XOF", l.montant, l.transaction_id, l.demande?.nom ?? null, null, null, "lien"]),
    ...manuels.map((p) => [p.recu_le, mode(p.mode), enXof(p.montant, p.devise), p.devise, p.devise === "EUR" ? p.montant / 100 : p.montant, p.reference, p.payeur, p.justificatif_id, p.facture?.numero ?? null, p.inverse_de ? "inverse" : "manuel"]),
  ];
}

async function depenses(b: ReturnType<typeof bornesMois>): Promise<Cellules | null> {
  const d = await toutes<{ jour: string; libelle: string; mode: string; montant: number; justificatif_id: string }>(`depenses?select=jour,libelle,mode,montant,justificatif_id&jour=gte.${b.jourDebut}&jour=lt.${b.jourFin}&order=jour.asc,id.asc`);
  return d ? [["date", "libelle", "mode", "montant_fcfa", "justificatif"], ...d.map((x) => [x.jour, x.libelle, mode(x.mode), x.montant, x.justificatif_id])] : null;
}

async function documents(b: ReturnType<typeof bornesMois>): Promise<Cellules | null> {
  const periode = `cree_le=gte.${encodeURIComponent(b.debut)}&cree_le=lt.${encodeURIComponent(b.fin)}&order=cree_le.asc,id.asc`;
  const [factures, avoirs] = await Promise.all([
    toutes<{ numero: string; cree_le: string; client: { nom: string }; montant: number }>(`factures?select=numero,cree_le,client,montant&${periode}`),
    toutes<{ numero: string; cree_le: string; montant: number; motif: string; facture: { numero: string; client: { nom: string } } }>(`avoirs?select=numero,cree_le,montant,motif,facture:factures(numero,client)&${periode}`),
  ]);
  if (!factures || !avoirs) return null;
  return [
    ["numero", "date", "client", "total_fcfa", "avoirs_fcfa", "document_origine", "type", "motif"],
    ...factures.map((f) => [f.numero, aujourdhuiOuidah(Date.parse(f.cree_le)), f.client.nom, f.montant, null, null, "facture", null]),
    ...avoirs.map((a) => [a.numero, aujourdhuiOuidah(Date.parse(a.cree_le)), a.facture.client.nom, null, a.montant, a.facture.numero, "avoir", a.motif]),
  ];
}

export async function GET(req: Request) {
  const s = await exigerRole("admins");
  if (!s) return new Response(null, { status: 403 });
  const u = new URL(req.url);
  const mois = u.searchParams.get("mois") ?? moisCourant(Date.now());
  const quoi = u.searchParams.get("quoi") ?? "";
  const format = u.searchParams.get("format") ?? "csv";
  if (!moisValide(mois) || !["csv", "xlsx"].includes(format) || (format === "csv" && !["encaissements", "depenses", "factures"].includes(quoi))) return new Response(null, { status: 400 });
  const b = bornesMois(mois);
  if (format === "xlsx") {
    const [enc, dep, doc] = await Promise.all([encaissements(b), depenses(b), documents(b)]);
    if (!enc || !dep || !doc) return new Response(null, { status: 503 });
    return new Response(classeurExcel([{ nom: "Encaissements", lignes: enc }, { nom: "Dépenses", lignes: dep }, { nom: "Factures et avoirs", lignes: doc }]), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="oht-comptabilite-${mois}.xlsx"`,
      "cache-control": "private, no-store", "x-content-type-options": "nosniff",
    } });
  }
  let lignes: Cellules | null;
  if (quoi === "encaissements") lignes = await encaissements(b);
  else if (quoi === "depenses") lignes = await depenses(b);
  else lignes = await documents(b);
  if (!lignes) return new Response(null, { status: 503 });
  return new Response(csv(lignes), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="oht-${quoi}-${mois}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
