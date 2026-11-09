import Link from "@/components/ui/LienPublic";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

// Boutons D1 « Pastille double » : pilule bleu nuit + pastille ronde ; au survol, la pastille de droite se replie et une
// pastille flèche s'ouvre à gauche (mouvement dans globals.css, .oht-btn). `compte` remplace la flèche de droite par un nombre.
export function ButtonPrimary({ href, children, dark = false, compte, desactive = false, className = "" }: { href: string; children: ReactNode; dark?: boolean; compte?: number; desactive?: boolean; className?: string }) {
  const contenu = (
    <>
      <span className="oht-btn-pastille is-gauche" aria-hidden="true">
        <Icon name="arrow-right" />
      </span>
      <span className="oht-btn-pilule">{children}</span>
      <span className="oht-btn-pastille is-droite" aria-hidden="true">
        {compte ?? <Icon name="arrow-right" />}
      </span>
    </>
  );
  const classes = `oht-btn ${dark ? "is-clair" : ""} ${className}`;
  return desactive ? (
    <span className={classes} aria-disabled="true">
      {contenu}
    </span>
  ) : (
    <Link href={href} className={classes}>
      {contenu}
    </Link>
  );
}

// Lien D1 : un point latérite grandit devant le libellé au survol et au focus clavier.
export function LinkLine({ href, children, className = "", external = false, prefetch }: { href: string; children: ReactNode; className?: string; external?: boolean; prefetch?: boolean }) {
  return external ? (
    <a href={href} className={`oht-lien ${className}`} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} prefetch={prefetch} className={`oht-lien ${className}`}>
      {children}
    </Link>
  );
}

export const whatsappHref = (number: string | null, message: string) =>
  number ? `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}` : null;
