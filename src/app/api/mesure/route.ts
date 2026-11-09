import { slugsProduits } from "@/lib/boutique";
import { lireContenu } from "@/lib/contenu";
import { compter } from "@/lib/serveur/assistant/compteur";
import { baseConfiguree } from "@/lib/serveur/base";
import { empreinteIp, lireCorps } from "@/lib/serveur/garde";
import { compterVue } from "@/lib/serveur/mesure";
import { estRobot, limiteur, lireVues, normaliserChemin, origineAcceptee, refusSuivi, sourceDe } from "@/lib/serveur/mesure-regles";

// Mesure d'audience maison : POST { vues: [{ chemin, langue, ref? }] } (VUES_MAX au plus : les pages de la visite, en un
// seul beacon de components/mesure/Mesure.tsx à la sortie de l'onglet) ou une vue seule { chemin, langue, ref? } (ancien
// format), envoyé seulement après l'accord du visiteur. Aucun cookie posé, aucune donnée de la requête gardée hors du compte
// du jour (chemin normalisé, langue, catégorie de provenance). Robots, Do Not Track / Global Privacy Control, envoi depuis
// un autre site, chemin privé : refus silencieux (204, rien compté). 120 vues par minute et par empreinte d'IP (chaque vue
// d'un lot compte ; un envoi illisible ou un événement compte pour une), en mémoire du processus seulement (jamais
// stockées) : au-delà, les vues en trop ne sont pas comptées (429). POST { evenement } : ouverture de l'assistant ou devis
// démarré depuis son programme (widget), compté sans identifiant dans assistant_evenements ; les questions et passages à un
// agent sont comptés par les routes de l'assistant.
const trop = limiteur(120, 60_000);
const rien = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const h = req.headers, hote = h.get("host");
  if (estRobot(h.get("user-agent")) || refusSuivi(h) || !origineAcceptee(h.get("origin"), hote) || !baseConfiguree()) return rien();
  const ip = empreinteIp(req);
  const corps = await lireCorps(req, 8_192);
  const evenement = corps && typeof corps === "object" && "evenement" in corps ? corps.evenement : undefined;
  const vues = evenement === undefined ? lireVues(corps) : null;
  let admises = 0;
  for (let i = 0; i < (vues?.length ?? 1); i++) if (!trop(ip)) admises++;
  if (!admises) return rien(429);
  if (evenement !== undefined) return evenement === "assistant_ouvert" || evenement === "devis_demarre" ? (await compter(evenement), rien()) : rien(400);
  if (!vues) return rien(400);
  const produits = vues.some((v) => v.chemin.startsWith("/boutique/")) ? await slugsProduits() : [];
  const [tours, FICHES_LIEU] = await Promise.all([lireContenu("fr.tours"), lireContenu("fr.FICHES_LIEU")]);
  await Promise.all(
    vues.slice(0, admises).map((v) => {
      const page = normaliserChemin(v.chemin, v.chemin.startsWith("/boutique/") ? produits : [], { tours, FICHES_LIEU });
      return page ? compterVue(page, v.langue, sourceDe(v.ref, hote)) : null;
    }),
  );
  return rien(admises < vues.length ? 429 : 204);
}
