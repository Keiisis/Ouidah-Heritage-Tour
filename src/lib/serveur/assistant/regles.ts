import { LANGUES_ASSISTANT, type LangueAssistant, RETIRE } from "@/content/assistant";

// Règles pures de l'assistant (aucun accès réseau, base ni secret) : lecture des saisies du visiteur, identifiant de
// conversation signé, choix des fiches de connaissance pour une question, filtre du flux de réponse (code interne,
// adresses e-mail, ligne finale d'actions), validation des actions proposées, lecture du flux SSE de Groq. Prouvées par
// tests-oht/assistant-test.mjs (import direct, chargeur ts-chargeur.mjs).

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WHATSAPP = /^\+?[0-9][0-9 ().-]{5,31}$/;
// caractères de contrôle (sauf saut de ligne et tabulation) et marques de sens invisibles
const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

export const estLangue = (v: unknown): v is LangueAssistant => typeof v === "string" && (LANGUES_ASSISTANT as readonly string[]).includes(v);

/** Message du visiteur nettoyé, ou le motif du refus. */
export function lireMessage(v: unknown, max: number): { ok: true; texte: string } | { ok: false; erreur: "vide" | "long" } {
  const t = typeof v === "string" ? v.replace(CONTROLE, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (!t) return { ok: false, erreur: "vide" };
  if (t.length > max) return { ok: false, erreur: "long" };
  return { ok: true, texte: t };
}

export type Contact = { nom: string | null; email: string | null; whatsapp: string | null };

/** Coordonnées laissées pour être recontacté : chaque champ est facultatif, mais ce qui est donné doit être valable. */
export function lireContact(o: Record<string, unknown>): { ok: true; v: Contact } | { ok: false; champs: string[] } {
  const t = (x: unknown, n: number) => (typeof x === "string" ? x.replace(CONTROLE, "").trim().replace(/\s+/g, " ").slice(0, n + 1) : "");
  const nom = t(o.nom, 120), email = t(o.email, 254).toLowerCase(), whatsapp = t(o.whatsapp, 32);
  const champs: string[] = [];
  if (nom.length > 120) champs.push("nom");
  if (email && (email.length > 254 || !EMAIL.test(email))) champs.push("email");
  if (whatsapp && !WHATSAPP.test(whatsapp)) champs.push("whatsapp");
  return champs.length ? { ok: false, champs } : { ok: true, v: { nom: nom || null, email: email || null, whatsapp: whatsapp || null } };
}

// ---------- identifiant de conversation : <uuid>.<HMAC tronqué>, jamais l'uuid seul ----------

const SIGNE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{32})$/;

export const signer = (id: string, hmac: (s: string) => string) => `${id}.${hmac(`assistant|conversation|${id}`).slice(0, 32)}`;

/** L'uuid d'un identifiant signé valable, sinon null. `egaux` : comparaison à temps constant. */
export function lireSigne(v: unknown, hmac: (s: string) => string, egaux: (a: string, b: string) => boolean): string | null {
  const m = typeof v === "string" ? SIGNE.exec(v) : null;
  return m && egaux(hmac(`assistant|conversation|${m[1]}`).slice(0, 32), m[2]) ? m[1] : null;
}

// ---------- choix des fiches de connaissance ----------

export type Fiche = { id: string; titre: string; texte: string };

const VIDES = new Set(
  "les des une un le la de du et en est pour par sur dans avec que qui quoi quel quelle quels quelles comment combien vous nous votre vos mon mes ton tes est-ce ce cet cette ces pas plus aux ou au il elle ils elles on je tu y a the and for with what which how much many your you our are is can of to in on at do does from this that there where when who why les-vous estce el los las del con por para que como cuanto der die das und mit fur ist wie was wo wann den dem ein eine um o os as do da dos das com por para mi ou ki sa nan ak pou yo ka mwen an la pa".split(" "),
);

/** Texte à plat : minuscules, sans accents, sans ponctuation. */
export const aPlat = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Mots porteurs d'un texte (3 lettres au moins, pluriel en -s retiré, mots vides écartés). */
export function mots(t: string): string[] {
  return aPlat(t).split(" ").filter((m) => m.length >= 3 && !VIDES.has(m)).map((m) => (m.length > 4 && m.endsWith("s") ? m.slice(0, -1) : m));
}

