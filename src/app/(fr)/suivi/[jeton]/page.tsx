import type { Metadata } from "next";
import { Suspense } from "react";
import { LienInvalide } from "@/components/suivi/LienInvalide";
import { lireDossier } from "@/lib/serveur/documents/dossier";
import { Suivi } from "@/components/suivi/Suivi";

// Suivi d'une commande par son lien secret (QR du ticket, e-mail, retour de paiement) : la commande réelle, lue en base,
// dans la langue du client. Jamais indexée (le proxy ajoute aussi l'en-tête noindex et rejette les jetons mal signés).
// Titre de l'onglet sans langue : la langue n'est connue qu'avec le dossier.
export const metadata: Metadata = { title: "Ouidah Heritage Tour", robots: { index: false, follow: false } };

type Props = { params: Promise<{ jeton: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Dossier({ params, searchParams }: Props) {
  const [{ jeton }, recherche] = await Promise.all([params, searchParams]);
  const dossier = await lireDossier(jeton);
  if (!dossier) return <LienInvalide />; // signature juste, dossier retiré : même écran (déjà en flux : statut 200)
  return <Suivi dossier={dossier} bienvenue={recherche.bienvenue === "1"} indisponible={recherche.paiement === "indisponible"} />;
}

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        // l'imprimante attend la commande : le bleu nuit du ticket, sans texte (la langue n'est pas encore connue)
        <div className="sv">
          <div aria-hidden="true" className="h-20 bg-abyss" />
          <section className="sv-haut" aria-hidden="true">
            <div className="container-oht sv-haut-grille">
              <div className="sv-imprimante">
                <div className="sv-fente" />
              </div>
            </div>
          </section>
        </div>
      }
    >
      <Dossier params={params} searchParams={searchParams} />
    </Suspense>
  );
}
