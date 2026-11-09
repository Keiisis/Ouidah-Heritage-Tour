import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { lireDossier } from "@/lib/serveur/documents/dossier";
import { contexteSignature } from "@/lib/serveur/documents/signature";
import { Signer } from "@/components/suivi/signer/Signer";

// Signature en ligne du devis par son lien secret de suivi (maquette E validée, 03/11/2026). Seul un devis publié et prêt
// se signe ; un devis déjà signé montre son état « Signé » (même réglé ensuite). Jamais indexée (le proxy rejette aussi
// les jetons mal signés et ajoute l'en-tête noindex). Titre de l'onglet sans langue : elle n'est connue qu'avec le dossier.
export const metadata: Metadata = { title: "Ouidah Heritage Tour", robots: { index: false, follow: false } };

type Props = { params: Promise<{ jeton: string }> };

async function Contenu({ params }: Props) {
  const { jeton } = await params;
  await connection(); // validité du devis : date du jour à chaque requête
  const [dossier, contexte, h] = await Promise.all([lireDossier(jeton), contexteSignature(jeton), headers()]);
  if (!dossier || !contexte || dossier.cas !== "pret" || !dossier.devis || dossier.document?.type !== "devis") notFound();
  if (dossier.statut !== "pret" && !contexte.signature) notFound();
  const hote = (h.get("x-forwarded-host") ?? h.get("host") ?? "ouidahheritagetour.bj").replace(/^www\./, "");
  return <Signer dossier={{ ...dossier, devis: dossier.devis, document: dossier.document }} contexte={contexte} hote={hote} />;
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-20 bg-abyss" />}>
      <Contenu params={params} />
    </Suspense>
  );
}