/** Fiches les plus proches de la question (titre ×3, texte ×1), dans la limite de `budget` caractères ; ordre de la liste
 * à score égal. Aucune fiche sans mot en commun. */
export function choisir(fiches: Fiche[], question: string, budget: number): Fiche[] {
  const q = new Set(mots(question));
  if (!q.size) return [];
  const notees = fiches.map((f, i) => {
    const titre = new Set(mots(f.titre)), texte = new Set(mots(f.texte));
    let s = 0;
    for (const m of q) s += (titre.has(m) ? 3 : 0) + (texte.has(m) ? 1 : 0);
    return { f, s, i };
  });
  const out: Fiche[] = [];
  let n = 0;
  for (const x of notees.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i)) {
    const l = formater(x.f).length + 1;
    if (n + l > budget) continue;
    out.push(x.f);
    n += l;
  }
  return out;
}

export const formater = (f: Fiche) => `[${f.id}] ${f.titre} — ${f.texte}`;

// ---------- actions proposées ----------

export type Action =
  | { type: "devis"; demande: "voyage" | "question" | "groupe"; circuit: string | null; url: string }
  | { type: "circuit" | "lieu" | "evenement" | "article"; id: string; titre: string; url: string; image: string | null }
  | { type: "agent" };

/** `image` : photo du contenu publié (chemin du site « /… »), vignette du programme dans le widget. */
export type Catalogue = Record<"circuit" | "lieu" | "evenement" | "article", Map<string, { titre: string; url: string; image?: string | null }>>;

/** Chemin interne au site (« /… », jamais « //… » ni une adresse externe). */
const cheminInterne = (v: unknown): v is string => typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\");

const DEMANDES = ["voyage", "question", "groupe"] as const;

/** Actions de la ligne finale du modèle, gardées seulement si chaque identifiant existe dans le contenu publié ; au plus
 * 3, sans doublon. L'adresse est toujours construite ici, jamais reprise du modèle. */
export function validerActions(brut: unknown, c: Catalogue): Action[] {
  const out: Action[] = [];
  const vus = new Set<string>();
  for (const a of Array.isArray(brut) ? brut.slice(0, 6) : []) {
    const o = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
    let x: Action | null = null;
    if (o.type === "agent") x = { type: "agent" };
    else if (o.type === "devis") {
      const demande = DEMANDES.find((d) => d === o.demande) ?? "voyage";
      const circuit = typeof o.circuit === "string" && c.circuit.has(o.circuit) ? o.circuit : null;
      const q = new URLSearchParams();
      if (demande !== "voyage") q.set("demande", demande);
      if (circuit) q.set("circuit", circuit);
      x = { type: "devis", demande, circuit, url: `/devis${q.size ? `?${q}` : ""}` };
    } else if ((o.type === "circuit" || o.type === "lieu" || o.type === "evenement" || o.type === "article") && typeof o.id === "string") {
      const e = c[o.type].get(o.id);
      if (e) x = { type: o.type, id: o.id, titre: e.titre, url: e.url, image: cheminInterne(e.image) ? e.image : null };
    }
    const cle = x ? JSON.stringify(x) : "";
    if (x && !vus.has(cle)) {
      vus.add(cle);
      out.push(x);
    }
    if (out.length === 3) break;
  }
  return out;
}

/** Ligne finale « @@{…} » du modèle : connu (false = pas de réponse dans le contenu), actions brutes, résumé brut à
 * transmettre à l'équipe (lireTransmission) et réponses rapides brutes (validerSuggestions). */
export function lireFin(fin: string): { connu: boolean; actions: unknown; transmettre: unknown; suggestions: unknown } {
  const m = /\{[\s\S]*\}/.exec(fin);
  try {
    const o = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
    return { connu: o.connu !== false, actions: o.actions, transmettre: o.transmettre, suggestions: o.suggestions };
  } catch {
    return { connu: true, actions: [], transmettre: null, suggestions: [] };
  }
}

/** Réponses rapides proposées au visiteur : texte seul (caractères de contrôle, repères internes et signes de mise en
 * forme retirés), jamais d'adresse e-mail ni de lien, `max` caractères au plus (au-delà : écartée, jamais coupée), sans
 * doublon, 3 au plus. */
