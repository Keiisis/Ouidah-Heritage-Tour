// Portes P1, P4, P5, P6, P7, P9 du paiement (GATES-PAIEMENTS.md) sur les vrais modules, base Supabase simulée.
// Lancement : node --import ./ts-chargeur.mjs --test paiement-coeur.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://base.test";
process.env.SUPABASE_SECRET_KEY = "cle-de-test";
process.env.BILLET_SECRET = "s".repeat(48);

const { billets, billetAuthentique, cleAcces, cleValide } = await import("@/lib/serveur/paiement/billet");
const { finaliser } = await import("@/lib/serveur/paiement/finaliser");
const { lireDemandeReservation, tarif } = await import("@/lib/reservation");
const { jourDe } = await import("@/lib/jours");

const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const resa = (x = {}) => ({ id: ID, evenement: "ouidah-blue", occurrence: "2027-04-02", formule_nom: "Place", quantite: 2, montant: 30000, devise: "XOF", passerelle: "fedapay", transaction_id: null, statut: "attente", nom: "Awa", email: "awa@exemple.test", telephone: null, langue: "FR", paye_le: null, courriel_envoye: false, reglement_manuel: false, ...x });
const constat = (x = {}) => ({ transaction: "tx-1", reservation: ID, etat: "reussi", montant: 30000, devise: "XOF", ...x });

// Base simulée : une ligne « reservations », mises à jour conditionnelles et index unique comme PostgREST
function baseSimulee(ligne, { transactionsPrises = [] } = {}) {
  const appels = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    appels.push({ methode: init.method ?? "GET", chemin: u.pathname + u.search });
    assert.equal(init.headers?.apikey, "cle-de-test", "clé dans l'en-tête apikey");
    assert.ok(!u.search.includes("cle-de-test"), "clé jamais dans l'adresse");
    const filtres = Object.fromEntries([...u.searchParams].filter(([k]) => k !== "select" && k !== "limit"));
    const correspond = Object.entries(filtres).every(([k, v]) => (v.startsWith("eq.") ? String(ligne[k]) === v.slice(3) : v === "is.false" ? ligne[k] === false : true));
    if ((init.method ?? "GET") === "GET") return Response.json(correspond ? [ligne] : []);
    const corps = JSON.parse(init.body);
    if (corps.transaction_id && transactionsPrises.includes(corps.transaction_id)) return new Response('{"code":"23505"}', { status: 409 });
    if (!correspond) return Response.json([]);
    Object.assign(ligne, corps);
    return Response.json([ligne]);
  };
  return appels;
}

test("P1 : la demande ignore tout montant envoyé par le navigateur ; le prix vient du contenu", () => {
  const d = lireDemandeReservation({ evenement: "ouidah-blue", formule: 0, quantite: 2, nom: "Awa", email: "awa@exemple.test", langue: "FR", passerelle: "fedapay", consentement: true, duree: 4000, montant: 1, prix: 1 });
  assert.ok(d);
  assert.equal("montant" in d, false);
  assert.equal("prix" in d, false);
  const evenements = [{ slug: "ouidah-blue", quand: { type: "annuel", mois: 4, jour: 2, jours: 2 }, offre: { type: "billet", categories: [{ nom: "Place", detail: "", prix: 15000 }], places: null, jauge: 300, acompte: null } }];
  const t = tarif(evenements, "ouidah-blue", 0, jourDe(2026, 9, 27));
  assert.deepEqual(t, { formuleNom: "Place", prix: 15000, capacite: 300, occurrence: "2027-04-02", fin: "2027-04-03" });
});

test("P1 : prix « sur demande » (null), formule inconnue ou événement inconnu : aucun tarif", () => {
  const ev = [{ slug: "vodun-days", quand: { type: "annuel", mois: 1, jour: 10, jours: 1 }, offre: { type: "sejour", nom: "Séjour", inclus: "", nuits: null, prix: null, places: null, acompte: null } }];
  assert.equal(tarif(ev, "vodun-days", 0, 20000), null);
  assert.equal(tarif(ev, "vodun-days", 1, 20000), null);
  assert.equal(tarif(ev, "inconnu", 0, 20000), null);
});

test("demande refusée : sans accord, e-mail faux, quantité hors bornes, passerelle inconnue", () => {
  const ok = { evenement: "ouidah-blue", formule: 0, quantite: 1, nom: "Awa", email: "awa@exemple.test", langue: "FR", passerelle: "stripe", consentement: true, duree: 4000 };
  assert.ok(lireDemandeReservation(ok));
  assert.equal(lireDemandeReservation({ ...ok, consentement: false }), null);
  assert.equal(lireDemandeReservation({ ...ok, email: "awa@" }), null);
  assert.equal(lireDemandeReservation({ ...ok, quantite: 11 }), null);
  assert.equal(lireDemandeReservation({ ...ok, quantite: 0 }), null);
  assert.equal(lireDemandeReservation({ ...ok, passerelle: "zeyow" }), null);
});

