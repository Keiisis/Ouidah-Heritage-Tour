"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CleContenu } from "@/lib/contenu-registre";
import { type Json } from "@/lib/contenu-regles";
import { avecMessages, messagesValides } from "@/lib/traductions";
import type { Langue } from "@/lib/langue";

// Contenu modifiable du site public, côté navigateur : le layout transmet les seules rubriques publiées depuis l'espace
// de l'équipe (JSON déjà validé par le serveur, sans fonctions) ; chaque composant garde son défaut du code (content/*)
// et useContenu y fond la surcharge en rendant les fonctions du code (libellés calculés). Sans surcharge : le défaut, tel
// quel, sans aucun calcul.
const Ctx = createContext<{ valeurs: Partial<Record<CleContenu, Json>>; langue: Langue }>({ valeurs: {}, langue: "FR" });

export function ContenuSite({ valeurs, langue = "FR", children }: { valeurs: Partial<Record<CleContenu, Json>>; langue?: Langue; children: ReactNode }) {
  const contexte = useMemo(() => ({ valeurs, langue }), [valeurs, langue]);
  return <Ctx.Provider value={contexte}>{children}</Ctx.Provider>;
}

export const useLangue = () => useContext(Ctx).langue;

/** Rubrique publiée si elle existe, sinon le défaut ; même type que le défaut. */
export function useContenu<T>(cle: CleContenu, defaut: T): T {
  const { valeurs, langue } = useContext(Ctx);
  return useMemo(() => avecMessages(cle, defaut, valeurs[cle], langue, messagesValides(valeurs["site.messages"])), [cle, defaut, valeurs, langue]);
}
