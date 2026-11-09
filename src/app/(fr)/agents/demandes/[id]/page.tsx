import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T } from "@/content/espace";
import { EcranDemandes } from "@/components/espace/EcranDemandes";

// Dossier d'une demande (lot L4), à son adresse propre : la liste des demandes et le tiroir du dossier ouvert. L'identifiant
// est une donnée de la requête (aucun generateStaticParams) : il n'est lu que sous <Suspense>, avec la session. Un dossier
// qui n'est pas celui de l'agent connecté, ou un identifiant forgé, rend la page introuvable (notFound). Jamais indexé.
export const metadata: Metadata = { title: `${T.dossier.titre} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}>{params.then(({ id }) => <EcranDemandes role="agents" ouvert={id} />)}</Suspense>;
}
