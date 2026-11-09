import { lireCatalogue } from "@/lib/boutique";
import { languePage } from "@/lib/serveur/contenu-page";
import { Cadre } from "@/components/boutique/Cadre";
import "@/components/boutique/boutique.css";

// Boutique : barre Océan, sous-navigation, tiroirs et panier communs à /boutique et aux fiches. Catalogue lu en base
// (mis en cache, étiquette « boutique »). Rendu entièrement statique : la première visite d'une adresse inconnue attend la
// page complète, pour que notFound() donne un vrai 404 (doc Next 16 : ensureStatic, « navigation »).
export const ensureStatic = "navigation";

export default async function LayoutBoutique({ children }: LayoutProps<"/boutique">) {
  const catalogue = await lireCatalogue(await languePage());
  return <Cadre catalogue={catalogue}>{children}</Cadre>;
}
