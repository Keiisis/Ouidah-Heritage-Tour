import type { Metadata } from "next";
import { SECTIONS, adresseAgence, adresseCircuit, adresseLieu } from "@/content/fr";
import { lireContenu as lireContenuLangue } from "@/lib/contenu";
import { languePage, lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import type { Langue } from "@/lib/langue";
import { Introuvable, type Cible, type Entree } from "@/components/introuvable/Introuvable";

// Page introuvable (adresse inconnue ou notFound() d'une fiche) : Next y ajoute lui-même <meta name="robots" content="noindex">.
export async function generateMetadata(): Promise<Metadata> {
  const T = await lireContenu("introuvable.introuvable");
  return { title: T.metaTitre, description: T.metaDescription };
}

/** Propositions et index de recherche de la page introuvable, dans une langue. Partagé avec global-not-found (adresse hors
 * de tout layout racine : pas de paramètre de langue, français). */
export async function IntrouvableComplet({ langue }: { langue: Langue }) {
  const lire = <K extends Parameters<typeof lireContenuLangue>[0]>(cle: K) => lireContenuLangue(cle, langue);
  const [T, FICHES_LIEU, destinations, tours, releve, equipe, nav] = await Promise.all([
    lire("introuvable.introuvable"), lire("fr.FICHES_LIEU"),
    lire("fr.destinations"), lire("fr.tours"), lire("lieux-ouidah"),
    lire("fr.equipe"), lire("fr.nav"),
  ]);
  const agence = nav.primary.find((l) => l.href === "#agence")?.sous?.find((l) => l.href === SECTIONS.agence || l.href === "/a-propos");
  // adresses réellement publiées : pages fixes, fiches de lieu, circuits publiés, Qui sommes-nous quand il est en ligne
  const cibles: Cible[] = [
    ...T.pages.map((p) => ({ titre: p.titre, href: p.href, type: T.types.page, image: null })),
    { titre: T.boutique.titre, href: T.boutique.href, type: T.types.page, image: null },
    ...(agence && adresseAgence(equipe).startsWith("/a-propos") ? [{ titre: agence.label, href: "/a-propos", type: T.types.page, image: null }] : []),
    ...destinations.flatMap((d) => { const href = adresseLieu(d.slug, FICHES_LIEU); return href ? [{ titre: d.name, href, type: T.types.lieu, image: d.image?.src ?? FICHES_LIEU[d.slug]?.photo?.src ?? null }] : []; }),
    ...tours.flatMap((c) => { const href = adresseCircuit(c.slug, tours); return href.startsWith("/circuits/") ? [{ titre: c.title, href, type: T.types.circuit, image: c.image?.src ?? null }] : []; }),
  ];
  // recherche : les adresses ci-dessus + les 232 adresses relevées (sans fiche : section « Votre chemin » de l'accueil)
  const avecFiche = new Set(destinations.filter((d) => adresseLieu(d.slug, FICHES_LIEU)).map((d) => d.slug));
  const index: Entree[] = [
    ...cibles.map((c) => ({ nom: c.titre, type: c.type, href: c.href })),
    ...releve.lieux.filter((l) => !(l.destination && avecFiche.has(l.destination))).map((l) => ({ nom: l.nom, type: l.sous_type || T.types.adresse, href: SECTIONS.circuits })),
  ];
  return <Introuvable cibles={cibles} index={index} />;
}

export default async function NotFound() {
  return <IntrouvableComplet langue={await languePage()} />;
}
