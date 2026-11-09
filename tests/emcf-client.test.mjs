// Contrat DGI vérifié sur les Swagger publics ; transport entièrement simulé.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  ErreurEmcf, lireConfigurationEmcf, lireStatutEmcf, lireGroupesTaxesEmcf,
  lireTypesFacturesEmcf, lireTypesPaiementEmcf, lireAttentesEmcf, soumettreFactureEmcf,
  lireFactureEmcf, confirmerFactureEmcf, annulerFactureEmcf, validerDemandeEmcf,
} from "@/lib/serveur/emcf/client";

const envAvant = { ...process.env };
const fetchAvant = globalThis.fetch;
const timeoutAvant = AbortSignal.timeout;
const appels = [];
let repondre;
const jeton = "test-jwt.synthetique.ne-jamais-imprimer";
const demande = {
  ifu: "1234567890123", type: "FV", items: [{ name: "Visite", price: 10000, quantity: 2, taxGroup: "A" }],
  client: { name: "Client fictif" }, operator: { id: "operateur-test", name: "Opérateur test" },
  payment: [{ name: "MOBILEMONEY", amount: 20000 }],
};
const statut = { status: true, ifu: demande.ifu, nim: "TS000001", tokenValid: "2027-01-01T00:00:00Z", serverDateTime: "2026-11-06T12:00:00Z", emcfList: [] };
const calcul = { uid: "uid-local", total: 20000, ta: 0, taa: 20000 };
const securite = { dateTime: "06/11/2026 12:00:00", qrCode: "F;TS000001;CODE-TEST", codeMECeFDGI: "CODE-TEST", counters: "1/1 FV", nim: "TS000001" };

beforeEach(() => {
  Object.assign(process.env, { EMCF_JETON: jeton, EMCF_ENVIRONNEMENT: "test", EMCF_PRODUCTION_AUTORISEE: "0" });
  appels.length = 0;
  repondre = () => Response.json(statut);
  globalThis.fetch = async (url, init) => { appels.push({ url, init }); return repondre(url, init); };
  AbortSignal.timeout = timeoutAvant;
});
after(() => {
  globalThis.fetch = fetchAvant;
  AbortSignal.timeout = timeoutAvant;
  for (const cle of ["EMCF_JETON", "EMCF_ENVIRONNEMENT", "EMCF_PRODUCTION_AUTORISEE"]) {
    if (envAvant[cle] === undefined) delete process.env[cle]; else process.env[cle] = envAvant[cle];
  }
});

test("configuration : absence, environnement erroné et production verrouillée ne font aucun appel", async () => {
  for (const changement of [{ EMCF_JETON: "" }, { EMCF_JETON: "entete\ninvalide" }, { EMCF_ENVIRONNEMENT: "prod" }, { EMCF_ENVIRONNEMENT: "production" }]) {
    Object.assign(process.env, { EMCF_JETON: jeton, EMCF_ENVIRONNEMENT: "test", EMCF_PRODUCTION_AUTORISEE: "0" }, changement);
    assert.equal(lireConfigurationEmcf().configure, false);
    await assert.rejects(lireStatutEmcf(), { name: "ErreurEmcf", code: "configuration", incertain: false });
  }
  assert.equal(appels.length, 0);
});

test("configuration publique : test par défaut, aucune clé, production uniquement après verrou explicite", async () => {
  delete process.env.EMCF_ENVIRONNEMENT;
  assert.equal(lireConfigurationEmcf().environnement, "test");
  assert.equal(JSON.stringify(lireConfigurationEmcf()).includes(jeton), false);
  Object.assign(process.env, { EMCF_ENVIRONNEMENT: "production", EMCF_PRODUCTION_AUTORISEE: "1" });
  await lireStatutEmcf();
  assert.equal(appels[0].url, "https://sygmef.impots.bj/emcf/api/info/status");
});

