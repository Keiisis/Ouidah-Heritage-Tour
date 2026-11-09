import "server-only";
import QRCode from "qrcode";
import { espace as T } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";
import { lireContenu } from "@/lib/contenu";
import { base } from "../../base";
import { courrielConfigure } from "../../courriel";
import { passerelle } from "../../paiement";
import { PASSERELLES, type NomPasserelle } from "../../paiement/types";
import { exigerRole, type Session } from "../session";
import { cleAssistant, cleEmcf } from "./public";
import { depuisBytea, type Mentions, type Textes, type ThemeProfil, vcard } from "./regles";

// Lectures du lot « reglages », par le serveur seulement avec la clé secrète (elle contourne RLS : le contrôle tient ICI).
// Chaque lecture relit la session et le rôle : les réglages sont réservés aux admins, le profil et la carte ne lisent que
// le compte connecté. Les clés et mots de passe ne sont jamais lus que pour savoir s'ils existent (Boolean). Aucun
// « use cache » : tout est lu à la requête. Une lecture qui échoue rend null (« données indisponibles »).

async function lire<L>(chemin: string): Promise<L[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as L[]) : null;
  } catch {
    return null;
  }
}
type Par = { prenom: string; nom: string } | null;
const nomDe = (p: Par) => (p ? `${p.prenom} ${p.nom}` : null);
const admin = async () => {
  const s = await exigerRole("admins");
  return s && s.role === "admin" ? s : null;
};

// ---------- passerelles ----------

export type LignePasserelle = { nom: NomPasserelle; active: boolean; ordre: number; cles: boolean; test: boolean | null; modifie_le: string };

/** Les 5 passerelles dans l'ordre choisi, avec l'état de leurs clés (présentes ou non, jamais leur valeur). Mode test
 * connu seulement là où une variable non secrète le dit (KKIAPAY_SANDBOX, FEDAPAY_SANDBOX). */
export async function lirePasserelles(): Promise<LignePasserelle[] | null> {
  if (!(await admin())) return null;
  const l = await lire<{ nom: string; active: boolean; ordre: number; modifie_le: string }>("passerelles_paiement?select=nom,active,ordre,modifie_le&order=ordre.asc,nom.asc");
  if (!l) return null;
  const test: Partial<Record<NomPasserelle, boolean>> = { kkiapay: process.env.KKIAPAY_SANDBOX === "true", fedapay: process.env.FEDAPAY_SANDBOX === "true" };
  return l.filter((x): x is typeof x & { nom: NomPasserelle } => (PASSERELLES as readonly string[]).includes(x.nom)).map((x) => ({ ...x, cles: passerelle(x.nom).disponible(), test: test[x.nom] ?? null }));
}

// ---------- réglages généraux (taux, e-MECeF, assistant) ----------

export type Site = { taux: number; tauxUsd: number | null; tauxUsdLe: string | null; emcfActif: boolean; nim: string | null; jetonEmcf: boolean; assistantActif: boolean; cleAssistant: boolean; modifie_le: string; par: string | null };

export async function lireSite(): Promise<Site | null> {
  if (!(await admin())) return null;
  const l = await lire<{ taux_eur: string | number; taux_usd: string | number | null; taux_usd_le: string | null; emcf_actif: boolean; emcf_nim: string | null; assistant_actif: boolean; modifie_le: string; par: Par }>("reglages_site?select=taux_eur,taux_usd,taux_usd_le,emcf_actif,emcf_nim,assistant_actif,modifie_le,par:equipe_profils(prenom,nom)&limit=1");
  const x = l?.[0];
  if (!x) return null;
  return { taux: Number(x.taux_eur), tauxUsd: x.taux_usd === null ? null : Number(x.taux_usd), tauxUsdLe: x.taux_usd_le, emcfActif: x.emcf_actif, nim: x.emcf_nim, jetonEmcf: cleEmcf(), assistantActif: x.assistant_actif, cleAssistant: cleAssistant(), modifie_le: x.modifie_le, par: nomDe(x.par) };
}

