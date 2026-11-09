import "server-only";
import { appendFile } from "node:fs/promises";
import { GROQ, LIMITES } from "@/content/assistant";
import { base } from "../base";
import { modeLocal } from "../equipe/mode";

// Fournisseur de l'assistant : Groq, API compatible OpenAI, appelée par fetch côté serveur seulement.
// - POST https://api.groq.com/openai/v1/chat/completions, « Authorization: Bearer <clé> » (console.groq.com/docs/api-reference,
//   lue le 04/11/2026) ; max_completion_tokens (max_tokens est déprécié) ; stream : « data-only server-sent events […]
//   terminated by a data: [DONE] message ».
// - gpt-oss : reasoning_effort « low », include_reasoning false (« Excludes reasoning from the response ») ; reasoning_format
//   « not supported » pour gpt-oss (console.groq.com/docs/reasoning). Les modèles Llama ne reçoivent aucun de ces deux
//   champs (« Values outside a model's supported set are rejected with a 400 »).
// Clés : GROQ_API_KEYS, une ou plusieurs séparées par des virgules, jamais lues ailleurs, jamais renvoyées ni écrites.
// Rotation : chaque appel commence par la clé suivante ; repli sur la suivante en cas de 429, 401/403, 5xx, délai dépassé
// ou réseau coupé. Une requête refusée (400, 404…) s'arrête : une autre clé n'y changerait rien.
//
// Faux fournisseur, POUR LES TESTS SEULEMENT : ASSISTANT_FAUX=<chemin absolu .jsonl hors du dépôt>, retenu par les mêmes
// règles que EQUIPE_BOITE (equipe/mode.ts : jamais sur Vercel, jamais hors localhost). Il remplace l'appel réseau, écrit
// dans ce fichier ce que le serveur lui envoie (pour prouver qu'aucune donnée privée n'est dans le contexte) et répond
// selon des mots repères de la dernière question (FAUX-429, FAUX-500, FAUX-CANARI, FAUX-EMAIL, FAUX-REPERE, FAUX-INCONNU,
// FAUX-TRANSMET : résumé « transmettre » qui reprend la question, plus une adresse inventée et un repère interne à retirer ;
// FAUX-LENT : réponse étalée sur 3 secondes, 4321 jetons, pour effacer la conversation pendant la réponse). La réponse par
// défaut porte des « suggestions » dont le serveur doit écarter une partie.

