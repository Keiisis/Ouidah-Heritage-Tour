import { randomBytes } from "node:crypto";
import { after, connection } from "next/server";
import { consignes, LIMITES, refus } from "@/content/assistant";
import {
  agentsEnLigne,
  ajouterMessage,
  chargerConversation,
  creerConversation,
  limiteMessage,
  lireConversationSignee,
  lireMessages,
  modifierConversation,
  signerConversation,
  terminerInactives,
  transmettre,
} from "@/lib/serveur/assistant/conversations";
import { compter } from "@/lib/serveur/assistant/compteur";
import { connaissances } from "@/lib/serveur/assistant/connaissance";
import { noterQuestionSansReponse } from "@/lib/serveur/assistant/sources";
import { appelerGroq, budgetEpuise, cheminFaux, cleGroq, consommer, type Echange, lireReglages } from "@/lib/serveur/assistant/fournisseur";
import { adresses, estimerJetons, estLangue, filtreFlux, lignesSse, lireFin, lireMessage, lireMorceau, lireTransmission, validerActions, validerSuggestions } from "@/lib/serveur/assistant/regles";
import { baseConfiguree } from "@/lib/serveur/base";
import { selConfigure } from "@/lib/serveur/equipe/outils";
import { empreinteIp, lireCorps, reponse } from "@/lib/serveur/garde";

// Assistant IA d'OHT (conseiller commercial ; fournisseur jamais nommé au visiteur), contenu public seulement
// (connaissance.ts). Aucun accord à donner (décision du 04/11) : la conversation est effacée quand le visiteur quitte la
// page (/api/assistant/fin) ou après EFFACEMENT_MINUTES sans activité ; seul le résumé transmis à l'équipe reste. Contrat :
// GET  → { ia, agent, enLigne } : assistant IA disponible (clé GROQ_API_KEYS + assistant allumé + base), passage à un agent
//        possible, membre de l'équipe en ligne. (+ essai: true en local quand le faux fournisseur répond.)
// POST { c?: identifiant signé, message, langue }, sans en-tête ni cookie d'accord. « x-oht-mesure: 1 » (accord « mesure »
//      du visiteur, transmis par le widget) : la question est comptée dans la mesure d'audience, sans identifiant.
//      → 200 application/x-ndjson, une ligne JSON par événement : { c } puis { t: "texte" }…, éventuellement
//        { remplace: "texte" } (réponse coupée : elle aurait révélé les consignes), enfin { fin: true, connu, actions,
//        suggestions, transmis } ou { erreur: "occupe" }. suggestions : string[], 0 à 3 réponses rapides que le widget
//        propose au visiteur (texte seul, LIMITES.suggestion caractères au plus, sans lien ni adresse ; à rendre en
//        textContent ; toucher l'une d'elles l'envoie comme message). transmis : true si cette réponse a transmis un
//        résumé à l'équipe, false sinon.
//      → 503 { ia: false } (pas de clé, éteint, base absente) · 400 { erreur: "illisible" | "langue" | "vide" | "long" } ·
//        404 { erreur: "conversation" } (inconnue, effacée ou finie : en ouvrir une nouvelle sans `c`) · 409 { erreur:
//        "agent" } (conversation passée à un agent : écrire par /api/assistant/agent) · 429 { erreur: "limite" | "budget" } ·
//        503 { erreur: "occupe" } · 502.
//      Après chaque POST (assistant allumé), filet : fin des conversations de l'assistant sans activité (terminerInactives).
// Rendu des textes { t } / { remplace } par le widget (recommandé : markdown restreint, échappé) : texte inséré en
//   textContent, jamais en innerHTML ; seuls « **gras** » → <strong> et les lignes « - … » consécutives → <ul><li> ;
//   tout autre signe (titres, tableaux, liens « [x](y) », code, HTML) reste du texte. Aucun lien dans le texte : les liens
//   viennent seulement de `actions` (adresses internes construites par le serveur). Les consignes du modèle n'autorisent
//   que ces deux formes ; les repères internes « [lieu:…] » sont retirés par le serveur.
// Le texte du visiteur n'entre jamais dans les consignes système : il reste un message « user ». Le résumé « transmettre »
// passe par les mêmes filtres que le texte ; seules les adresses e-mail écrites par le visiteur lui-même (et celles d'OHT)
// y restent.

