// Modules métier et action réels ; transport isolé, aucun envoi ni base réelle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
globalThis.__fiscalSession = null;
registerHooks({
  resolve(spec, ctx, suivant) {
    if (spec === "next/cache") return { shortCircuit: true, url: "data:text/javascript,export const refresh=()=>{}" };
    return suivant(spec, ctx);
  },
  load(url, ctx, suivant) {
    if (url.endsWith("/src/lib/serveur/equipe/session.ts")) return { format: "module", shortCircuit: true, source: "export const exigerRole=async()=>globalThis.__fiscalSession?.role==='admin'?globalThis.__fiscalSession:null;" };
    return suivant(url, ctx);
  },
});
process.env.SUPABASE_URL = "https://fiscalite.test";
process.env.SUPABASE_SECRET_KEY = "fixture";
const { ventilationTva, taxeDocument, commissionCumulee, lireReglesFinancieres } = await import("@/lib/serveur/equipe/finances/fiscalite-regles");
const { enregistrerReglesFinancieres } = await import("@/lib/serveur/equipe/finances/fiscalite-actions");
const { reglesFinancieres, commissionsMois } = await import("@/lib/serveur/equipe/finances/fiscalite");
const { empreinteDevis } = await import("@/lib/serveur/documents/signature");
const AGENT = "00000000-0000-4000-8000-000000000001";
const f = { ...ventilationTva(120000, true, 20), commission_active: true, commission_taux: 10, agent_id: AGENT, regles_le: "2026-10-01T10:00:00Z" };

test("TVA incluse : désactivée, taux nul/maximal, arrondi au franc et grands montants", () => {
  assert.deepEqual(ventilationTva(120000, false, 20), { tva_active: false, tva_taux: 0, ht: 120000, tva: 0, ttc: 120000 });
  assert.equal(f.ht, 100000); assert.equal(f.tva, 20000);
  assert.equal(ventilationTva(3, true, 100).ht, 2);
  assert.equal(ventilationTva(120000, true, 0).ht, 120000);
  for (const total of [0, 1, 3, 999, 99999999999, Number.MAX_SAFE_INTEGER]) {
    const v = ventilationTva(total, true, 18.75);
    assert.equal(v.ht + v.tva, total);
    const d = BigInt(11875), numerateur = BigInt(total) * BigInt(10000);
    assert.equal(v.ht, Number((numerateur + d / BigInt(2)) / d));
  }
  for (const taux of [-1, 101, NaN, Infinity, 1.001]) assert.throws(() => ventilationTva(100, true, taux));
  assert.throws(() => ventilationTva(1.5, true, 20));
});

test("validation du formulaire, sans taux implicite ni activation forgée", () => {
  const data = new FormData(); data.set("tva_taux", "18,75"); data.set("commission_taux", "2.5"); data.set("tva_active", "on");
  assert.deepEqual(lireReglesFinancieres(data), { tva_active: true, tva_taux: 18.75, commission_active: false, commission_taux: 2.5 });
  for (const taux of ["", "-1", "100.01", "1.001", "NaN", "Infinity", "1e1"]) assert.equal(lireReglesFinancieres({ tva_taux: taux, commission_taux: 0 }), null);
  assert.equal(lireReglesFinancieres({ tva_taux: 20, commission_taux: 10, tva_active: "false" }), null);
});

test("document public : aucune commission ni identité agent ; ancien document inchangé", () => {
  assert.equal(taxeDocument(null, 120000), null);
  assert.deepEqual(taxeDocument(f, 120000), { tva_active: true, tva_taux: 20, ht: 100000, tva: 20000, ttc: 120000 });
  assert.deepEqual(taxeDocument(f, 12000), { tva_active: true, tva_taux: 20, ht: 10000, tva: 2000, ttc: 12000 });
});

test("commissions : encaissement réel, avoir tardif, écriture inverse, plafond et documents inactifs", () => {
  const paiements = [{ montant: 60000, date: "2026-10-10T10:00:00Z" }, { montant: 60000, date: "2026-11-10T10:00:00Z" }];
  const avoirs = [{ montant: 24000, date: "2026-12-10T10:00:00Z" }];
  const cumul = (fin, ps = paiements) => commissionCumulee(f, ps, avoirs, fin);
  assert.deepEqual(cumul("2026-11-01"), { ht: 50000, commission: 5000 });
  assert.deepEqual(cumul("2026-12-01"), { ht: 100000, commission: 10000 });
  assert.deepEqual(cumul("2027-01-01"), { ht: 80000, commission: 8000 });
  assert.deepEqual(cumul("2027-01-01", [...paiements, { montant: -60000, date: "2026-12-15" }]), { ht: 50000, commission: 5000 });
  assert.deepEqual(cumul("2026-12-01", [...paiements, { montant: 999999, date: "2026-10-10" }]), { ht: 100000, commission: 10000 });
  for (const snapshot of [{ ...f, commission_active: false }, { ...f, agent_id: null }, { ...f, ttc: 0 }]) assert.deepEqual(commissionCumulee(snapshot, paiements, [], "2027-01-01"), { ht: 0, commission: 0 });
});

