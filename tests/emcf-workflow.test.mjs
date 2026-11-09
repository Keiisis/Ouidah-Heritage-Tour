// Actions réelles, client HTTP réel sur fetch simulé ; dépendances DB/session remplacées.
// Le verrou transactionnel lui-même est vérifié séparément sur PostgreSQL.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

globalThis.__emcfWorkflow = {};
const exportsSimules = (noms) => noms.map((nom) => `export const ${nom} = (...args) => globalThis.__emcfWorkflow.${nom}(...args);`).join("\n");
registerHooks({
  resolve(spec, ctx, suite) {
    if (ctx.parentURL?.endsWith("/emcf/actions.ts")) {
      const modules = {
        "next/cache": ["refresh"], "@/lib/suivi": ["langueDoc"], "../base": ["base"],
        "../equipe/session": ["exigerRole"], "../equipe/journal": ["journaliser"],
        "../equipe/finances/lectures": ["factureAccessible"],
        "./operations": ["creerOperation", "enregistrerResultat", "lireOperation", "lireOperationDocument", "prendreOperation"],
      };
      if (modules[spec]) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(exportsSimules(modules[spec]))}` };
    }
    return suite(spec, ctx);
  },
});
const { preparerFactureEmcf, executerOperationEmcf, verifierConnexionEmcf } = await import("@/lib/serveur/emcf/actions");
const { demandeDepuisFacture, memeDemande } = await import("@/lib/serveur/emcf/regles");
const fetchAvant = globalThis.fetch, envAvant = { ...process.env };
const FACTURE = "10000000-0000-4000-8000-000000000001", AVOIR = "20000000-0000-4000-8000-000000000001";
const ADMIN = "30000000-0000-4000-8000-000000000001", OP = "40000000-0000-4000-8000-000000000001", OPAVOIR = "40000000-0000-4000-8000-000000000002";
const clone = (v) => v === undefined ? undefined : structuredClone(v);
const taxes = { a: 0, b: 18, c: 0, d: 18, e: 0, f: 0, aibA: 1, aibB: 5 };
const operateur = { id: ADMIN, name: "Direction OHT" };
const securite = { dateTime: "06/11/2026 12:00:00", qrCode: "F;TS-LOCAL;CODE-FISCAL-LOCAL", codeMECeFDGI: "CODE-FISCAL-LOCAL", counters: "1/1 FV", nim: "TS-LOCAL" };
let session, facture, identite, nim, statut, operations, appels, journaux, repondre, echecResultat;

function fixtureFacture() {
  return { id: FACTURE, numero: "F-2026-00001", emise: "2026-11-06T10:00:00Z", demande: FACTURE, devis: FACTURE,
    client: { nom: "Client fictif", email: "test@example.invalid", langue: "FR", pays: null },
    lignes: [{ libelle: "Visite", prix_unitaire: 10000, quantite: 2 }], montant: 20000,
    fiscalite: { tva_active: false, tva_taux: 0, ht: 20000, tva: 0, ttc: 20000, commission_active: false, commission_taux: 0, agent_id: null, regles_le: "2026-11-06T10:00:00Z" },
    statut: "payee", envoyee: null, payee: "2026-11-06T10:00:00Z", avoirs: [], paiements: [], net: 20000, recu: 20000, ecart: 0 };
}
function operation(etat = "preparee", extras = {}) {
  return { id: OP, facture_id: FACTURE, avoir_id: null, environnement: "test", ifu: identite.ifu,
    requete: demandeDepuisFacture(fixtureFacture(), "A", "MOBILEMONEY", taxes, identite.ifu, operateur),
    identite: { ...identite, nim, fiscalite: clone(facture.fiscalite) },
    uid: etat === "preparee" ? null : "uid-local", calcul: etat === "preparee" ? null : { uid: "uid-local", total: 20000, vab: 0, vad: 0, aib: 0, ts: 0 },
    securite: etat === "confirmee" ? clone(securite) : null, etat, erreur: null, cree_par: ADMIN,
    cree_le: "2026-11-06T10:00:00Z", modifie_le: "2026-11-06T10:00:00Z", ...extras };
}
function ajouterOperation(etat, extras) { const op = operation(etat, extras); operations.set(op.id, op); return op; }
const mutations = () => appels.filter((a) => a.init.method !== "GET");

beforeEach(() => {
  Object.assign(process.env, { EMCF_JETON: "test-jwt.fictif.signature", EMCF_ENVIRONNEMENT: "test", EMCF_PRODUCTION_AUTORISEE: "0" });
  session = { role: "admin", profilId: ADMIN, prenom: "Direction", nom: "OHT" };
  facture = fixtureFacture(); identite = { ifu: "1234567890123", raison_sociale: "OHT fictif", adresse: "Adresse fictive" }; nim = "TS-LOCAL";
  statut = { status: true, ifu: identite.ifu, nim, tokenValid: "2027-01-01T00:00:00Z", serverDateTime: "2026-11-06T12:00:00Z" };
  operations = new Map(); appels = []; journaux = []; echecResultat = false;
  repondre = (url, init) => {
    const chemin = new URL(url).pathname.split("/api/")[1];
    if (chemin === "info/status") return Response.json(statut);
    if (chemin === "info/taxGroups") return Response.json(taxes);
    if (chemin === "invoice" && init.method === "POST") return Response.json({ uid: "uid-local", total: 20000, vab: 0, vad: 0, aib: 0, ts: 0 });
    if (chemin.endsWith("/confirm")) return Response.json(securite);
    if (chemin.endsWith("/cancel")) return Response.json({});
    if (chemin.startsWith("invoice/")) return Response.json([...operations.values()].find((o) => o.uid === decodeURIComponent(chemin.slice(8)))?.requete);
    throw Error("chemin de test non prévu");
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).origin, "https://developper.impots.bj", "interception de tout accès externe");
    appels.push({ url, init }); return repondre(url, init);
  };
  Object.assign(globalThis.__emcfWorkflow, {
    refresh: () => {}, langueDoc: (l) => l,
    exigerRole: async (role) => { assert.equal(role, "admins"); return clone(session); },
    journaliser: async (...v) => { journaux.push(v); },
    base: async (chemin) => {
      if (chemin.startsWith("reglages_documents?")) return Response.json([identite]);
      if (chemin.startsWith("reglages_site?")) return Response.json([{ emcf_nim: nim }]);
      throw Error("lecture de test non prévue");
    },
    factureAccessible: async (s, id) => { assert.equal(s.role, "admin"); assert.equal(id, FACTURE); return clone(facture); },
    lireOperation: async (id) => clone(operations.get(id) ?? null),
    lireOperationDocument: async (id, avoir, environnement) => clone([...operations.values()].find((o) => o.facture_id === id && o.avoir_id === avoir && o.environnement === environnement) ?? null),
    creerOperation: async (v) => {
      const ancienne = [...operations.values()].find((o) => o.facture_id === v.factureId && o.avoir_id === (v.avoirId ?? null) && o.environnement === v.environnement);
      if (ancienne) return clone(ancienne);
      const op = operation("preparee", { id: v.avoirId ? OPAVOIR : OP, facture_id: v.factureId, avoir_id: v.avoirId ?? null,
        environnement: v.environnement, ifu: v.ifu, requete: clone(v.requete), identite: clone(v.identite), cree_par: v.creePar });
      operations.set(op.id, op); return clone(op);
    },
    prendreOperation: async (id, de, vers) => {
      const op = operations.get(id); if (!op || op.etat !== de) return null;
      op.etat = vers; op.erreur = null; return clone(op);
    },
    enregistrerResultat: async (id, de, resultat) => {
      if (echecResultat) return null;
      const op = operations.get(id); if (!op || op.etat !== de) return null;
      Object.assign(op, clone(resultat)); return clone(op);
    },
  });
});
after(() => {
  globalThis.fetch = fetchAvant;
  for (const cle of ["EMCF_JETON", "EMCF_ENVIRONNEMENT", "EMCF_PRODUCTION_AUTORISEE"]) {
    if (envAvant[cle] === undefined) delete process.env[cle]; else process.env[cle] = envAvant[cle];
  }
});

test("rôle : agent et session absente n'atteignent aucune lecture ou écriture DGI", async () => {
  for (const valeur of [null, { ...session, role: "agent" }]) {
    session = valeur;
    assert.deepEqual(await verifierConnexionEmcf(), { erreur: "refuse" });
    assert.deepEqual(await preparerFactureEmcf({ facture: FACTURE, groupe: "A", paiement: "MOBILEMONEY" }), { erreur: "refuse" });
    assert.deepEqual(await executerOperationEmcf(OP, "envoyer"), { erreur: "refuse" });
  }
  assert.equal(appels.length, 0); assert.equal(operations.size, 0);
});

test("configuration : jeton absent ou production verrouillée empêchent les actions", async () => {
  for (const config of [{ EMCF_JETON: "" }, { EMCF_JETON: "test-jwt.fictif.signature", EMCF_ENVIRONNEMENT: "production" }]) {
    Object.assign(process.env, config);
    assert.deepEqual(await verifierConnexionEmcf(), { erreur: "configuration" });
    assert.deepEqual(await preparerFactureEmcf({ facture: FACTURE }), { erreur: "configuration" });
    assert.deepEqual(await executerOperationEmcf(OP, "envoyer"), { erreur: "configuration" });
  }
  assert.equal(appels.length, 0);
});

test("identité : IFU/NIM, compte actif et validité du jeton doivent correspondre", async () => {
  assert.equal((await verifierConnexionEmcf()).ok, true);
  for (const changer of [() => { identite.ifu = "invalide"; }, () => { statut.ifu = "9999999999999"; },
    () => { statut.nim = "AUTRE-NIM"; }, () => { statut.status = false; }, () => { statut.tokenValid = statut.serverDateTime; }]) {
    identite.ifu = "1234567890123";
    statut = { status: true, ifu: identite.ifu, nim, tokenValid: "2027-01-01T00:00:00Z", serverDateTime: "2026-11-06T12:00:00Z" };
    changer(); assert.deepEqual(await verifierConnexionEmcf(), { erreur: "identite" });
  }
  assert.equal(mutations().length, 0);
});

test("source : montants navigateur ignorés, demande et identité viennent de la facture enregistrée", async () => {
  const r = await preparerFactureEmcf({ facture: FACTURE, groupe: "A", paiement: "MOBILEMONEY", montant: 1, ifu: "faux", items: [] });
  assert.deepEqual(r, { ok: true, operation: OP });
  const op = operations.get(OP);
  assert.equal(op.requete.items[0].price, 10000); assert.equal(op.requete.payment[0].amount, 20000);
  assert.equal(op.requete.ifu, identite.ifu); assert.equal(op.requete.operator.id, ADMIN);
  assert.equal(op.identite.documentNumero, facture.numero); assert.equal(op.identite.fiscalite.ttc, 20000);
  assert.equal(mutations().length, 0, "préparer ne soumet rien à la DGI");
  assert.equal(journaux.length, 1);
});

test("préparation concurrente et répétée : une opération et aucun remplacement du snapshot", async () => {
  const demande = { facture: FACTURE, groupe: "A", paiement: "MOBILEMONEY" };
  assert.deepEqual(await Promise.all([preparerFactureEmcf(demande), preparerFactureEmcf(demande)]), [{ ok: true, operation: OP }, { ok: true, operation: OP }]);
  assert.equal(operations.size, 1);
  const original = clone(operations.get(OP).requete);
  assert.deepEqual(await preparerFactureEmcf({ ...demande, groupe: "F", paiement: "ESPECES" }), { ok: true, operation: OP });
  assert.deepEqual(operations.get(OP).requete, original);
});

test("fiscalité : groupe explicite, taux DGI, total des lignes et encaissement cohérents", () => {
  const fabriquer = (f, groupe = "A", paiement = "MOBILEMONEY") => demandeDepuisFacture(f, groupe, paiement, taxes, identite.ifu, operateur);
  assert.equal(demandeDepuisFacture(facture, undefined, "MOBILEMONEY", taxes, identite.ifu, operateur), null);
  assert.equal(fabriquer(facture, "B"), null);
  assert.equal(fabriquer({ ...facture, fiscalite: null }), null);
  assert.equal(fabriquer({ ...facture, montant: 20001 }), null);
  assert.equal(fabriquer({ ...facture, lignes: [{ ...facture.lignes[0], prix_unitaire: 9999 }] }), null);
  assert.equal(fabriquer({ ...facture, fiscalite: { ...facture.fiscalite, ht: 19999 } }), null, "HT + TVA doit égaler le TTC");
  assert.equal(fabriquer({ ...facture, fiscalite: { ...facture.fiscalite, ht: 19999.5, tva: 0.5 } }), null, "les fractions de franc ne certifient pas un document");
  assert.equal(fabriquer({ ...facture, fiscalite: { ...facture.fiscalite, ht: 20001, tva: -1 } }), null, "TVA négative refusée même si la somme correspond");
  assert.equal(fabriquer({ ...facture, lignes: [{ libelle: "Montant fractionnaire", prix_unitaire: 1, quantite: 19999.6 }] }), null, "ne pas arrondir silencieusement les lignes");
  assert.equal(fabriquer({ ...facture, lignes: [
    { libelle: "Première fraction", prix_unitaire: 1, quantite: 9999.5 },
    { libelle: "Seconde fraction", prix_unitaire: 1, quantite: 10000.5 },
  ] }), null, "une somme entière ne rend pas chaque ligne admissible");
  assert.equal(fabriquer({ ...facture, lignes: [{ libelle: "Demi-prestation", prix_unitaire: 40000, quantite: 0.5 }] }).items[0].quantity, 0.5, "quantité décimale admise lorsque son montant reste entier");
  assert.equal(fabriquer({ ...facture, recu: 10000 }), null);
  assert.equal(fabriquer({ ...facture, recu: 10000 }, "A", "CREDIT").payment[0].name, "CREDIT");
  const taxable = { ...facture, fiscalite: { ...facture.fiscalite, tva_active: true, tva_taux: 18, ht: 16949, tva: 3051 } };
  assert.equal(fabriquer(taxable, "B").items[0].taxGroup, "B");
});

test("envoi : réservation atomique avant POST et un seul UID pour deux clics", async () => {
  ajouterOperation("preparee");
  const normal = repondre;
  repondre = (url, init) => {
    if (init.method === "POST") assert.equal(operations.get(OP).etat, "envoi");
    return normal(url, init);
  };
  const resultats = await Promise.all([executerOperationEmcf(OP, "envoyer"), executerOperationEmcf(OP, "envoyer")]);
  assert.equal(resultats.filter((r) => r.ok).length, 1);
  assert.equal(resultats.filter((r) => r.erreur === "etat").length, 1);
  assert.equal(mutations().length, 1); assert.equal(operations.get(OP).uid, "uid-local"); assert.equal(operations.get(OP).etat, "attente");
});

test("confirmation : montant, TVA, AIB et taxe spécifique divergents n'envoient aucun PUT", async () => {
  for (const divergences of [{ total: 19999 }, { vab: 1 }, { vad: 1 }, { aib: 1 }, { ts: 1 }]) {
    const op = ajouterOperation("attente"); Object.assign(op.calcul, divergences);
    assert.deepEqual(await executerOperationEmcf(OP, "confirmer"), { erreur: "total" });
    assert.equal(op.etat, "attente");
  }
  assert.equal(mutations().length, 0);
});

test("confirmation : détail DGI changé est refusé ; ordre de clés JSON équivalent accepté", async () => {
  const op = ajouterOperation("attente"); const normal = repondre;
  repondre = (url, init) => url.endsWith("/invoice/uid-local") ? Response.json({ ...op.requete, payment: [{ amount: 20001, name: "MOBILEMONEY" }] }) : normal(url, init);
  assert.deepEqual(await executerOperationEmcf(OP, "confirmer"), { erreur: "incoherence" });
  assert.equal(mutations().length, 0);
  repondre = (url, init) => url.endsWith("/invoice/uid-local") ? Response.json({ ...op.requete, payment: [{ amount: 20000, name: "MOBILEMONEY" }] }) : normal(url, init);
  assert.deepEqual(await executerOperationEmcf(OP, "confirmer"), { ok: true, operation: OP });
  assert.equal(op.etat, "confirmee"); assert.deepEqual(op.securite, securite); assert.equal(mutations().length, 1);
  const inverse = { ...op.requete, payment: [{ amount: 20000, name: "MOBILEMONEY" }] };
  assert.equal(memeDemande(op.requete, inverse), true);
});

test("certification avec mauvais NIM : état incertain, aucune facture déclarée certifiée", async () => {
  const op = ajouterOperation("attente"); const normal = repondre;
  repondre = (url, init) => url.endsWith("/confirm") ? Response.json({ ...securite, nim: "NIM-ETRANGER" }) : normal(url, init);
  assert.deepEqual(await executerOperationEmcf(OP, "confirmer"), { erreur: "incertaine" });
  assert.equal(op.etat, "incertaine"); assert.equal(op.securite, null);
  assert.deepEqual(await executerOperationEmcf(OP, "confirmer"), { erreur: "etat" });
  assert.equal(mutations().length, 1);
});

test("confirmation concurrente : un seul PUT de normalisation", async () => {
  const op = ajouterOperation("attente");
  const resultat = await Promise.all([executerOperationEmcf(OP, "confirmer"), executerOperationEmcf(OP, "confirmer")]);
  assert.equal(resultat.filter((r) => r.ok).length, 1);
  assert.equal(resultat.filter((r) => r.erreur === "etat").length, 1);
  assert.equal(mutations().length, 1); assert.equal(op.etat, "confirmee");
});

test("réponse perdue : état incertain durable et aucun second POST même sur clic explicite", async () => {
  const op = ajouterOperation("preparee"); const normal = repondre;
  repondre = (url, init) => { if (init.method === "POST") throw Error("réponse perdue"); return normal(url, init); };
  assert.deepEqual(await executerOperationEmcf(OP, "envoyer"), { erreur: "incertaine" });
  assert.equal(op.etat, "incertaine"); assert.equal(op.uid, null);
  assert.deepEqual(await executerOperationEmcf(OP, "envoyer"), { erreur: "etat" });
  assert.equal(mutations().length, 1);
});

test("DGI reçue mais sauvegarde impossible : réservation conservée, aucun rejeu", async () => {
  const op = ajouterOperation("preparee"); echecResultat = true;
  assert.deepEqual(await executerOperationEmcf(OP, "envoyer"), { erreur: "base" });
  assert.equal(op.etat, "envoi");
  assert.deepEqual(await executerOperationEmcf(OP, "envoyer"), { erreur: "etat" });
  assert.equal(mutations().length, 1);
});

test("journal indisponible après confirmation enregistrée : erreur visible, certification préservée et aucun rejeu", async () => {
  const op = ajouterOperation("attente");
  globalThis.__emcfWorkflow.journaliser = async () => { throw Error("journal inaccessible"); };
  assert.deepEqual(await executerOperationEmcf(OP, "confirmer"), { erreur: "base" });
  assert.equal(op.etat, "confirmee"); assert.deepEqual(op.securite, securite);
  assert.deepEqual(await executerOperationEmcf(OP, "confirmer"), { erreur: "etat" });
  assert.equal(mutations().length, 1);
});

test("annulation avant envoi : purement locale ; annulation en attente utilise UID et PUT unique", async () => {
  const locale = ajouterOperation("preparee");
  assert.deepEqual(await executerOperationEmcf(OP, "annuler"), { ok: true, operation: OP });
  assert.equal(locale.etat, "annulee"); assert.equal(appels.length, 0);
  const distante = ajouterOperation("attente");
  assert.deepEqual(await executerOperationEmcf(OP, "annuler"), { ok: true, operation: OP });
  assert.equal(distante.etat, "annulee"); assert.equal(mutations().length, 1);
  assert.equal(mutations()[0].url.endsWith("/invoice/uid-local/cancel"), true);
});

test("avoir total : référence au code DGI original, articles figés et opérateur actuel", async () => {
  const parent = ajouterOperation("confirmee");
  facture.avoirs = [{ id: AVOIR, numero: "A-2026-00001", montant: 20000, motif: "Annulation totale", cree: "2026-11-06T14:00:00Z" }]; facture.statut = "annulee";
  assert.deepEqual(await preparerFactureEmcf({ facture: FACTURE, avoir: AVOIR }), { ok: true, operation: OPAVOIR });
  const avoir = operations.get(OPAVOIR);
  assert.equal(avoir.requete.type, "FA"); assert.equal(avoir.requete.reference, parent.securite.codeMECeFDGI);
  assert.notEqual(avoir.requete.reference, parent.uid); assert.notEqual(avoir.requete.reference, facture.numero);
  assert.deepEqual(avoir.requete.items, parent.requete.items); assert.deepEqual(avoir.requete.operator, operateur);
  assert.equal(avoir.identite.documentNumero, facture.avoirs[0].numero);
});

test("avoir partiel, parent non certifié et parent autre environnement ne sont pas envoyés", async () => {
  const parent = ajouterOperation("confirmee");
  facture.avoirs = [{ id: AVOIR, numero: "A-2026-00001", montant: 10000, motif: "Partiel", cree: "2026-11-06T14:00:00Z" }];
  assert.deepEqual(await preparerFactureEmcf({ facture: FACTURE, avoir: AVOIR }), { erreur: "source" });
  facture.avoirs[0].montant = 20000; parent.etat = "attente";
  assert.deepEqual(await preparerFactureEmcf({ facture: FACTURE, avoir: AVOIR }), { erreur: "source" });
  parent.etat = "confirmee"; parent.environnement = "production";
  assert.deepEqual(await preparerFactureEmcf({ facture: FACTURE, avoir: AVOIR }), { erreur: "source" });
  assert.equal(mutations().length, 0);
});

test("facture devenue créditée après préparation : aucun POST tant qu'elle n'est plus admissible", async () => {
  ajouterOperation("preparee");
  facture.avoirs = [{ id: AVOIR, numero: "A-2026-00001", montant: 10000, motif: "Avoir nouveau", cree: "2026-11-06T14:00:00Z" }];
  assert.deepEqual(await executerOperationEmcf(OP, "envoyer"), { erreur: "source" });
  assert.equal(mutations().length, 0);
});