export async function GET(req: Request) {
  await connection();
  const pret = baseConfiguree() && selConfigure();
  const r = pret && cleGroq() ? await lireReglages() : null;
  const essai = cheminFaux(req.headers.get("host"));
  // rien ne dépend du visiteur : le CDN sert la même réponse 60 s sans appeler la fonction ; jamais en essai local
  return Response.json(
    { ia: Boolean(r?.actif), agent: pret, enLigne: pret ? await agentsEnLigne() : false, ...(essai ? { essai: true } : {}) },
    { headers: { "cache-control": essai ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

export async function POST(req: Request) {
  if (!baseConfiguree() || !selConfigure() || !cleGroq()) return reponse({ ia: false }, 503);
  const reg = await lireReglages();
  if (!reg?.actif) return reponse({ ia: false }, 503);
  after(() => terminerInactives());

  const corps = (await lireCorps(req, 4_000)) as Record<string, unknown> | null;
  if (!corps || typeof corps !== "object") return reponse({ erreur: "illisible" }, 400);
  if (!estLangue(corps.langue)) return reponse({ erreur: "langue" }, 400);
  const langue = corps.langue;
  const m = lireMessage(corps.message, LIMITES.message);
  if (!m.ok) return reponse({ erreur: m.erreur }, 400);

  const ip = empreinteIp(req);
  let id: string | null = null;
  if (corps.c !== undefined && corps.c !== null) {
    id = lireConversationSignee(corps.c);
    const c = id ? await chargerConversation(id) : null;
    if (c === "panne") return reponse({ erreur: "base" }, 502);
    if (!c) return reponse({ erreur: "conversation" }, 404);
    if (c.mode === "agent") return reponse({ erreur: "agent" }, 409);
  }
  if (await limiteMessage(ip, id)) return reponse({ erreur: "limite" }, 429);
  if (await budgetEpuise(reg.budget)) return reponse({ erreur: "budget" }, 429);

  const historique = id ? await lireMessages(id, { limite: LIMITES.historique, derniers: true }) : [];
  if (!historique) return reponse({ erreur: "base" }, 502);
  if (!id) id = await creerConversation({ langue, ip });
  if (!id || !(await ajouterMessage({ conversation: id, auteur: "visiteur", texte: m.texte, ip }))) return reponse({ erreur: "base" }, 502);
  await modifierConversation(id, { vu_le: new Date().toISOString(), langue });

  // contexte : socle et fiches publiques choisies pour la question (et la précédente), puis l'échange récent
  const avant = historique.filter((x) => x.auteur !== "agent");
  const precedente = [...avant].reverse().find((x) => x.auteur === "visiteur")?.texte ?? "";
  // ce que le visiteur a écrit lui-même (ses adresses e-mail peuvent rester dans le résumé transmis à l'équipe)
  const ecrit = [...avant.filter((x) => x.auteur === "visiteur").map((x) => x.texte), m.texte].join("\n");
  const savoir = await connaissances(`${precedente} ${m.texte}`);
  const canari = `OHT-${randomBytes(6).toString("hex")}`;
  const echange: Echange[] = [];
  let place = LIMITES.historiqueCaracteres;
  for (const x of [...avant].reverse()) {
    if ((place -= x.texte.length) < 0) break;
    echange.unshift({ role: x.auteur === "visiteur" ? "user" : "assistant", content: x.texte });
  }
  const messages: Echange[] = [{ role: "system", content: consignes(langue, canari, savoir.texte, reg.argumentaire) }, ...echange, { role: "user", content: m.texte }];

  const r = await appelerGroq({ model: reg.modele, messages, max_completion_tokens: reg.plafond, stream: true }, req.headers.get("host"));
  if (!r?.body) return reponse({ erreur: "occupe" }, 503);
  const conversation = id;
  const signe = signerConversation(conversation);
  const enc = new TextEncoder();
  const ligne = (o: unknown) => enc.encode(`${JSON.stringify(o)}\n`);
  const source = r.body;

  // mesure d'audience (accord « mesure » du visiteur, transmis par le widget) : une question, sans identifiant
  if (req.headers.get("x-oht-mesure") === "1") after(() => compter("question_posee"));
  const flux = new ReadableStream<Uint8Array>({
    async start(ctl) {
      ctl.enqueue(ligne({ c: signe }));
      const f = filtreFlux(canari, savoir.emailsPublics);
      let tampon = "", jetons: number | null = null, panne = false;
      const traiter = (donnees: string[]) => {
        for (const d of donnees) {
          const x = lireMorceau(d);
          if (x.erreur) panne = true;
          if (x.jetons) jetons = x.jetons;
          const s = x.texte ? f.pousser(x.texte) : "";
          if (s) ctl.enqueue(ligne({ t: s }));
        }
      };
      try {
        const lecteur = source.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await lecteur.read();
          if (done) break;
          const l = lignesSse(tampon + value);
          tampon = l.reste;
          traiter(l.donnees);
        }
        traiter(lignesSse(`${tampon}\n`).donnees);
      } catch {
        panne = true;
      }
      const fin = f.finir();
      if (fin.reste) ctl.enqueue(ligne({ t: fin.reste }));
      const texte = fin.coupe ? refus[langue] : fin.texte;
      const lu = lireFin(fin.fin);
      const actions = fin.coupe ? [] : validerActions(lu.actions, savoir.catalogue);
      const resume = fin.coupe ? null : lireTransmission(lu.transmettre, LIMITES.transmission, [...savoir.emailsPublics, ...adresses(ecrit)]);
      const suggestions = fin.coupe ? [] : validerSuggestions(lu.suggestions, LIMITES.suggestion);
      await consommer("public", jetons ?? estimerJetons(messages.map((x) => x.content).join("") + fin.texte), { conversation });
      if (!texte || (panne && !fin.texte)) {
        ctl.enqueue(ligne({ erreur: "occupe" }));
      } else {
        if (fin.coupe) ctl.enqueue(ligne({ remplace: texte }));
        await ajouterMessage({ conversation, auteur: "assistant", texte, actions, sansReponse: !fin.coupe && !lu.connu });
        // apprentissage : la question sans réponse est gardée anonymisée (sans IP ni conversation) pour que l'équipe y
        // réponde dans « Ce que l'assistant sait » ; sa réponse devient une fiche lue dès la question suivante
        if (!fin.coupe && !lu.connu) await noterQuestionSansReponse(m.texte, langue);
        const transmis = resume ? await transmettre(conversation, resume) : false;
        ctl.enqueue(ligne({ fin: true, connu: fin.coupe || lu.connu, actions, suggestions, transmis }));
      }
      ctl.close();
    },
  });
  return new Response(flux, { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