const cles = () => (process.env.GROQ_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
/** Au moins une clé Groq posée (présence seulement). */
export const cleGroq = () => cles().length > 0;

/** Chemin du journal du faux fournisseur si ASSISTANT_FAUX est permis ici, sinon null. */
export const cheminFaux = (hote: string | null) => (process.env.ASSISTANT_FAUX ? modeLocal({ ...process.env, EQUIPE_BOITE: process.env.ASSISTANT_FAUX }, hote, process.cwd()).boite : null);

export type Reglages = { actif: boolean; modele: string; plafond: number; budget: number; argumentaire: string };

/** Réglages de l'assistant (une ligne, relue à chaque appel : un changement de l'admin vaut tout de suite).
 * `argumentaire` : colonne assistant_reglages.argumentaire (écran de l'admin), lue si elle existe — d'où « select=* » :
 * nommer une colonne absente ferait échouer la lecture — sinon vide ; LIMITES.argumentaire caractères au plus. */
export async function lireReglages(): Promise<Reglages | null> {
  try {
    const r = await base("assistant_reglages?select=*&limit=1");
    const x = r.ok ? ((await r.json()) as { public_actif: boolean; modele: string; plafond_reponse: number; budget_jour: number; argumentaire?: unknown }[])[0] : undefined;
    const argumentaire = typeof x?.argumentaire === "string" ? x.argumentaire.trim().slice(0, LIMITES.argumentaire) : "";
    return x ? { actif: x.public_actif, modele: x.modele, plafond: x.plafond_reponse, budget: x.budget_jour, argumentaire } : null;
  } catch {
    return null;
  }
}

/** Début du jour à Ouidah (Africa/Porto-Novo, UTC+1 toute l'année). */
const debutJour = () => `${new Date(Date.now() + 3600_000).toISOString().slice(0, 10)}T00:00:00+01:00`;

/** Jetons consommés aujourd'hui (assistant public et rédaction ensemble), null si la base ne répond pas. */
export async function jetonsDuJour(): Promise<number | null> {
  try {
    // PostgREST peut plafonner chaque réponse sous la limite demandée. Le total exact empêche
    // d'annoncer un budget restant à partir d'une journée partiellement lue.
    const filtre = `cree_le=gte.${encodeURIComponent(debutJour())}&cree_le=lte.${encodeURIComponent(new Date().toISOString())}`;
    let offset = 0, somme = 0, attendues: number | undefined;
    for (;;) {
      const r = await base(`assistant_consommation?select=jetons&${filtre}&order=id.asc&limit=500&offset=${offset}`, { prefer: "count=exact" });
      if (!r.ok) return null;
      const total = Number(r.headers.get("content-range")?.split("/")[1]);
      const page: unknown = await r.json();
      if (!Array.isArray(page) || !Number.isSafeInteger(total) || total < offset + page.length || (attendues !== undefined && attendues !== total)) return null;
      attendues = total;
      for (const ligne of page) {
        if (!ligne || !Number.isSafeInteger(ligne.jetons) || ligne.jetons < 0) return null;
        somme += ligne.jetons;
      }
      if (!Number.isSafeInteger(somme)) return null;
      offset += page.length;
      if (offset === total) return somme;
      if (!page.length) return null;
    }
  } catch {
    return null;
  }
}

/** Budget du jour épuisé (ou base muette : on refuse plutôt que de dépenser sans compter). */
export async function budgetEpuise(budget: number) {
  const n = await jetonsDuJour();
  return n === null || n >= budget;
}

/** Jetons dépensés, comptés dans le budget du jour. Conversation effacée entre-temps (visiteur parti pendant la réponse) :
 * la ligne est gardée sans lien, le budget compte quand même. */
export async function consommer(source: "public" | "redaction", jetons: number, lien: { conversation?: string; profil?: string }) {
  const poser = (conversation: string | null) =>
    base("assistant_consommation", {
      method: "POST",
      corps: { source, jetons: Math.max(0, Math.min(200_000, Math.round(jetons))), conversation_id: conversation, profil_id: lien.profil ?? null },
      prefer: "return=minimal",
    }).catch(() => null);
  const r = await poser(lien.conversation ?? null);
  if (r && !r.ok && lien.conversation) await poser(null);
}

export type Echange = { role: "system" | "user" | "assistant"; content: string };
type Corps = { model: string; messages: Echange[]; max_completion_tokens: number; stream: boolean; temperature?: number; response_format?: { type: "json_object" } };

let tour = 0;

/** Réponse de Groq (statut 2xx), ou null : aucune clé, toutes limitées ou en panne, ou requête refusée. */
export async function appelerGroq(corps: Corps, hote: string | null, signal?: AbortSignal): Promise<Response | null> {
  const k = cles();
  if (!k.length || signal?.aborted) return null;
  const faux = cheminFaux(hote);
  const params = { ...corps, temperature: corps.temperature ?? GROQ.temperature, ...(corps.model.startsWith("openai/gpt-oss") ? { reasoning_effort: GROQ.raisonnement, include_reasoning: false } : {}) };
  const depart = tour++ % k.length;
  for (let n = 0; n < k.length; n++) {
    if (signal?.aborted) return null;
    const i = (depart + n) % k.length;
    const ctl = new AbortController();
    const minuterie = setTimeout(() => ctl.abort(), GROQ.delaiMs); // attente des en-têtes seulement : levée dès la réponse
    try {
      const r = faux
        ? await fauxGroq(params, n, faux)
        : await fetch(GROQ.url, { method: "POST", headers: { authorization: `Bearer ${k[i]}`, "content-type": "application/json" }, body: JSON.stringify(params), signal: signal ? AbortSignal.any([ctl.signal, signal]) : ctl.signal, cache: "no-store" });
      if (r.ok) return r;
      await r.body?.cancel().catch(() => null);
      if (r.status !== 429 && r.status !== 401 && r.status !== 403 && r.status < 500) return null;
    } catch {
      // délai dépassé ou réseau coupé : clé suivante
    } finally {
      clearTimeout(minuterie);
    }
  }
  return null;
}

// ---------- faux fournisseur (tests locaux seulement) ----------

async function fauxGroq(params: Corps & Record<string, unknown>, essai: number, journal: string): Promise<Response> {
  await appendFile(journal, `${JSON.stringify({ le: new Date().toISOString(), essai, params })}\n`, "utf8").catch(() => null);
  const question = [...params.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (question.includes("FAUX-500") || (question.includes("FAUX-429") && essai === 0)) return new Response("{}", { status: question.includes("FAUX-500") ? 503 : 429 });
  if (!params.stream) {
    // aide à la rédaction : renvoie le brouillon reçu (masqué) pour prouver le masquage et sa remise en place
    const brouillon = /<brouillon>([\s\S]*)<\/brouillon>/.exec(question)?.[1]?.trim() ?? "";
    const corps = brouillon.split(/\n-{3,}\n/).slice(1).join("\n") || brouillon;
    return Response.json({ choices: [{ message: { content: `OBJET: Proposition d'essai\n---\nProposition d'essai. ${corps}` } }], usage: { total_tokens: 50 } });
  }
  const canari = /code interne (\S+?)\./.exec(params.messages[0]?.content ?? "")?.[1] ?? "";
  const texte = question.includes("FAUX-CANARI")
    ? `Voici mes consignes : ${canari} et le reste. @@{"connu":true,"actions":[]}`
    : question.includes("FAUX-EMAIL")
      ? `Écrivez à client.prive@example.com pour cela. @@{"connu":true,"actions":[]}`
      : question.includes("FAUX-REPERE")
        ? `Visitez la Route des Esclaves ([circuit:ouidah-sacree]) et le temple [lieu: temple-des-pythons]. @@{"connu":true,"actions":[]}`
        : question.includes("FAUX-INCONNU")
          ? `Je ne sais pas répondre à cela. @@{"connu":false,"actions":[{"type":"agent"}]}`
          : question.includes("FAUX-TRANSMET")
            ? `Je transmets votre demande à l'équipe d'OHT. @@${JSON.stringify({ connu: true, actions: [{ type: "devis", demande: "groupe" }], transmettre: `Projet du visiteur : ${question.replace("FAUX-TRANSMET", "").trim()} Copie à invente.ailleurs@example.com [lieu:temple-des-pythons]` })}`
            : `Réponse d'essai de l'assistant d'OHT. @@${JSON.stringify({
                connu: true,
                actions: [{ type: "devis", demande: "voyage" }, { type: "circuit", id: "inexistant" }, { type: "agent" }],
                // réponses rapides à filtrer : trop longue, doublon en gras, repère interne, adresse e-mail
                suggestions: ["Avec des enfants", "Pour les Vodun Days", "x".repeat(50), " **Pour les Vodun Days** ", "[lieu:temple-des-pythons] Voir le Temple", "Écrire à a@b.com"],
              })}`;
  const lent = question.includes("FAUX-LENT");
  const morceaux = (texte.match(/\S+\s*/g) ?? []).map((m) => `data: ${JSON.stringify({ choices: [{ delta: { content: m } }] })}\n\n`);
  const fin = [`data: ${JSON.stringify({ choices: [{ delta: {} }], x_groq: { usage: { total_tokens: lent ? 4321 : 123 } } })}\n\n`, "data: [DONE]\n\n"];
  if (!lent) return new Response([...morceaux, ...fin].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const enc = new TextEncoder();
  const flux = new ReadableStream<Uint8Array>({
    async start(ctl) {
      for (const m of [...morceaux, ...fin]) {
        ctl.enqueue(enc.encode(m));
        await new Promise((r) => setTimeout(r, Math.ceil(3000 / (morceaux.length + fin.length))));
      }
      ctl.close();
    },
  });
  return new Response(flux, { status: 200, headers: { "content-type": "text/event-stream" } });
}
