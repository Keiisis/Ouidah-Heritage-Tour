"use server";

import { appendFile } from "node:fs/promises";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { consignesRedaction, courrielReponse, LIMITES } from "@/content/assistant";
import { base, compter } from "../base";
import { echapper, envoyerCourriel } from "../courriel";
import { modeLocal } from "../equipe/mode";
import { iso } from "../equipe/outils";
import { assistantDisponible } from "../equipe/reglages/public";
import { exigerDroit } from "../equipe/securite/droits";
import { exigerRole, type Session } from "../equipe/session";
import { ajouterMessage, chargerConversation, type Conversation, modifierConversation, peutAgir, versDemande } from "./conversations";
import { appelerGroq, budgetEpuise, consommer, lireReglages } from "./fournisseur";
import { estimerJetons, estLangue, lireMessage, lireRedaction, masquer, UUID } from "./regles";

// Actions de l'équipe sur l'assistant. Chacune relit la session et les droits en base à chaque appel (jamais une donnée
// du navigateur) : réponse et transformation d'une conversation = droit « Demandes » (securite/droits.ts) et conversation
// libre ou suivie par ce membre (l'admin : toutes) ; aide à la rédaction = tout membre, assistant allumé et clé posée.

export type RetourAssistant = { ok: true; courriel?: boolean } | { erreur: "refuse" | "champs" | "panne" | "etat" | "contact" | "deja" };

async function conversationPermise(id: unknown): Promise<{ erreur: "refuse" | "champs" | "panne" | "etat" } | { s: Session; c: Conversation }> {
  const s = await exigerDroit("demandes");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const c = await chargerConversation(id);
  if (c === "panne") return { erreur: "panne" };
  if (!c || c.mode !== "agent") return { erreur: "etat" };
  if (!peutAgir(s, c)) return { erreur: "refuse" };
  return { s, c };
}

/** Réponse d'un agent au visiteur. Visiteur absent depuis LIMITES.absentMinutes et e-mail laissé : la réponse part aussi
 * par e-mail, dans sa langue (en local : la boîte de test EQUIPE_BOITE, jamais le SMTP). */
export async function repondreConversation(e: { id: unknown; texte: unknown }): Promise<RetourAssistant> {
  const p = await conversationPermise(e.id);
  if ("erreur" in p) return { erreur: p.erreur };
  const { s, c } = p;
  const m = lireMessage(e.texte, 4000);
  if (!m.ok) return { erreur: "champs" };
  const id = await ajouterMessage({ conversation: c.id, auteur: "agent", texte: m.texte, agent: s.profilId });
  if (!id) return { erreur: "panne" };
  await modifierConversation(c.id, c.agent_id ? {} : { agent_id: s.profilId });
  const t = iso(Date.now());
  let courriel = false;
  if (c.contact_email && Date.parse(c.vu_le) < Date.now() - LIMITES.absentMinutes * 60_000) {
    const T = courrielReponse[c.langue];
    const texte = `${T.intro(s.prenom)}\n\n${m.texte}\n\n${T.fin}`;
    const html = `<p>${echapper(T.intro(s.prenom))}</p><p>${echapper(m.texte).replace(/\n/g, "<br>")}</p><p>${echapper(T.fin)}</p>`;
    const cle = `assistant-${c.id}-${id}`;
    const boite = modeLocal(process.env, (await headers()).get("host"), process.cwd()).boite;
    courriel = boite
      ? await appendFile(boite, `${JSON.stringify({ type: "courriel", a: c.contact_email, sujet: T.sujet, texte, cle, le: t })}\n`, "utf8").then(() => true, () => false)
      : await envoyerCourriel({ a: c.contact_email, sujet: T.sujet, html, texte, cle });
    if (courriel) await base(`conversation_messages?id=eq.${id}`, { method: "PATCH", corps: { envoye_le: t }, prefer: "return=minimal" }).catch(() => null);
  }
  await base(`notifications?profil_id=eq.${s.profilId}&type=eq.conversation_agent&objet_id=eq.${c.id}&lu_le=is.null`, { method: "PATCH", corps: { lu_le: t }, prefer: "return=minimal" }).catch(() => null);
  refresh();
  return { ok: true, courriel };
}

/** La conversation devient une demande (nom, e-mail et accord du visiteur exigés), attribuée à qui la suit. */
export async function transformerConversation(e: { id: unknown }): Promise<RetourAssistant> {
  const p = await conversationPermise(e.id);
  if ("erreur" in p) return { erreur: p.erreur };
  const r = await versDemande(p.c);
  if (r !== "ok") return { erreur: r };
  refresh();
  return { ok: true };
}

export type RetourRedaction = { ok: true; objet: string; corps: string } | { erreur: "refuse" | "indisponible" | "champs" | "limite" | "budget" | "occupe" | "panne" };

/** Aide à la rédaction : l'IA propose un objet et un corps, rien n'est envoyé ni enregistré. Adresses, numéros et IBAN
 * sont remplacés par ⟦n⟧ avant l'envoi au fournisseur, puis remis à leur place dans la proposition. */
export async function proposerRedaction(e: { objet: unknown; corps: unknown; langue: unknown }): Promise<RetourRedaction> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  if (!(await assistantDisponible())) return { erreur: "indisponible" };
  const objet = typeof e.objet === "string" ? e.objet.trim().slice(0, 200) : "";
  const corps = typeof e.corps === "string" ? e.corps.trim().slice(0, 8000) : "";
  if (!estLangue(e.langue) || (!objet && !corps)) return { erreur: "champs" };
  const reg = await lireReglages();
  if (!reg) return { erreur: "panne" };
  const n = await compter("assistant_consommation", `source=eq.redaction&profil_id=eq.${s.profilId}&cree_le=gte.${encodeURIComponent(iso(Date.now() - 3600_000))}`);
  if (n === null || n >= LIMITES.redactionsParHeure) return { erreur: "limite" };
  if (await budgetEpuise(reg.budget)) return { erreur: "budget" };
  const mq = masquer(`OBJET: ${objet}\n---\n${corps}`);
  const systeme = consignesRedaction(e.langue);
  const r = await appelerGroq({ model: reg.modele, messages: [{ role: "system", content: systeme }, { role: "user", content: `<brouillon>\n${mq.texte}\n</brouillon>` }], max_completion_tokens: reg.plafond, stream: false }, (await headers()).get("host"));
  const j = r ? ((await r.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[]; usage?: { total_tokens?: unknown } } | null) : null;
  const texte = typeof j?.choices?.[0]?.message?.content === "string" ? (j.choices[0].message.content as string) : "";
  const jetons = Number(j?.usage?.total_tokens);
  if (r) await consommer("redaction", Number.isFinite(jetons) && jetons > 0 ? jetons : estimerJetons(systeme + mq.texte + texte), { profil: s.profilId });
  const p = lireRedaction(texte);
  return p ? { ok: true, objet: mq.rendre(p.objet), corps: mq.rendre(p.corps) } : { erreur: "occupe" };
}
