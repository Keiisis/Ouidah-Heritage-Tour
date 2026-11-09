import type { Metadata } from "next";
import { Suspense } from "react";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { Reprise } from "@/components/devis/Reprise";

// Reprise d'une demande sur un autre appareil. Le jeton n'est lu que par le navigateur, qui le remet au serveur dans le
// corps d'une requête ; la page elle-même ne dépend de rien (coquille statique). Jamais indexée.
export async function generateMetadata(): Promise<Metadata> {
  const T = await lireContenu("fr.devisPage");
  return { title: T.reprendre.metaTitre, robots: { index: false, follow: false } };
}

async function Jeton({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  return <Reprise jeton={jeton} />;
}

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const T = await lireContenu("fr.devisPage");
  return (
    <div className="bg-white text-abyss">
      <div aria-hidden="true" className="h-20 bg-abyss" />
      <section className="container-oht flex min-h-[70svh] flex-col justify-center py-24">
        <Suspense fallback={<p className="font-display text-[32px] md:text-[44px]">{T.reprendre.chargement}</p>}>
          <Jeton params={params} />
        </Suspense>
      </section>
    </div>
  );
}
