import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { FicheCircuit } from "@/components/fiches/circuit/FicheCircuit";
import { ficheDe, slugsCircuits } from "@/components/fiches/circuit/fiche";

// Fiche circuit : les circuits publiés sont pré-rendus ; les nouvelles adresses sont générées à leur première visite.
// Tant qu'un circuit est en brouillon (durée et prix à saisir dans les tableaux
// de bord), elle n'est pas indexée et aucun lien n'y mène (adresseCircuit renvoie vers /devis). Slug inconnu : page introuvable.
// Attendre le rendu complet des nouvelles adresses pour renvoyer le bon statut HTTP dès leur première visite.
export const instant = false;
export const ensureStatic = "navigation";
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await slugsCircuits();
  return (slugs.length ? slugs : ["__vide__"]).map((slug) => ({ slug }));
}

async function metadataContenu({ params }: Props): Promise<Metadata> {
  const f = await ficheDe((await params).slug);
  if (!f) return {};
  const T = await lireContenu("fiche-circuit.ficheCircuit");
  return { title: T.metaTitre(f.circuit.title), description: f.description, ...(f.brouillon ? { robots: { index: false } } : {}) };
}

export default async function Page({ params }: Props) {
  const f = await ficheDe((await params).slug);
  if (!f) notFound();
  return <FicheCircuit f={f} />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  const { slug } = await args[0].params;
  return metadonneesPage("/circuits/[slug]".replace("[slug]", encodeURIComponent(slug)), await metadataContenu(...args));
}
