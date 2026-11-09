"use client";

import Link from "@/components/ui/LienPublic";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { ficheLieu as FICHE_LIEU } from "@/content/fiche-lieu";
import { useContenu } from "@/components/ui/ContenuSite";
import { CLE_CHEMIN, EVENEMENT_CHEMIN, modifierChemin } from "@/lib/chemin";

// « Ajouter à mon voyage » : le lieu rejoint « Votre chemin » (les lieux gardés de l'accueil, que /devis et l'en-tête
// relisent), puis « Créer mon voyage » mène au formulaire. Bouton « Pastille double » du site (globals.css, .oht-btn),
// pleine largeur sur téléphone (.is-plein-mobile).
const suivre = (cb: () => void) => {
  window.addEventListener(EVENEMENT_CHEMIN, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENEMENT_CHEMIN, cb);
    window.removeEventListener("storage", cb);
  };
};
const garde = (slug: string) => {
  try {
    const m = JSON.parse(localStorage.getItem(CLE_CHEMIN) ?? "null") as { gardes?: unknown } | null;
    return Array.isArray(m?.gardes) && m.gardes.includes(slug);
  } catch {
    return false; // navigation privée : rien de gardé
  }
};

export function AjouterVoyage({ slug, nom, clair = false }: { slug: string; nom: string; clair?: boolean }) {
  const T = useContenu("fiche-lieu.ficheLieu", FICHE_LIEU);
  const ajoute = useSyncExternalStore(
    suivre,
    () => garde(slug),
    () => false,
  );
  const [annonce, setAnnonce] = useState("");
  return (
    <div className="fl-ajout">
      <button
        type="button"
        className={`oht-btn is-plein-mobile ${clair ? "is-clair" : ""}`}
        aria-disabled={ajoute || undefined}
        onClick={() => {
          if (ajoute) return;
          modifierChemin([slug], [], true);
          setAnnonce(T.ajouteAnnonce(nom));
        }}
      >
        <span className="oht-btn-pastille is-gauche" aria-hidden="true">
          <Icon name="arrow-right" />
        </span>
        <span className="oht-btn-pilule">{ajoute ? T.ajoute : T.ajouter}</span>
        <span className="oht-btn-pastille is-droite" aria-hidden="true">
          <Icon name={ajoute ? "check" : "arrow-right"} />
        </span>
      </button>
      {ajoute ? (
        <Link className="oht-lien" href={T.creer.href}>
          {T.creer.label}
        </Link>
      ) : null}
      <span className="sr-only" role="status">
        {annonce}
      </span>
    </div>
  );
}
