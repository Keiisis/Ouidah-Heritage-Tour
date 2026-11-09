import { metadonneesPage } from "@/lib/serveur/seo";
import { Hero } from "@/components/home/Hero";
import { Welcome } from "@/components/home/Welcome";
import { PlacesMap } from "@/components/home/PlacesMap";
import { Reasons } from "@/components/home/Reasons";
import { Chemins } from "@/components/home/Chemins";
import { KeyDates } from "@/components/home/KeyDates";
import { TenReasons } from "@/components/home/TenReasons";
import { Strip } from "@/components/home/Strip";
import { Concierge } from "@/components/home/Concierge";
import { Testimonials } from "@/components/home/Testimonials";
import { Prepare } from "@/components/home/Prepare";
import { FinalCta } from "@/components/home/FinalCta";
import { Newsletter } from "@/components/home/Newsletter";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";

// Accueil : sections 2 à 14 (l'en-tête et le pied de page sont dans le layout).
export default async function Home() {
  const [destinations, releve] = await Promise.all([lireContenu("fr.destinations"), lireContenu("lieux-ouidah")]);
  // Compteurs du contenu publié, sans charger tout le relevé dans le composant client.
  const totalLieux = destinations.length + releve.lieux.filter((l) => !l.destination).length;
  const comptes: Record<string, number> = {};
  for (const l of releve.lieux) for (const k of [l.categorie, `${l.categorie}/${l.sous_type}`]) comptes[k] = (comptes[k] ?? 0) + 1;
  return (
    <>
      <Hero />
      <Welcome />
      <PlacesMap />
      <Reasons />
      <Chemins totalLieux={totalLieux} />
      <KeyDates />
      <TenReasons />
      <Strip />
      <Concierge comptes={comptes} />
      <Testimonials />
      <Prepare />
      <FinalCta />
      <Newsletter />
    </>
  );
}

export async function generateMetadata() { return metadonneesPage("/"); }