// ---------- e-mail d'envoi ----------

export type Echec = { id: string; quand: string; quoi: string; qui: string | null };
export type EtatEnvoi = { configure: boolean; hote: string | null; port: number | null; adresse: string | null; mdp: boolean; moi: string; echecs: Echec[] | null };

const quoiEchec = (action: string, objet = "") => {
  const t = R.envoiCourriel.types[action];
  return typeof t === "function" ? t(objet) : (t ?? R.envoiCourriel.inconnu);
};

/** État du compte SMTP (hôte, port, adresse d'envoi ; le mot de passe seulement « posé » ou non) et derniers échecs :
 * e-mails de l'équipe partis en échec (courriels_envoyes) et envois notés « motif: envoi » au journal. */
export async function lireEnvoi(): Promise<EtatEnvoi | null> {
  const s = await admin();
  if (!s) return null;
  const [moi, courriels, journal] = await Promise.all([
    lire<{ email: string }>(`equipe_profils?select=email&id=eq.${s.profilId}&limit=1`),
    lire<{ id: string; envoye_le: string; objet: string; par: Par }>("courriels_envoyes?select=id,envoye_le,objet,par:equipe_profils(prenom,nom)&statut=eq.echec&order=envoye_le.desc&limit=10"),
    lire<{ id: number; cree_le: string; action: string; par: Par }>("equipe_journal?select=id,cree_le,action,par:equipe_profils(prenom,nom)&details->>motif=eq.envoi&order=cree_le.desc&limit=10"),
  ]);
  if (!moi?.[0]) return null;
  const port = Number(process.env.SMTP_PORT);
  const echecs =
    courriels && journal
      ? [
          ...courriels.map((c) => ({ id: `c-${c.id}`, quand: c.envoye_le, quoi: quoiEchec("courriel", c.objet), qui: nomDe(c.par) })),
          ...journal.map((j) => ({ id: `j-${j.id}`, quand: j.cree_le, quoi: quoiEchec(j.action), qui: nomDe(j.par) })),
        ]
          .sort((a, b) => Date.parse(b.quand) - Date.parse(a.quand))
          .slice(0, 10)
      : null;
  return {
    configure: courrielConfigure(),
    hote: process.env.SMTP_HOTE?.trim() || null,
    port: port > 0 ? port : null,
    adresse: process.env.SMTP_UTILISATEUR?.trim() || null,
    mdp: Boolean(process.env.SMTP_MDP),
    moi: moi[0].email,
    echecs,
  };
}

// ---------- mentions des documents ----------

type Image = { type: string; donnees: string } | null; // donnees : URL data: (base64), pour l'aperçu de l'admin
export type Docs = { m: Mentions; defauts: Partial<Mentions>; signature: Image; cachet: Image; modifie_le: string; par: string | null; jamais: boolean };

type Info = { valeur: string | string[] | null; visible: boolean };
/** Mention publique du site (pages légales), si elle est visible et remplie ; jamais le siège privé ni la direction. */
function mentionPublique(societe: Record<string, Info>, cle: "denomination" | "forme" | "quartier" | "ville" | "rccm" | "ifu" | "telephones" | "email"): string | null {
  const i = societe[cle];
  if (!i?.visible || i.valeur === null) return null;
  const v = Array.isArray(i.valeur) ? i.valeur.map((x) => x.trim()).filter(Boolean).join(" · ") : i.valeur.trim();
  return v || null;
}
const image = (octets: unknown, type: string | null): Image => {
  const b = depuisBytea(octets);
  return b && type ? { type, donnees: `data:${type};base64,${b.toString("base64")}` } : null;
};

