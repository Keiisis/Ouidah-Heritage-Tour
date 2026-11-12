"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { devisPage as DEVIS_PAGE } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { Icon } from "@/components/ui/Icon";
import "./retour-billet.css";

// Chemin de retour vers le billet (/devis) : les cases « Choisir mes lieux », « Modifier les dates », « Modifier les
// services »… mènent aux sections de l'accueil. En partant, le billet note son adresse (langue et intention comprises) pour
// la session ; l'accueil montre alors la pastille « Revenir à mon billet » jusqu'au retour sur le billet. Le brouillon,
// lui, reste sur l'appareil (Devis.tsx) : rien n'est perdu entre-temps.
const CLE = "oht-retour-billet";
const EVENEMENT = "oht-retour-billet";

export function retenirRetour() {
  try {
    sessionStorage.setItem(CLE, location.pathname + location.search);
  } catch {
    /* stockage bloqué : l'en-tête garde son lien « Votre voyage » */
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

export function oublierRetour() {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    /* rien à oublier */
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

const suivre = (f: () => void) => {
  window.addEventListener(EVENEMENT, f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener(EVENEMENT, f);
    window.removeEventListener("storage", f);
  };
};
const lire = () => {
  try {
    const v = sessionStorage.getItem(CLE);
    // seulement une adresse du billet de ce site (/devis ou /<langue>/devis), jamais une adresse arbitraire
    return v && /^\/(?:(?:en|es|de|pt|ht|gcf)\/)?devis(?:\?[\w=&%,.:-]*)?$/.test(v) ? v : null;
  } catch {
    return null;
  }
};

export function RetourBillet() {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const adresse = useSyncExternalStore(suivre, lire, () => null);
  if (!adresse) return null;
  // adresse déjà dans la langue du billet : lien direct, sans nouvelle traduction d'adresse
  return (
    <Link href={adresse} className="oht-btn rb-retour" onClick={oublierRetour}>
      <span className="oht-btn-pastille is-gauche" aria-hidden="true">
        <Icon name="arrow-right" />
      </span>
      <span className="oht-btn-pilule">{T.retourBillet}</span>
      <span className="oht-btn-pastille is-droite" aria-hidden="true">
        <Icon name="arrow-right" />
      </span>
    </Link>
  );
}