test("lecture statut : origine officielle, Bearer serveur, sans cache ni redirection, délai 15 secondes", async () => {
  let delai;
  AbortSignal.timeout = (ms) => { delai = ms; return timeoutAvant(ms); };
  assert.deepEqual(await lireStatutEmcf(), statut);
  const { url, init } = appels[0];
  assert.equal(url, "https://developper.impots.bj/sygmef-emcf/api/info/status");
  assert.equal(init.method, "GET"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
  assert.equal(init.headers.Authorization, `Bearer ${jeton}`); assert.equal(delai, 15000);
  assert.equal(init.signal instanceof AbortSignal, true);
});

test("référentiels et demandes en attente : contrats et chemins exacts", async () => {
  const taxes = { a: 0, b: 18, c: 0, d: 18, e: 0, f: 0, aibA: 1, aibB: 5 };
  const types = [{ type: "FV", description: "Facture de vente" }];
  const attentes = { ...statut, pendingRequestsCount: 1, pendingRequestsList: [{ uid: "uid-local", date: statut.serverDateTime }] };
  repondre = (url) => Response.json(url.endsWith("taxGroups") ? taxes : url.endsWith("invoice") ? attentes : types);
  assert.deepEqual(await lireGroupesTaxesEmcf(), taxes);
  assert.deepEqual(await lireTypesFacturesEmcf(), types);
  assert.deepEqual(await lireTypesPaiementEmcf(), types);
  assert.deepEqual(await lireAttentesEmcf(), attentes);
  assert.deepEqual(appels.map((a) => a.url.split("/api/")[1]), ["info/taxGroups", "info/invoiceTypes", "info/paymentTypes", "invoice"]);
});

test("demande, lecture, confirmation et annulation utilisent le protocole DGI sans réessai", async () => {
  repondre = (url, init) => Response.json(init.method === "POST" ? calcul : init.method === "GET" ? demande : url.endsWith("cancel") ? {} : securite);
  assert.deepEqual(await soumettreFactureEmcf(demande), calcul);
  assert.deepEqual(await lireFactureEmcf("uid-local"), demande);
  assert.deepEqual(await confirmerFactureEmcf("uid-local"), securite);
  assert.deepEqual(await annulerFactureEmcf("uid-local"), {});
  assert.deepEqual(appels.map((a) => [a.init.method, a.url.split("/api/")[1]]), [
    ["POST", "invoice"], ["GET", "invoice/uid-local"], ["PUT", "invoice/uid-local/confirm"], ["PUT", "invoice/uid-local/cancel"],
  ]);
  assert.deepEqual(JSON.parse(appels[0].init.body), demande);
  assert.equal(appels[0].init.headers["Content-Type"], "application/json");
  assert.equal(appels[2].init.body, undefined);
});

test("saisie : montant non entier, quantité invalide, groupe inconnu et opérateur absent restent locaux", () => {
  const invalides = [
    { ...demande, items: [{ ...demande.items[0], price: 12.5 }] },
    { ...demande, items: [{ ...demande.items[0], price: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...demande, items: [{ ...demande.items[0], quantity: 0 }] },
    { ...demande, items: [{ ...demande.items[0], quantity: Infinity }] },
    { ...demande, items: [{ ...demande.items[0], taxGroup: "18%" }] },
    { ...demande, items: [] }, { ...demande, operator: {} }, { ...demande, payment: [{ name: "bitcoin", amount: 20000 }] },
  ];
  for (const invalide of invalides) {
    assert.equal(validerDemandeEmcf(invalide), false);
    assert.throws(() => soumettreFactureEmcf(invalide), { code: "saisie", incertain: false });
  }
  assert.throws(() => confirmerFactureEmcf(""), { code: "saisie" });
  assert.equal(appels.length, 0);
});

test("HTTP 200 avec erreur DGI est refusé, même code 0 non documenté comme succès", async () => {
  for (const errorCode of ["1", "0", "103", "CODE_INCONNU"]) {
    repondre = () => Response.json({ ...calcul, errorCode, errorDesc: `Erreur privée ${jeton}` });
    await assert.rejects(soumettreFactureEmcf(demande), (e) => {
      assert.equal(e instanceof ErreurEmcf, true); assert.equal(e.code, "dgi"); assert.equal(e.incertain, false);
      assert.equal(e.codeDgi, /^\d+$/.test(errorCode) ? errorCode : undefined);
      assert.equal(`${e.stack} ${JSON.stringify(e)}`.includes(jeton), false);
      assert.equal(e.message.includes("Erreur privée"), false);
      return true;
    });
  }
  assert.equal(appels.length, 4);
});

test("échec HTTP : pas de faux succès ni réessai, mutations 5xx marquées incertaines", async () => {
  for (const code of [301, 401, 422, 429, 500, 503]) {
    repondre = () => new Response(jeton, { status: code });
    await assert.rejects(soumettreFactureEmcf(demande), { code: "http", statutHttp: code, incertain: code >= 500 });
  }
  assert.equal(appels.length, 6);
});

test("réponse partielle ou corrompue après écriture : état incertain, aucun élément fiscal inventé", async () => {
  for (const faux of [{}, { ...calcul, total: "20000" }, { ...calcul, total: Number.MAX_SAFE_INTEGER + 1 }]) {
    repondre = () => Response.json(faux);
    await assert.rejects(soumettreFactureEmcf(demande), { code: "reponse", incertain: true });
  }
  repondre = () => Response.json({ ...securite, codeMECeFDGI: null });
  await assert.rejects(confirmerFactureEmcf("uid-local"), { code: "reponse", incertain: true });
  repondre = () => new Response("<html>indisponible</html>");
  await assert.rejects(lireStatutEmcf(), { code: "reponse", incertain: false });
  assert.equal(appels.length, 5);
});

test("transport interrompu, y compris lecture du corps : mutation incertaine sans fuite ni nouvelle tentative", async () => {
  repondre = () => { throw new Error(`Erreur réseau contenant ${jeton}`); };
  for (const [appel, incertain] of [[() => lireStatutEmcf(), false], [() => soumettreFactureEmcf(demande), true], [() => confirmerFactureEmcf("uid-local"), true]]) {
    await assert.rejects(appel(), (e) => {
      assert.equal(e.code, "transport"); assert.equal(e.incertain, incertain);
      assert.equal(`${e.stack} ${JSON.stringify(e)}`.includes(jeton), false);
      return true;
    });
  }
  repondre = () => ({ ok: true, status: 200, text: async () => { throw new Error("AbortError"); } });
  await assert.rejects(annulerFactureEmcf("uid-local"), { code: "transport", incertain: true });
  assert.equal(appels.length, 4);
});

test("l'UID est encodé comme un seul segment et ne peut changer la destination", async () => {
  repondre = () => Response.json(demande);
  await lireFactureEmcf("x/y?autre=1#frag");
  assert.equal(appels[0].url, "https://developper.impots.bj/sygmef-emcf/api/invoice/x%2Fy%3Fautre%3D1%23frag");
});
