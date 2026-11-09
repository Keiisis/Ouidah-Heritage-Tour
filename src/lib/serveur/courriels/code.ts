import { codes } from "@/content/courriels";
import { copiesCode } from "@/content/courriels-equipe";
import { cloture, debut, langueDe, type Modele, textes } from "./commun";
import { code as blocCode, courriel, paragraphes, titre } from "./gabarit";

// Code à 6 chiffres de l'équipe dans le gabarit « la lettre illustrée » (maquette e-code). Fonction pure, branchée par la
// session de l'équipe dans equipe/courriel.ts (envoi, boîte de test). Origine des images : `o.origine`, sinon SITE_URL.
export function gabaritCode(prenom: string, valeur: string, minutes: number, langue: string, o: { premiere?: boolean; origine?: string; modele?: Modele } = {}) {
  const L = langueDe(langue), c = codes[L], e = copiesCode[L], premiere = o.premiere ?? true;
  const origine = o.origine ?? process.env.SITE_URL?.trim().replace(/\/$/, "") ?? "";
  const t = textes(o.modele ?? null, { prenom: prenom || undefined }, { sujet: premiere ? e.sujetPremiere : e.sujetOubli, corps: [c.corps(minutes), e.ignorer] });
  return courriel({ langue: L, sujet: t.sujet, apercu: c.apercu(minutes) }, [
    ...debut(origine, null, L),
    titre({ phrase: { prenom, avant: premiere ? c.premiere : c.oubli } }, L, origine),
    blocCode(valeur),
    paragraphes(t.corps, L, "0px 24px 0px", 12),
    ...cloture(L, null, c.raison, {}, "28px 24px 48px"),
  ]);
}
