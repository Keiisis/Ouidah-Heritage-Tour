import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { lireContenu } from "@/lib/contenu";
import { lienDuJeton, marquerOuvert } from "@/lib/serveur/equipe/finances/public";
import { passerellesActives } from "@/lib/serveur/paiement";
import { langueDoc } from "@/lib/suivi";
import { Payer } from "./Payer";
import "./payer.css";

// Page publique d'un lien de paiement (lot L7) : le lien réel, lu en base par son jeton signé, dans la langue du client.
// Le montant est le total du devis fixé à la création du lien ; seules les passerelles proposées par le lien ET actives
// sont offertes. Jamais indexée. Jeton faux ou lien inconnu : 404. Titre de l'onglet sans langue (inconnue avant le lien).
export const metadata: Metadata = { title: "Ouidah Heritage Tour", robots: { index: false, follow: false } };

type Props = { params: Promise<{ jeton: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Lien({ params, searchParams }: Props) {
  const [{ jeton }, recherche] = await Promise.all([params, searchParams]);
  const l = await lienDuJeton(jeton);
  if (!l) notFound();
  if (l.etat === "cree" || l.etat === "envoye") await marquerOuvert(l.id);
  const actives = l.etat === "paye" ? [] : await passerellesActives();
  const langue = langueDoc(l.langue);
  const copiesDocuments = await lireContenu("documents.copiesDocuments");
  const intl = copiesDocuments[langue].intl;
  const un = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  // transaction rendue par la passerelle au retour (Stripe, Flutterwave, Paystack, FedaPay) : un indice, relu par le serveur
  const transaction = un(recherche.session) ?? un(recherche.transaction_id) ?? un(recherche.reference) ?? un(recherche.id);
  return (
    <Payer
      jeton={jeton}
      langue={langue}
      montant={new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(l.montant)}
      euros={new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(l.montant / 655.957)}
      expire={new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Porto-Novo" }).format(Date.parse(l.expire))}
      client={l.client}
      reference={l.numero ?? l.reference}
      etat={l.etat === "paye" ? "paye" : l.etat === "expire" || l.etat === "annule" ? "fini" : "ouvert"}
      passerelles={l.passerelles.filter((p) => (actives as string[]).includes(p))}
      transaction={transaction}
      suivi={l.suivi}
    />
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<div className="py" aria-hidden="true" />}>
      <Lien {...props} />
    </Suspense>
  );
}
