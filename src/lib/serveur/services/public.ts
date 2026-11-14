import "server-only";
import { lireContenu } from "@/lib/contenu";
import { base, baseConfiguree, compter } from "../base";
import { adresseMasquee, courrielConfigure, envoyerAvis, envoyerCourriel } from "../courriel";
import { avis, ligne } from "../courriels/avis";
import { boutons, courriel, entete, paragraphes, titre } from "../courriels/gabarit";
import { hmac, nouveauJeton, jetonValide, selConfigure, sha256 } from "../equipe/outils";
import { effacerObjets } from "../equipe/pilotage/stockage";
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
/** `apres` : appelé avec l'identifiant du rendez-vous enregistré (la route y programme les e-mails après la réponse). */
export async function reserver(req: Request, apres?: (id: string) => void) {
  const f = await formulaire(req, "rendez_vous"); if (f.refus) return f.refus;
  const contact = lireContact(f.brut), id = f.brut.creneau;
  if (!contact || typeof id !== "string" || !UUID_SERVICE.test(id)) return reponse({ erreur: "erreur" }, 400);
  const r = await base("rpc/reserver_rdv", { method: "POST", corps: { p_creneau: id, p_nom: contact.nom, p_email: contact.email, p_telephone: contact.telephone, p_message: contact.message, p_langue: contact.langue, p_ip: f.ip } }).catch(() => null);
  if (!r?.ok) { const e = await r?.json().catch(() => ({})); return reponse({ erreur: e?.message === "limite" ? "limite" : e?.message === "indisponible" || e?.code === "23505" ? "indisponible" : "erreur" }, e?.message === "limite" ? 429 : r?.status === 400 || r?.status === 409 ? 409 : 502); }
  const rdv: unknown = await r.json();
  if (apres && typeof rdv === "string" && UUID_SERVICE.test(rdv)) apres(rdv);
  return reponse({ ok: true, id: rdv }, 201);
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
  const envoye = await envoyerCourriel({ ...m, a: email, cle: `donnees-${id}`, modele: "donnees" });
  const e = await base(`acces_donnees?id=eq.${id}`, { method: "PATCH", corps: envoye ? { envoye: true } : { consomme_le: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => null);
  return envoye && e?.ok ? reponse({ ok: true }, 200) : reponse({ erreur: "erreur" }, 502);
}
export async function utiliserAcces(req: Request) {
  if (!baseConfiguree()) return reponse({ erreur: "erreur" }, 503);
  const jeton = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const b = objet(await lireCorps(req, 1000));
  if (!jetonValide(jeton) || !["export", "effacement"].includes(String(b.action)) || (b.action === "effacement" && b.confirmation !== true)) return reponse({ erreur: "jeton" }, 400);
  if (b.action === "effacement") return effacerParAcces(req, jeton, langueService(b.langue));
  const r = await base("rpc/utiliser_acces_donnees", { method: "POST", corps: { p_hash: sha256(jeton), p_action: b.action } }).catch(() => null);
  if (!r?.ok) { const e = await r?.json().catch(() => ({})); return reponse({ erreur: e?.message === "jeton" ? "jeton" : "erreur" }, e?.message === "jeton" ? 410 : 502); }
  const donnees: unknown = await r.json();
  return new Response(JSON.stringify(donnees, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="oht-mes-donnees.json"', "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
}

type Compte = Record<string, number>;
const somme = (c: Compte) => Object.values(c).reduce((s, n) => s + n, 0);

/** Effacement demandé depuis /mes-donnees : le lien reçu par e-mail prouve l'adresse, l'effacement part tout de suite
 * (Kevin 13/11), sans file a_traiter. Les pièces que la loi impose de garder restent ; le client le lit à l'écran et
 * dans l'e-mail de confirmation. */
async function effacerParAcces(req: Request, jeton: string, langue: ReturnType<typeof langueService>) {
  if (!selConfigure()) return reponse({ erreur: "erreur" }, 503);
  const hash = sha256(jeton);
  const l = await base(`acces_donnees?select=email&jeton_hash=eq.${hash}`).catch(() => null);
  const email = l?.ok ? ((await l.json()) as { email: string }[])[0]?.email : undefined;
  if (!email) return reponse({ erreur: l?.ok ? "jeton" : "erreur" }, l?.ok ? 410 : 502);
  const r = await base("rpc/effacer_par_acces", { method: "POST", corps: { p_hash: hash, p_email: email, p_hmac: hmac(`personne|${email}`) } }).catch(() => null);
  if (!r?.ok) { const e = await r?.json().catch(() => ({})); return reponse({ erreur: e?.message === "jeton" ? "jeton" : "erreur" }, e?.message === "jeton" ? 410 : 502); }
  const x = (await r.json()) as { deja?: boolean; id?: string; efface?: Compte; garde?: Compte; chemins?: string[] };
  if (x.deja || !x.id) return reponse({ ok: true, deja: true }, 200);
  const garde = somme(x.garde ?? {}) > 0, fichiers = await effacerObjets(x.chemins ?? []);
  const origine = origineSite(req), T = (await lireContenu("services.copiesServices"))[langue];
  if (origine && courrielConfigure()) {
    const texte = [T.effacementFait, garde ? T.effacementGarde : T.effacementRien];
    const m = courriel({ langue, sujet: T.effacementSujet, apercu: T.effacementFait }, [entete(origine), titre({ phrase: { avant: T.effacementSujet } }, langue, origine), paragraphes(texte, langue)]);
    await envoyerCourriel({ ...m, a: email, cle: `effacement-${x.id}`, modele: "donnees" });
    const compte = (c: Compte = {}) => Object.entries(c).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ") || "rien";
    const a = avis({ sujet: "Effacement fait depuis /mes-donnees", apercu: "Un client a effacé ses données.", titre: "Effacement fait par le client", donnee: adresseMasquee(email), lignes: [ligne("Effacé", compte(x.efface)), ligne("Gardé (comptabilité)", compte(x.garde)), ligne("Fichiers du stockage", fichiers ? "effacés" : "à effacer à la main (chemins dans le journal)")], raison: "Avis interne : effacement automatique /mes-donnees." }, origine);
    await envoyerAvis({ ...a, cle: `effacement-${x.id}-equipe`, modele: "donnees" });
  }
  if (!fichiers) console.error("effacement: fichiers du stockage non effacés", x.id, x.chemins);
  return reponse({ ok: true, garde }, 200);
}
