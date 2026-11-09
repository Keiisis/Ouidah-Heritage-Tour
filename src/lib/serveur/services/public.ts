import "server-only";
import { lireContenu } from "@/lib/contenu";
import { base, baseConfiguree, compter } from "../base";
import { courrielConfigure, envoyerCourriel } from "../courriel";
import { boutons, courriel, entete, paragraphes, titre } from "../courriels/gabarit";
import { nouveauJeton, jetonValide, sha256 } from "../equipe/outils";
import { empreinteIp, limiteAtteinte, lireCorps, reponse } from "../garde";
import { origineSite } from "../paiement/outils";
import { langueService, lireCandidature, lireContact, lireEmail, objet, UUID_SERVICE } from "./regles";

export type CreneauPublic = { id: string; debut: string; fin: string; mode: "telephone" | "sur_place"; lieu: string };
export async function disponibilites(): Promise<CreneauPublic[] | null> {
  if (!baseConfiguree()) return null;
  try { const r = await base("rpc/disponibilites_rdv", { method: "POST", corps: {} }); return r.ok ? await r.json() as CreneauPublic[] : null; } catch { return null; }
}
async function formulaire(req: Request, table: string) {
  if (!baseConfiguree()) return { refus: reponse({ erreur: "erreur" }, 503) };
  const brut = objet(await lireCorps(req, 12000));
  if (brut.piege || typeof brut.duree !== "number" || brut.duree < 1500) return { refus: reponse({ erreur: "erreur" }, 400) };
  const ip = empreinteIp(req);
  if (await limiteAtteinte(table, ip, 5, 60)) return { refus: reponse({ erreur: "limite" }, 429) };
  return { brut, ip };
}
export async function reserver(req: Request) {
  const f = await formulaire(req, "rendez_vous"); if (f.refus) return f.refus;
  const contact = lireContact(f.brut), id = f.brut.creneau;
  if (!contact || typeof id !== "string" || !UUID_SERVICE.test(id)) return reponse({ erreur: "erreur" }, 400);
  const r = await base("rpc/reserver_rdv", { method: "POST", corps: { p_creneau: id, p_nom: contact.nom, p_email: contact.email, p_telephone: contact.telephone, p_message: contact.message, p_langue: contact.langue, p_ip: f.ip } }).catch(() => null);
  if (!r?.ok) { const e = await r?.json().catch(() => ({})); return reponse({ erreur: e?.message === "limite" ? "limite" : e?.message === "indisponible" || e?.code === "23505" ? "indisponible" : "erreur" }, e?.message === "limite" ? 429 : r?.status === 400 || r?.status === 409 ? 409 : 502); }
  return reponse({ ok: true, id: await r.json() }, 201);
}
export async function candidater(req: Request) {
  const f = await formulaire(req, "candidatures_partenaires"); if (f.refus) return f.refus;
  const v = lireCandidature(f.brut); if (!v) return reponse({ erreur: "erreur" }, 400);
  const r = await base("candidatures_partenaires?select=id", { method: "POST", corps: { ...v, ip_hash: f.ip }, prefer: "return=representation" }).catch(() => null);
  // Une nouvelle demande vers une adresse déjà en cours n'expose ni le dossier ni son état.
  if (r?.status === 409) return reponse({ ok: true }, 201);
  if(r?.ok)return reponse({ok:true},201);
  const erreur=await r?.json().catch(()=>({}));
  return reponse({ erreur: erreur?.message==="limite"?"limite":"erreur" }, erreur?.message==="limite"?429:502);
}
export async function demanderAcces(req: Request) {
  const f = await formulaire(req, "acces_donnees"); if (f.refus) return f.refus;
  const email = lireEmail(f.brut.email), langue = langueService(f.brut.langue), origine = origineSite(req);
  if (!email || f.brut.consentement !== true) return reponse({ erreur: "erreur" }, 400);
  if (!origine || !courrielConfigure()) return reponse({ erreur: "erreur" }, 503);
  const depuis = encodeURIComponent(new Date(Date.now() - 3600000).toISOString());
  const nombre = await compter("acces_donnees", `email=eq.${encodeURIComponent(email)}&cree_le=gte.${depuis}`);
  if (nombre === null) return reponse({ erreur: "erreur" }, 503);
  if (nombre >= 3) return reponse({ erreur: "limite" }, 429);
  const jeton = nouveauJeton(), hash = sha256(jeton);
  const r = await base("acces_donnees?select=id", { method: "POST", corps: { email, jeton_hash: hash, expire_le: new Date(Date.now() + 30 * 60000).toISOString(), ip_hash: f.ip }, prefer: "return=representation" }).catch(() => null);
  if(!r?.ok){const erreur=await r?.json().catch(()=>({}));return reponse({erreur:erreur?.message==="limite"?"limite":"erreur"},erreur?.message==="limite"?429:502);}
  const id = (await r.json() as { id: string }[])[0]?.id;
  if (!id) return reponse({ erreur: "erreur" }, 502);
  const T = (await lireContenu("services.copiesServices"))[langue];
  // Le fragment ne part ni dans les logs HTTP ni dans les en-têtes Referer. Aucun jeton dans la réponse JSON.
  const lien = `${origine}${langue === "FR" ? "" : `/${langue.toLowerCase()}`}/mes-donnees#acces=${jeton}`;
  const m = courriel({ langue, sujet: T.lienSujet, apercu: T.lienTexte }, [entete(origine), titre({ phrase: { avant: T.donnees } }, langue, origine), paragraphes([T.lienTexte], langue), boutons({ principal: { href: lien, libelle: T.donnees } }, " : ", "0 24px 28px"), paragraphes([T.lienIgnore], langue)]);
  const envoye = await envoyerCourriel({ ...m, a: email, cle: `donnees-${id}` });
  const e = await base(`acces_donnees?id=eq.${id}`, { method: "PATCH", corps: envoye ? { envoye: true } : { consomme_le: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => null);
  return envoye && e?.ok ? reponse({ ok: true }, 200) : reponse({ erreur: "erreur" }, 502);
}
export async function utiliserAcces(req: Request) {
  if (!baseConfiguree()) return reponse({ erreur: "erreur" }, 503);
  const jeton = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const b = objet(await lireCorps(req, 1000));
  if (!jetonValide(jeton) || !["export", "effacement"].includes(String(b.action)) || (b.action === "effacement" && b.confirmation !== true)) return reponse({ erreur: "jeton" }, 400);
  const r = await base("rpc/utiliser_acces_donnees", { method: "POST", corps: { p_hash: sha256(jeton), p_action: b.action } }).catch(() => null);
  if (!r?.ok) { const e = await r?.json().catch(() => ({})); return reponse({ erreur: e?.message === "jeton" ? "jeton" : "erreur" }, e?.message === "jeton" ? 410 : 502); }
  const donnees: unknown = await r.json();
  if (b.action === "effacement") return reponse({ ok: true }, 201);
  return new Response(JSON.stringify(donnees, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="oht-mes-donnees.json"', "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
}