export function validerSuggestions(brut: unknown, max: number): string[] {
  const out: string[] = [];
  for (const v of Array.isArray(brut) ? brut.slice(0, 6) : []) {
    if (typeof v !== "string") continue;
    const s = retirerReperes(v.replace(CONTROLE, ""))
      .replace(/[*_`#<>[\]{}|\\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!s || s.length > max || adresses(s).length || /:\/\/|www\./i.test(s)) continue;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length === 3) break;
  }
  return out;
}

/** Résumé « transmettre » nettoyé comme le texte de la réponse : caractères de contrôle, repères internes et adresses
 * e-mail retirés, sauf les adresses `permises` (publiques d'OHT et celles que le visiteur a lui-même écrites) ; `max`
 * caractères au plus. null s'il est absent ou vide. */
export function lireTransmission(v: unknown, max: number, permises: string[]): string | null {
  if (typeof v !== "string") return null;
  const t = retirerReperes(retirerEmails(v.replace(CONTROLE, "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n"), permises)).trim();
  return t ? t.slice(0, max).trim() : null;
}

/** Résumé de l'équipe complété, jamais écrasé : l'ajout vient à la suite (sauf s'il y est déjà), `max` caractères au plus. */
export function completer(ancien: string | null, ajout: string, max = 2000): string {
  if (!ancien) return ajout.slice(0, max);
  return ancien.includes(ajout) ? ancien : `${ancien}\n${ajout}`.slice(0, max);
}

// ---------- filtre du flux de réponse ----------

const ADRESSE = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi;

const normale = (a: string) => a.toLowerCase().replace(/[.]+$/, "");

/** Adresses e-mail retirées, sauf les adresses `publiques` (en minuscules). */
export const retirerEmails = (t: string, publiques: string[]) => t.replace(ADRESSE, (a) => (publiques.includes(normale(a)) ? a : RETIRE));

/** Adresses e-mail d'un texte, en minuscules (forme comparée par retirerEmails). */
export const adresses = (t: string) => (t.match(ADRESSE) ?? []).map(normale);

// repères internes de CONNAISSANCES (« [circuit:…] », « [lieu:…] »…, connaissance.ts) : jamais montrés au visiteur, retirés
// avec leurs parenthèses et l'espace qui les précède
const REPERE_ = String.raw`\[\s*(?:circuit|lieu|evenement|article|fiche|service|preparer|raison|oht|histoire|carte|legal)\s*:[^\]\n]{0,160}\]`;
const REPERE = new RegExp(String.raw`\s*\(\s*${REPERE_}\s*\)|\s*${REPERE_}`, "gi");
export const retirerReperes = (t: string) => t.replace(REPERE, "");

/**
 * Filtre du flux : le texte n'est rendu que jusqu'au dernier blanc (une adresse ou le code interne arrive donc entière
 * avant d'être examinée, et l'espace qui précède un repère part avec lui), jamais après un « [ » encore ouvert (un repère
 * coupé entre deux morceaux attend sa fin, 200 caractères au plus) ni au-delà de « @@ » (ligne finale d'actions, gardée
 * pour le serveur). Adresses privées et repères internes retirés. Si le code interne apparaît (consignes révélées), le
 * flux est coupé : `coupe` devient vrai et plus rien ne sort.
 */
export function filtreFlux(canari: string, publiques: string[]) {
  let tout = "", rendu = 0, coupe = false, sortie = "";
  const rendre = (jusqua: number) => {
    if (jusqua <= rendu) return "";
    const s = retirerReperes(retirerEmails(tout.slice(rendu, jusqua), publiques));
    rendu = jusqua;
    sortie += s;
    return s;
  };
  return {
    pousser(d: string): string {
      if (coupe) return "";
      tout += d;
      if (tout.includes(canari)) {
        coupe = true;
        return "";
      }
      const m = tout.indexOf("@@");
      let b = m >= 0 ? m : Math.max(tout.lastIndexOf(" "), tout.lastIndexOf("\n"));
      const o = b > 0 ? tout.lastIndexOf("[", b - 1) : -1;
      if (o >= rendu && tout.indexOf("]", o) < 0 && tout.length - o <= 200) {
        b = tout[o - 1] === "(" ? o - 1 : o;
        while (b > rendu && /\s/.test(tout[b - 1])) b--;
      }
      return rendre(b);
    },
    finir(): { reste: string; fin: string; texte: string; coupe: boolean } {
      if (coupe || tout.includes(canari)) return { reste: "", fin: "", texte: "", coupe: (coupe = true) };
      const m = tout.indexOf("@@");
      const reste = rendre(m >= 0 ? m : tout.length);
      return { reste, fin: m >= 0 ? tout.slice(m + 2) : "", texte: sortie.trim(), coupe: false };
    },
  };
}

// ---------- flux SSE de Groq (« data: {…} » … « data: [DONE] », docs api-reference, paramètre stream) ----------

/** Lignes « data: » complètes du tampon, et ce qui reste (ligne incomplète). */
export function lignesSse(tampon: string): { donnees: string[]; reste: string } {
  const l = tampon.split("\n");
  const reste = l.pop() ?? "";
  return { donnees: l.map((x) => x.trim()).filter((x) => x.startsWith("data:")).map((x) => x.slice(5).trim()), reste };
}

/** Morceau d'un flux : texte ajouté, jetons consommés (dernier morceau : usage ou x_groq.usage) et erreur signalée. */
export function lireMorceau(d: string): { texte: string; jetons: number | null; erreur: string | null; fini: boolean } {
  if (d === "[DONE]") return { texte: "", jetons: null, erreur: null, fini: true };
  try {
    const o = JSON.parse(d) as { choices?: { delta?: { content?: unknown } }[]; usage?: { total_tokens?: unknown }; x_groq?: { usage?: { total_tokens?: unknown }; error?: unknown } };
    const t = o.choices?.[0]?.delta?.content;
    const j = Number(o.x_groq?.usage?.total_tokens ?? o.usage?.total_tokens);
    return { texte: typeof t === "string" ? t : "", jetons: Number.isFinite(j) && j > 0 ? j : null, erreur: typeof o.x_groq?.error === "string" ? o.x_groq.error : null, fini: false };
  } catch {
    return { texte: "", jetons: null, erreur: null, fini: false };
  }
}

/** Estimation prudente des jetons d'un texte (≈ 3 caractères par jeton), quand Groq ne donne pas l'usage. */
export const estimerJetons = (t: string) => Math.ceil(t.length / 3);

// ---------- résumé transmis à l'agent (sans appel au modèle) ----------

export function resumer(messages: { auteur: string; texte: string; actions?: unknown }[], T: { questions: string; actions: string; aucune: string }): string {
  const q = messages.filter((m) => m.auteur === "visiteur").map((m) => m.texte.replace(/\s+/g, " "));
  if (!q.length) return T.aucune;
  const a = [...new Set(messages.flatMap((m) => (Array.isArray(m.actions) ? (m.actions as Action[]) : [])).map((x) => ("titre" in x ? x.titre : x.type === "devis" ? x.url : "")).filter(Boolean))];
  const lignes = [`${T.questions} :`, ...q.slice(-6).map((t, i) => `${i + 1}. ${t.length > 220 ? `${t.slice(0, 219)}…` : t}`)];
  if (a.length) lignes.push(`${T.actions} : ${a.join(", ")}`);
  return lignes.join("\n").slice(0, 2000);
}

// ---------- aide à la rédaction : données personnelles mises de côté avant l'envoi au fournisseur ----------

const SENSIBLE = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}|\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b|\+?\d[\d .()-]{6,}\d/g;

/** Adresses e-mail, numéros (téléphone, compte) et IBAN remplacés par ⟦1⟧, ⟦2⟧… ; `rendre` les remet à leur place. */
export function masquer(t: string): { texte: string; rendre: (s: string) => string } {
  const vus: string[] = [];
  const texte = t.replace(SENSIBLE, (x) => {
    const i = vus.indexOf(x);
    return `⟦${(i >= 0 ? i : vus.push(x) - 1) + 1}⟧`;
  });
  return { texte, rendre: (s) => s.replace(/⟦(\d{1,3})⟧/g, (x, n: string) => vus[Number(n) - 1] ?? x) };
}

/** Réponse « OBJET: … --- corps » de l'aide à la rédaction. */
export function lireRedaction(t: string): { objet: string; corps: string } | null {
  const m = /^\s*OBJET\s*:\s*(.+?)\s*\n-{3,}\s*\n([\s\S]+)$/i.exec(t.trim());
  return m ? { objet: m[1].slice(0, 200), corps: m[2].trim().slice(0, 8000) } : null;
}
