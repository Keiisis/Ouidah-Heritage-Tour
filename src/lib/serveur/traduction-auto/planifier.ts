import "server-only";
import { after } from "next/server";
import { cleGroq } from "../assistant/fournisseur";

/** Aucun appel fournisseur dans la réponse de l'éditeur ou dans le rendu public. */
export function planifierTraductions() {
  if (!cleGroq()) return;
  after(async () => {
    const { traiterTraductions } = await import("./worker");
    await traiterTraductions();
  });
}
