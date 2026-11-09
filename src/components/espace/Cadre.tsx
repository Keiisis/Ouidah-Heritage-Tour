"use client";

import { createContext, use, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { enregistrerTheme } from "@/lib/serveur/equipe/theme";
import { Picto } from "./Picto";
import "./jetons.css";

// Cadre de l'espace : la racine .esp (rôle, thème posé par le serveur d'après le profil, donc sans éclair), le thème
// partagé par ses bascules et l'horloge. L'heure de la requête (minute) sert au premier rendu, côté serveur comme à
// l'hydratation ; le navigateur prend ensuite le relais, minute par minute.
export type ThemeAffiche = "clair" | "sombre";
type Espace = { theme: ThemeAffiche; changer: (t: ThemeAffiche) => void; minute: number };
const Contexte = createContext<Espace | null>(null);

export function Cadre({ role, theme: initial, minute, children }: { role: Role; theme: ThemeAffiche; minute: number; children: ReactNode }) {
  const [theme, setTheme] = useState(initial);
  const changer = (t: ThemeAffiche) => {
    setTheme(t);
    void enregistrerTheme(t).catch(() => false); // gardé dans le profil ; hors ligne, le choix vaut pour cette page
  };
  return (
    <Contexte value={{ theme, changer, minute }}>
      <div className="esp" data-role={role} data-theme={theme}>
        {children}
      </div>
    </Contexte>
  );
}

export function useEspace() {
  const c = use(Contexte);
  if (!c) throw new Error("useEspace hors du cadre de l’espace");
  return c;
}

const suivre = (cb: () => void) => {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
};
const minuteCourante = () => Math.floor(Date.now() / 60_000);

/** Minute courante (epoch / 60 000) : celle de la requête au rendu serveur et à l'hydratation, puis l'horloge. */
export function useMinute() {
  const { minute } = useEspace();
  return useSyncExternalStore(suivre, minuteCourante, () => minute);
}

/** Bascule clair / sombre : avec son libellé (navigation) ou en icône seule (en-tête). */
export function BasculeTheme({ libelle = false }: { libelle?: boolean }) {
  const { theme, changer } = useEspace();
  const sombre = theme === "sombre";
  return (
    <button
      type="button"
      className={libelle ? undefined : "icone-bouton"}
      aria-pressed={sombre}
      aria-label={libelle ? undefined : T.theme.sombre}
      data-bascule-theme
      onClick={() => changer(sombre ? "clair" : "sombre")}
    >
      <Picto nom={sombre ? "soleil" : "lune"} />
      {libelle && <span>{T.theme.sombre}</span>}
    </button>
  );
}