test("empreinte : anciennes signatures conservées, ventilation fiscale prise en compte, commission privée exclue", () => {
  const d = { numero: "D-2026-000001", lignes: [{ libelle: "TEST", quantite: 1, prix_unitaire: 120000 }], montant: 120000, devise: "XOF", valable_jusqu_au: null, publie_le: "2026-10-01T10:00:00Z" }, c = { nom: "TEST", email: "test@example.invalid" };
  assert.equal(empreinteDevis(d, c), empreinteDevis({ ...d, fiscalite: null }, c));
  assert.notEqual(empreinteDevis(d, c), empreinteDevis({ ...d, fiscalite: f }, c));
  assert.equal(empreinteDevis({ ...d, fiscalite: f }, c), empreinteDevis({ ...d, fiscalite: { ...f, commission_taux: 99, agent_id: "autre" } }, c));
});

test("action admin réelle : session, validation, RPC refusée, succès et acteur provenant de la session", async () => {
  const appels = []; let succes = false;
  globalThis.fetch = async (url, init) => { assert.equal(new URL(url).hostname, "fiscalite.test"); appels.push({ url, corps: JSON.parse(init.body) }); return Response.json(succes); };
  const saisie = { tva_active: true, tva_taux: 20, commission_active: true, commission_taux: 10, p_par: "forge" };
  assert.deepEqual(await enregistrerReglesFinancieres(saisie), { erreur: "refuse" });
  globalThis.__fiscalSession = { role: "agent", profilId: AGENT };
  assert.deepEqual(await enregistrerReglesFinancieres(saisie), { erreur: "refuse" });
  globalThis.__fiscalSession = { role: "admin", profilId: AGENT };
  assert.deepEqual(await enregistrerReglesFinancieres({ ...saisie, tva_taux: 101 }), { erreur: "champs" });
  assert.equal(appels.length, 0);
  assert.deepEqual(await enregistrerReglesFinancieres(saisie), { erreur: "panne" });
  succes = true;
  assert.deepEqual(await enregistrerReglesFinancieres(saisie), { ok: true });
  assert.equal(appels.at(-1).corps.p_par, AGENT);
  assert.match(appels.at(-1).url, /rpc\/finances_regler$/);
});

test("rapport mensuel réel : taux figé, paiements en attente exclus, avoirs du mois, pagination et panne", async () => {
  const offsets = []; let panne = false;
  const ligne = { fiscalite: f, paiements: [{ montant: 120000, devise: "XOF", etat: "confirme", recu_le: "2026-10-15" }, { montant: 999999, devise: "XOF", etat: "a_confirmer", recu_le: "2026-10-15" }], liens: [], avoirs: [{ montant: 24000, cree_le: "2026-11-05T10:00:00Z" }] };
  globalThis.fetch = async (url) => {
    const u = new URL(url); assert.equal(u.hostname, "fiscalite.test");
    if (panne) return new Response(null, { status: 503 });
    if (u.pathname.endsWith("finances_regles")) return Response.json([{ tva_active: false, tva_taux: "0", commission_active: false, commission_taux: "99", modifie_le: "2026-11-01T10:00:00Z" }]);
    if (u.pathname.endsWith("equipe_profils")) return Response.json([{ id: AGENT, prenom: "Agent", nom: "TEST" }]);
    assert.ok(u.pathname.endsWith("factures"));
    assert.equal(u.searchParams.get("fiscalite->>commission_active"), "eq.true");
    const offset = Number(u.searchParams.get("offset")); offsets.push(offset);
    return Response.json(offset === 0 ? Array.from({ length: 500 }, () => ligne) : [ligne]);
  };
  assert.equal((await reglesFinancieres()).commission_taux, 99);
  assert.deepEqual(await commissionsMois("2026-11"), [{ id: AGENT, nom: "Agent TEST", ht: -20000 * 501, commission: -2000 * 501, documents: 501 }]);
  assert.deepEqual(offsets, [0, 500]);
  panne = true;
  assert.equal(await reglesFinancieres(), null);
  assert.equal(await commissionsMois("2026-11"), null);
});