test("P5/P6 : finaliser paie une seule fois ; le second appel renvoie l'état réel sans rien refaire", async () => {
  const ligne = resa();
  const appels = baseSimulee(ligne);
  const a = await finaliser(resa(), constat());
  assert.equal(a.statut, "paye");
  assert.equal(ligne.montant_recu, 30000);
  assert.ok(appels[0].chemin.includes("statut=eq.attente"), "mise à jour conditionnelle sur « attente »");
  const b = await finaliser(resa(), constat()); // le webhook arrive après le retour (copie périmée encore « attente »)
  assert.equal(b.statut, "paye");
  assert.equal(b.refus, undefined);
  assert.equal(appels.filter((x) => x.methode === "PATCH").length, 2, "seconde mise à jour sans effet (0 ligne), puis relecture");
  const c = await finaliser(ligne, constat()); // copie à jour : rien n'est réécrit
  assert.equal(c.statut, "paye");
  assert.equal(appels.filter((x) => x.methode === "PATCH").length, 2);
});

test("P3 : montant insuffisant, devise différente, transaction non réussie ou d'une autre réservation : rien n'est payé", async () => {
  for (const [c, refus] of [
    [constat({ montant: 29999 }), "montant"],
    [constat({ montant: null }), "montant"],
    [constat({ devise: "EUR", montant: 30000 }), "devise"],
    [constat({ etat: "en_cours" }), "non_reussi"],
    [constat({ etat: "echoue" }), "non_reussi"],
    [constat({ reservation: "autre-reservation" }), "reference"],
    [constat({ reservation: null }), "reference"], // ni référence ni transaction notée à la création
  ]) {
    const ligne = resa();
    baseSimulee(ligne);
    const r = await finaliser(resa(), c);
    assert.equal(r.statut, "attente", refus);
    assert.equal(r.refus, refus);
    assert.equal(ligne.statut, "attente", `${refus} : base inchangée`);
  }
});

test("P4 : une transaction qui a déjà payé une autre réservation est refusée (index unique)", async () => {
  const ligne = resa();
  baseSimulee(ligne, { transactionsPrises: ["tx-1"] });
  const r = await finaliser(resa(), constat());
  assert.equal(r.refus, "transaction_deja_utilisee");
  assert.equal(ligne.statut, "attente");
});

test("P9 : rien dans finaliser ne fait « abandonner » une réservation ; un échec la laisse en attente", async () => {
  const ligne = resa();
  baseSimulee(ligne);
  await finaliser(resa(), constat({ etat: "echoue" }));
  assert.equal(ligne.statut, "attente");
});

test("transaction notée à la création (sans référence chez la passerelle) : acceptée seulement si c'est la même", async () => {
  const ligne = resa({ transaction_id: "tx-1" });
  baseSimulee(ligne);
  assert.equal((await finaliser(resa({ transaction_id: "tx-1" }), constat({ reservation: null }))).statut, "paye");
  const autre = resa({ transaction_id: "tx-9" });
  baseSimulee(autre);
  assert.equal((await finaliser(resa({ transaction_id: "tx-9" }), constat({ reservation: null }))).refus, "reference");
});

test("remboursement constaté : payée → remboursée ; une réservation en attente ne bouge pas", async () => {
  const ligne = resa({ statut: "paye", transaction_id: "tx-1", paye_le: "2026-10-27T10:00:00Z" });
  baseSimulee(ligne);
  assert.equal((await finaliser(ligne, constat({ etat: "rembourse" }))).statut, "rembourse");
  const att = resa();
  baseSimulee(att);
  assert.equal((await finaliser(att, constat({ etat: "rembourse" }))).statut, "attente");
});

test("P7 : sans BILLET_SECRET (ou trop court), aucun billet ni clé d'accès ; aucune valeur de repli", () => {
  const garde = process.env.BILLET_SECRET;
  try {
    delete process.env.BILLET_SECRET;
    assert.throws(() => billets({ id: ID, quantite: 1 }), /BILLET_SECRET/);
    assert.throws(() => cleAcces(ID), /BILLET_SECRET/);
    process.env.BILLET_SECRET = "court";
    assert.throws(() => billets({ id: ID, quantite: 1 }), /BILLET_SECRET/);
  } finally {
    process.env.BILLET_SECRET = garde;
  }
});

test("billets : un par place, code signé vérifiable, falsification détectée ; clé d'accès vérifiée à temps constant", () => {
  const b = billets({ id: ID, quantite: 3 });
  assert.equal(b.length, 3);
  assert.equal(new Set(b.map((x) => x.code)).size, 3);
  assert.ok(b.every((x) => billetAuthentique(x.code)));
  const faux = b[0].code.replace(/:1:/, ":2:");
  assert.equal(billetAuthentique(faux), false);
  assert.equal(billetAuthentique(b[0].code.slice(0, -1) + (b[0].code.endsWith("A") ? "B" : "A")), false);
  const cle = cleAcces(ID);
  assert.ok(cleValide(ID, cle));
  assert.equal(cleValide(ID, cle.slice(0, -1) + (cle.endsWith("A") ? "B" : "A")), false);
  assert.equal(cleValide("11111111-2222-4333-8444-555555555555", cle), false);
  assert.equal(cleValide(ID, undefined), false);
});
