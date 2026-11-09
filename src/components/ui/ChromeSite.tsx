import type { ReactNode } from "react";
import "./chrome-site.css";

// Habillage du site (ouverture, en-tête, pied de page, consentement). Sur les espaces de l'équipe (/agents, /admins),
// la page porte [data-espace-equipe] et le CSS masque cet habillage : aucun usePathname, donc aucune donnée d'adresse
// lue dans le layout racine (avec cacheComponents, elle bloquerait le prérendu des routes à paramètre).
export function ChromeSite({ children }: { children: ReactNode }) {
  return <div className="chrome-site">{children}</div>;
}
