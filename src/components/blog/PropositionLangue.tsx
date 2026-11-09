"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { copiesBlog, LOCALES_BLOG, estLangueBlogSite, type LangueBlogSite } from "@/content/blog-site";
import { useContenu } from "@/components/ui/ContenuSite";
import { langueDetectee, rien } from "@/lib/langue";

// Même règle que le reste du site public (lib/langue.ts) : langue de la page si ce n'est pas le français, sinon la
// première langue du navigateur que le site propose. Si le journal a des articles dans cette langue et que la liste en
// montre une autre, une seule phrase propose d'y passer, dans cette langue. Jamais de redirection : le visiteur choisit.
export function PropositionLangue({ actuelle, disponibles }: { actuelle: LangueBlogSite; disponibles: { langue: LangueBlogSite; href: string }[] }) {
  const copies = useContenu("blog-site.copiesBlog", copiesBlog);
  const detectee = useSyncExternalStore(rien, langueDetectee, () => null);
  const cible = estLangueBlogSite(detectee) && detectee !== actuelle ? disponibles.find((d) => d.langue === detectee) : undefined;
  if (!cible) return null;
  return (
    <p className="jo-proposition" lang={LOCALES_BLOG[cible.langue].lang}>
      <Link className="oht-lien" href={cible.href} hrefLang={LOCALES_BLOG[cible.langue].lang}>
        {copies[cible.langue].langue.proposition}
      </Link>
    </p>
  );
}
