import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Fraunces, Manrope } from "next/font/google";
import "@/app/globals.css";
import type { ReactNode } from "react";
import type { Langue } from "@/lib/langue";
import { variablesTheme } from "@/lib/theme";
import { lireContenu, surchargesPubliques } from "@/lib/contenu";
import { Providers } from "@/components/ui/Providers";
import { Ouverture, scriptOuverture } from "@/components/ui/Ouverture";
import { Consentement } from "@/components/ui/Consentement";
import { AssistantSite } from "@/components/assistant/AssistantSite";
import { Mesure } from "@/components/mesure/Mesure";
import { Header } from "@/components/home/Header";
import { Footer } from "@/components/home/Footer";
import { boutiqueOuverte } from "@/lib/boutique";
import { articlesPublies } from "@/lib/serveur/blog/public";
import { ChromeSite } from "@/components/ui/ChromeSite";
import { ContenuSite } from "@/components/ui/ContenuSite";

// Polices OHT : Fraunces pour les titres, Manrope pour le texte (licences OFL, polices variables).
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin", "latin-ext"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "latin-ext"], display: "swap" });

export const metadata: Metadata = {
  title: "Ouidah Heritage Tour — Marchez sur les traces de vos ancêtres",
  description: "Agence de tourisme mémoriel et culturel à Ouidah, Bénin : la Route des Esclaves, le Temple des Pythons, la Porte du Non-Retour, avec des guides de Ouidah.",
};

// Année du pied de page, recalculée une fois par jour (rendu statique sans date figée).
async function annee() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export default async function DocumentSite({ children, langue = "FR" }: { children: ReactNode; langue?: Langue }) {
  // catalogue et articles mis en cache (étiquettes « boutique » et « blog ») : le lien n'apparaît qu'avec du contenu publié
  const [year, boutique, blog, valeurs, nav, theme] = await Promise.all([
    annee(), boutiqueOuverte(), articlesPublies(langue).then((r) => r.total > 0, () => false),
    surchargesPubliques(langue), lireContenu("fr.nav", langue), lireContenu("site.theme"),
  ]);
  return (
    // suppressHydrationWarning : le script de <head> pose data-ouverture sur <html> avant l'hydratation
    <html lang={langue.toLowerCase()} className={`${fraunces.variable} ${manrope.variable}`} style={variablesTheme(theme)} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: scriptOuverture }} />
        <a href="#contenu" className="label sr-only z-[60] bg-laterite px-4 py-3 text-ivory focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          {nav.skip}
        </a>
        <Providers>
          {/* contenu publié depuis l'espace de l'équipe (rubriques modifiées seulement), lu par useContenu */}
          <ContenuSite valeurs={valeurs} langue={langue}>
          {/* /agents et /admins : écran de connexion seul, sans l'habillage du site (ChromeSite) */}
          <ChromeSite>
            <Ouverture />
            <Header boutique={boutique} blog={blog} />
          </ChromeSite>
          <main id="contenu">{children}</main>
          <ChromeSite>
            <Footer year={year} boutique={boutique} blog={blog} />
            <Consentement />
            {/* assistant du site (piste C validée par Kevin le 04/11) et mesure d'audience, chacun sous son accord */}
            <AssistantSite />
            <Mesure />
          </ChromeSite>
          </ContenuSite>
        </Providers>
      </body>
    </html>
  );
}