export async function lireDocs(): Promise<Docs | null> {
  if (!(await admin())) return null;
  const legal = await lireContenu("legal");
  const publique = (cle: Parameters<typeof mentionPublique>[1]) => mentionPublique(legal.societe, cle);
  type Ligne = Omit<Mentions, "pied" | "mentions"> & { pied: Textes; mentions: Textes; signature: string | null; signature_type: string | null; cachet: string | null; cachet_type: string | null; modifie_le: string; modifie_par: string | null; par: Par };
  const l = await lire<Ligne>("reglages_documents?select=raison_sociale,forme,adresse,ifu,rccm,telephone,email,pied,mentions,signataire,fonction,signature,signature_type,cachet,cachet_type,modifie_le,modifie_par,par:equipe_profils(prenom,nom)&limit=1");
  const x = l?.[0];
  if (!x) return null;
  const { signature, signature_type, cachet, cachet_type, modifie_le, modifie_par, par, ...m } = x;
  const adresse = [publique("quartier"), publique("ville")].filter(Boolean).join(", ") || null;
  return {
    m,
    defauts: { raison_sociale: publique("denomination"), forme: publique("forme"), adresse, ifu: publique("ifu")?.replace(/\s/g, "") ?? null, rccm: publique("rccm"), telephone: publique("telephones"), email: publique("email") },
    signature: image(signature, signature_type),
    cachet: image(cachet, cachet_type),
    modifie_le,
    par: nomDe(par),
    jamais: modifie_par === null && !Object.values(m).some((v) => (v && typeof v === "object" ? Object.keys(v).length > 0 : v !== null)),
  };
}

// ---------- maintenance ----------

export type Maintenance = { actif: boolean; message: Textes; modifie_le: string; par: string | null };

export async function lireMaintenanceAdmin(): Promise<Maintenance | null> {
  if (!(await admin())) return null;
  const l = await lire<{ actif: boolean; message: Textes; modifie_le: string; par: Par }>("reglages_maintenance?select=actif,message,modifie_le,par:equipe_profils(prenom,nom)&limit=1");
  const x = l?.[0];
  return x ? { actif: x.actif, message: x.message ?? {}, modifie_le: x.modifie_le, par: nomDe(x.par) } : null;
}

// ---------- profil et carte (le compte connecté seulement) ----------

export type Moi = { prenom: string; nom: string; email: string; telephone: string | null; langues: string[]; theme: ThemeProfil; role: "agent" | "admin" };
export type SessionOuverte = { id: string; cree_le: string; vu_le: string; courante: boolean };

async function moi(s: Session): Promise<Moi | null> {
  const l = await lire<Moi>(`equipe_profils?select=prenom,nom,email,telephone,langues,theme,role&id=eq.${s.profilId}&limit=1`);
  return l?.[0] ?? null;
}

export async function lireProfilMoi(): Promise<{ moi: Moi; sessions: SessionOuverte[] | null } | null> {
  const s = await exigerRole("agents");
  if (!s) return null;
  const p = await moi(s);
  if (!p) return null;
  const maintenant = encodeURIComponent(new Date().toISOString());
  const l = await lire<{ id: string; cree_le: string; vu_le: string }>(`equipe_sessions?select=id,cree_le,vu_le&profil_id=eq.${s.profilId}&revoque_le=is.null&expire_le=gt.${maintenant}&fin_max=gt.${maintenant}&order=vu_le.desc&limit=50`);
  return { moi: p, sessions: l ? l.map((x) => ({ ...x, courante: x.id === s.id })) : null };
}

export type Carte = { moi: Moi; qr: string; vcf: string };

/** Carte de visite du compte connecté : sa fiche vCard et le QR (SVG rendu par le serveur) qui la contient. */
export async function lireCarte(): Promise<Carte | null> {
  const s = await exigerRole("agents");
  if (!s) return null;
  const p = await moi(s);
  if (!p) return null;
  const vcf = vcard({ prenom: p.prenom, nom: p.nom, organisation: R.carte.organisation, titre: R.carte.role[p.role], telephone: p.telephone, email: p.email, langues: p.langues.map((l) => T.langues[l] ?? l).join(", ") });
  try {
    const qr = await QRCode.toString(vcf, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f162d", light: "#ffffff" } });
    return { moi: p, qr, vcf };
  } catch {
    return null;
  }
}
