import type { LangueBlogSite } from "@/content/blog-site";
import { suivi } from "@/content/suivi";
import { formatteurDate } from "@/lib/formats";

// Outils d'affichage du blog : date longue dans la langue de l'article (heure du Bénin), nom de l'auteur, tailles d'images.

export const dateLongue = (iso: string, langue: LangueBlogSite, mois: readonly string[] | undefined = suivi[langue].mois) =>
  formatteurDate(langue, { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Porto-Novo" }, mois).format(new Date(iso));

export const nomAuteur = (a: { prenom: string; nom: string } | null) => (a ? `${a.prenom} ${a.nom}`.trim() || null : null);

// `sizes` exacts, calculés sur .container-oht (gouttières 24 / 40 / 64 px, plafond 1440 px) et les grilles de blog.css.
export const TAILLES = {
  // à la une : 7 colonnes sur 12 (écart 64 px) dès 1024 px, pleine largeur du conteneur dessous
  une: "(min-width: 1440px) 728px, (min-width: 1024px) calc((100vw - 192px) * 7 / 12), (min-width: 768px) calc(100vw - 80px), calc(100vw - 48px)",
  // grille : 2 par rangée (écart 32 px) ou 3 par rangée dès 1024 px, 2 entre 640 et 1023 px (écart 24 px), 1 dessous
  large: "(min-width: 1440px) 640px, (min-width: 1024px) calc((100vw - 160px) / 2), (min-width: 768px) calc((100vw - 104px) / 2), (min-width: 640px) calc((100vw - 72px) / 2), calc(100vw - 48px)",
  moyenne: "(min-width: 1440px) 416px, (min-width: 1024px) calc((100vw - 192px) / 3), (min-width: 768px) calc((100vw - 104px) / 2), (min-width: 640px) calc((100vw - 72px) / 2), calc(100vw - 48px)",
  // article seul sur sa rangée : même partage que la une (toute la rangée sous 1024 px)
  seule: "(min-width: 1440px) 728px, (min-width: 1024px) calc((100vw - 192px) * 7 / 12), (min-width: 768px) calc(100vw - 80px), calc(100vw - 48px)",
  couverture: "100vw",
  // images du corps : 1040 px au plus, largeur du conteneur dessous
  figure: "(min-width: 1168px) 1040px, (min-width: 1024px) calc(100vw - 128px), (min-width: 768px) calc(100vw - 80px), calc(100vw - 48px)",
} as const;
