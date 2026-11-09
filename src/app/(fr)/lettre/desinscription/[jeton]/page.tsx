import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Desinscription } from "@/components/espace/messages/Desinscription";
import { lireJetonLettre } from "@/lib/serveur/equipe/messages/envoi";
import { lireAbonne } from "@/lib/serveur/equipe/messages/lectures";
import { masquer } from "@/lib/serveur/equipe/messages/rendu";

// Désinscription de La lettre de Ouidah par le lien personnel de chaque numéro (lot L6). Jeton signé (HMAC) : un jeton
// faux ou inconnu donne la page introuvable. L'abonné est lu à la requête, sous <Suspense>. Jamais indexée.
export const metadata: Metadata = { title: "Ouidah Heritage Tour", robots: { index: false, follow: false } };

type Props = { params: Promise<{ jeton: string }> };

async function Contenu({ params }: Props) {
  const { jeton } = await params;
  const id = lireJetonLettre(jeton);
  if (!id) notFound();
  const a = await lireAbonne(id);
  if (!a) notFound();
  return <Desinscription jeton={jeton} langue={a.langue} email={masquer(a.email)} deja={a.desinscrit} />;
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Contenu params={params} />
    </Suspense>
  );
}
