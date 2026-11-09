import "server-only";
import { base } from "../base";

export type ReglagesTraduction = { actif: boolean; modele: string; budget_jour: number; glossaire: string };
export async function lireReglagesTraduction(): Promise<ReglagesTraduction | null> {
  try {
    const r = await base("traduction_auto_reglages?select=actif,modele,budget_jour,glossaire&id=eq.true");
    return r.ok ? (await r.json() as ReglagesTraduction[])[0] ?? null : null;
  } catch { return null; }
}

export async function etatTraductions() {
  const compter = async (filtres: string) => {
    try {
      const r = await base(`traduction_auto_file?select=cle&${filtres}`, { prefer: "count=exact", range: "0-0" });
      const total = r.headers.get("content-range")?.split("/")[1];
      return r.ok && total && total !== "*" ? Number(total) : null;
    } catch { return null; }
  };
  const [attente, enCours, termines, echecs] = await Promise.all([
    compter("etat=eq.attente"),
    compter("etat=eq.en_cours"),
    compter("etat=eq.terminee"),
    compter("etat=neq.terminee&erreur=neq."),
  ]);
  return { attente, enCours, termines, echecs };
}
