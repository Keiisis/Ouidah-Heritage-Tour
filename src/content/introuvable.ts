// Page introuvable (404), maquette A « La correction » retenue par Kevin le 30/10/2026. Textes FR ; les adresses proposées
// et l'index de recherche sont calculés dans app/not-found.tsx à partir des pages et fiches réellement publiées.
import type { NomObjet } from "@/components/ui/Objet3D";

export const introuvable = {
  metaTitre: "Page introuvable — Ouidah Heritage Tour",
  metaDescription: "Cette adresse ne mène à aucune page du site Ouidah Heritage Tour.",
  titre: "Cette adresse ne mène à aucune page.",
  chapo: "Une lettre a peut-être glissé. Voici l’adresse réelle la plus proche de celle que vous avez tapée.",
  chapoSansProposition: "Aucune adresse du site ne ressemble à celle-ci. Cherchez un lieu ou reprenez l’un des chemins ci-dessous.",
  proposition: (type: string) => `Vouliez-vous dire · ${type}`,
  yAller: "Y aller",
  recherche: { label: "Chercher un lieu, un circuit, une page", placeholder: "Ou cherchez : temple, plage, hôtel, histoire…", rien: "Rien à ce nom : posez-nous la question", nousEcrire: "Nous écrire" },
  types: { page: "Page", lieu: "Lieu à voir", circuit: "Circuit", adresse: "Adresse relevée" },
  cheminsLabel: "Reprendre d’ici",
  chemins: [
    { nom: "Retour à l’accueil", ou: "Ouidah en un coup d’œil : lieux, circuits, agenda", href: "/", objet: "accueil" },
    { nom: "L’histoire de Ouidah", ou: "De Glexwé à Ouidah, en douze chapitres", href: "/ouidah/histoire", objet: "temps-fort" },
    { nom: "Créer mon voyage", ou: "Dites-nous ce qui vous attire, nous composons le voyage", href: "/devis", objet: "billet" },
  ] satisfies { nom: string; ou: string; href: string; objet: NomObjet }[],
  // pages fixes du site proposées par la correction (les fiches et circuits publiés s'y ajoutent)
  pages: [
    { titre: "L’histoire de Ouidah", href: "/ouidah/histoire" },
    { titre: "Créer mon voyage", href: "/devis" },
    { titre: "Mentions légales", href: "/mentions-legales" },
    { titre: "Confidentialité et cookies", href: "/politique-de-confidentialite" },
    { titre: "Conditions générales de vente", href: "/conditions-generales-de-vente" },
  ],
  boutique: { titre: "Boutique", href: "/boutique" },
};
