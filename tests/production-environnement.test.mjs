import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifierProduction } from '../scripts/production-verifier.mjs';

const base = () => ({
  SITE_URL: 'https://ouidahheritagetour.bj', SUPABASE_URL: 'https://projet.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_' + 'S'.repeat(30), EQUIPE_SEL: 'E'.repeat(40),
  EMPREINTE_SEL: 'I'.repeat(40), BILLET_SECRET: 'B'.repeat(40), CRON_SECRET: 'C'.repeat(40),
  EMAIL_OHT: 'contact@ouidahheritagetour.bj', SMTP_HOTE: 'mail.ouidahheritagetour.bj',
  SMTP_PORT: '465', SMTP_UTILISATEUR: 'contact@ouidahheritagetour.bj', SMTP_MDP: 'mdp-synthetique-uniquement',
  GROQ_API_KEYS: 'gsk_' + 'G'.repeat(32),
});
const erreur = (r, nom) => r.controles.some((c) => c.nom === nom && c.etat === 'erreur');

test('configuration cohérente, contrôle sans appel de service et sans promesse de connexion', () => {
  const avant = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Appel réseau interdit dans ce contrôle.'); };
  try {
    const r = verifierProduction(base());
    assert.equal(r.ok, true);
    assert.ok(r.controles.some((c) => c.nom === 'PAIEMENTS' && c.etat === 'attention'));
    assert.ok(r.controles.filter((c) => c.etat === 'ok').every((c) => c.message.includes('connexion non vérifiée')));
  } finally { globalThis.fetch = avant; }
});

test('une configuration vide et chaque variable socle manquante empêchent la validation', () => {
  assert.equal(verifierProduction({}).ok, false);
  for (const nom of Object.keys(base())) {
    const env = base(); delete env[nom];
    assert.ok(erreur(verifierProduction(env), nom), nom);
  }
});

test('origines locales, HTTP, chemins, identifiants et paramètres refusés sans les afficher', () => {
  for (const v of ['http://ouidahheritagetour.bj', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1', 'https://172.20.0.1', 'https://192.168.1.1', 'https://u:x@ouidahheritagetour.bj', 'https://ouidahheritagetour.bj/api', 'https://ouidahheritagetour.bj/?token=secret', 'https://ouidahheritagetour.bj/#secret']) {
    const r = verifierProduction({ ...base(), SITE_URL: v });
    assert.ok(erreur(r, 'SITE_URL'));
    assert.ok(!JSON.stringify(r).includes(v));
  }
});

test('clé publique Supabase refusée, anciennes clés service_role acceptées uniquement comme format', () => {
  const jwt = (role) => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url'), 's'.repeat(43)].join('.');
  for (const cle of ['sb_publishable_abcdef', jwt('anon'), jwt('authenticated'), 'invalide'])
    assert.ok(erreur(verifierProduction({ ...base(), SUPABASE_SECRET_KEY: cle }), 'SUPABASE_SECRET_KEY'));
  assert.equal(verifierProduction({ ...base(), SUPABASE_SECRET_KEY: jwt('service_role') }).ok, true);
  assert.ok(erreur(verifierProduction({ ...base(), SUPABASE_SECRET_KEY: jwt('service_role').split('.').slice(0, 2).join('.') }), 'SUPABASE_SECRET_KEY'));
});

test('secrets trop courts, identiques, factices ou avec espace de bord refusés', () => {
  for (const v of ['court', ' ', 'fixture-' + 'z'.repeat(40), ' ' + 'z'.repeat(40)])
    assert.ok(erreur(verifierProduction({ ...base(), BILLET_SECRET: v }), 'BILLET_SECRET'));
  assert.ok(erreur(verifierProduction({ ...base(), CRON_SECRET: base().BILLET_SECRET }), 'SECRETS_DISTINCTS'));
});

test('SMTP et Groq mal formés refusés, plusieurs clés Groq acceptées', () => {
  for (const [nom, valeur] of [['SMTP_PORT', '25'], ['SMTP_PORT', 'NaN'], ['SMTP_PORT', '465.5'], ['SMTP_HOTE', 'smtp://mail.oht.bj'], ['SMTP_UTILISATEUR', 'identifiant-sans-email'], ['EMAIL_OHT', 'a@b'], ['GROQ_API_KEYS', 'gsk_' + 'g'.repeat(32) + ',']])
    assert.ok(erreur(verifierProduction({ ...base(), [nom]: valeur }), nom));
  assert.equal(verifierProduction({ ...base(), SMTP_PORT: '587', GROQ_API_KEYS: base().GROQ_API_KEYS + ', gsk_' + 'h'.repeat(32) }).ok, true);
});

test('IMAP incomplet ou explicitement demandé rend la configuration invalide', () => {
  assert.ok(erreur(verifierProduction(base(), { imap: true }), 'IMAP_HOTE'));
  assert.ok(erreur(verifierProduction({ ...base(), IMAP_HOTE: 'mail.oht.bj' }), 'IMAP_MDP'));
  assert.equal(verifierProduction({ ...base(), IMAP_HOTE: 'mail.oht.bj', IMAP_PORT: '993', IMAP_UTILISATEUR: 'contact@oht.bj', IMAP_MDP: 'imap-synthetique' }).ok, true);
});

test('passerelle sélectionnée ou partiellement configurée : clés manquantes repérées', () => {
  assert.ok(erreur(verifierProduction(base(), { paiements: ['stripe'] }), 'STRIPE_SECRET_KEY'));
  assert.ok(erreur(verifierProduction({ ...base(), KKIAPAY_PUBLIC_KEY: 'publique' }), 'KKIAPAY_WEBHOOK_SECRET'));
  const r = verifierProduction(base(), { paiements: ['inconnu-secret-ne-pas-afficher'] });
  assert.ok(erreur(r, 'PAIEMENTS'));
  assert.ok(!JSON.stringify(r).includes('inconnu-secret-ne-pas-afficher'));
});

test('modes de test et faux secrets webhook refusés en production', () => {
  assert.ok(erreur(verifierProduction({ ...base(), STRIPE_SECRET_KEY: 'sk_test_abcdef', STRIPE_WEBHOOK_SECRET: 'whsec_abcdef' }), 'STRIPE_SECRET_KEY'));
  assert.ok(erreur(verifierProduction({ ...base(), STRIPE_SECRET_KEY: 'sk_live_xxxxxx', STRIPE_WEBHOOK_SECRET: 'sk_live_xxxxxx' }), 'STRIPE_WEBHOOK_SECRET'));
  assert.ok(erreur(verifierProduction({ ...base(), PAYSTACK_SECRET_KEY: 'sk_test_abcdef' }), 'PAYSTACK_SECRET_KEY'));
  assert.ok(erreur(verifierProduction({ ...base(), FEDAPAY_SECRET_KEY: 'sk_sandbox_abcdef', FEDAPAY_WEBHOOK_SECRET: 'webhook', FEDAPAY_SANDBOX: 'false' }), 'FEDAPAY_SECRET_KEY'));
  assert.ok(erreur(verifierProduction({ ...base(), FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-xxxxxxxxxxxx', FLUTTERWAVE_SECRET_HASH: 'webhook' }), 'FLUTTERWAVE_SECRET_KEY'));
  const k = { ...base(), KKIAPAY_PUBLIC_KEY: 'publique', KKIAPAY_PRIVATE_KEY: 'privee', KKIAPAY_SECRET_KEY: 'secrete', KKIAPAY_WEBHOOK_SECRET: 'webhook', KKIAPAY_SANDBOX: 'true' };
  assert.ok(erreur(verifierProduction(k), 'KKIAPAY_SANDBOX'));
  assert.equal(verifierProduction({ ...k, KKIAPAY_SANDBOX: 'false', NEXT_PUBLIC_KKIAPAY: 'publique' }).ok, true);
});

test('simulations et TLS désactivé refusés, e-MECeF reste explicite', () => {
  for (const n of ['EQUIPE_DEMO', 'BOUTIQUE_BROUILLONS', 'EQUIPE_BOITE', 'ASSISTANT_FAUX'])
    assert.ok(erreur(verifierProduction({ ...base(), [n]: '1' }), n));
  assert.ok(erreur(verifierProduction({ ...base(), NODE_TLS_REJECT_UNAUTHORIZED: '0' }), 'TLS'));
  const r = verifierProduction({ ...base(), EMCF_JETON: 'jeton-fiscal-xxxxxxxxxxxx' });
  assert.ok(r.controles.some((c) => c.nom === 'EMCF' && c.etat === 'attention' && c.message.includes('Bac à sable DGI')));
  assert.ok(!JSON.stringify(r).includes('jeton-fiscal-xxxxxxxxxxxx'));
});

test('e-MECeF : test par défaut, autorisation explicite et jeton requis en production', () => {
  const env = { ...base(), EMCF_JETON: 'jeton-fiscal-xxxxxxxxxxxx' };
  assert.equal(verifierProduction(env).ok, true);
  assert.equal(verifierProduction({ ...env, EMCF_ENVIRONNEMENT: 'test', EMCF_PRODUCTION_AUTORISEE: '0' }).ok, true);
  for (const valeur of ['live', 'sandbox', 'environnement-inconnu-secret']) {
    const r = verifierProduction({ ...env, EMCF_ENVIRONNEMENT: valeur });
    assert.ok(erreur(r, 'EMCF_ENVIRONNEMENT')); assert.ok(!JSON.stringify(r).includes(valeur));
  }
  assert.ok(erreur(verifierProduction({ ...env, EMCF_PRODUCTION_AUTORISEE: '1' }), 'EMCF_PRODUCTION_AUTORISEE'));
  for (const valeur of ['true', 'false', 'oui'])
    assert.ok(erreur(verifierProduction({ ...env, EMCF_PRODUCTION_AUTORISEE: valeur }), 'EMCF_PRODUCTION_AUTORISEE'));
  for (const valeur of [undefined, '0'])
    assert.ok(erreur(verifierProduction({ ...env, EMCF_ENVIRONNEMENT: 'production', EMCF_PRODUCTION_AUTORISEE: valeur }), 'EMCF_PRODUCTION_AUTORISEE'));
  assert.ok(erreur(verifierProduction({ ...base(), EMCF_ENVIRONNEMENT: 'production', EMCF_PRODUCTION_AUTORISEE: '1' }), 'EMCF_JETON'));
  for (const valeur of ['secret\ninterne', 'secret\rinterne', 'secret\0interne']) {
    const r = verifierProduction({ ...env, EMCF_JETON: valeur });
    assert.ok(erreur(r, 'EMCF_JETON')); assert.ok(!JSON.stringify(r).includes(valeur));
  }
  const production = verifierProduction({ ...env, EMCF_ENVIRONNEMENT: 'production', EMCF_PRODUCTION_AUTORISEE: '1' });
  assert.equal(production.ok, true);
  assert.ok(production.controles.some((c) => c.nom === 'EMCF' && c.etat === 'attention' && c.message.includes('validation DGI')));
  assert.ok(erreur(verifierProduction({ ...env, NEXT_PUBLIC_DGI: env.EMCF_JETON }), 'EXPOSITION_PUBLIQUE'));
});

test('copie publique d’un secret détectée sans fuite dans le résultat', () => {
  const env = base();
  for (const secret of [env.SMTP_MDP, env.GROQ_API_KEYS, env.SUPABASE_SECRET_KEY, env.BILLET_SECRET]) {
    const r = verifierProduction({ ...env, NEXT_PUBLIC_CONFIGURATION: JSON.stringify({ secret }) });
    assert.ok(erreur(r, 'EXPOSITION_PUBLIQUE'));
    for (const n of ['SMTP_MDP', 'GROQ_API_KEYS', 'SUPABASE_SECRET_KEY', 'BILLET_SECRET']) assert.ok(!JSON.stringify(r).includes(env[n]));
  }
});

test('modèle fourni ne valide pas une installation et contient les groupes à renseigner', async () => {
  const source = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const env = Object.fromEntries([...source.matchAll(/^([A-Z][A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2]]));
  assert.equal(verifierProduction(env).ok, false);
  for (const nom of [...Object.keys(base()), 'ASSISTANT_FAUX', 'EMCF_JETON', 'EMCF_ENVIRONNEMENT', 'EMCF_PRODUCTION_AUTORISEE', 'OHT_SAUVEGARDE_CLE', 'PGSSLMODE', 'KKIAPAY_WEBHOOK_SECRET']) assert.ok(Object.hasOwn(env, nom), nom);
  assert.equal(env.EMCF_ENVIRONNEMENT, 'test'); assert.equal(env.EMCF_PRODUCTION_AUTORISEE, '0');
});

test('régression revue : domaines invalides, clés publiques ou sandbox FedaPay et secrets opérateur exposés', () => {
  assert.ok(erreur(verifierProduction({ ...base(), SITE_URL: 'https://0.0.0.0' }), 'SITE_URL'));
  assert.ok(erreur(verifierProduction({ ...base(), SMTP_HOTE: 'mail..oht.bj' }), 'SMTP_HOTE'));
  const fedapay = { ...base(), FEDAPAY_SECRET_KEY: 'sk_live_xxxxxx', FEDAPAY_WEBHOOK_SECRET: 'wh_live_xxxxxxxxxxxx', FEDAPAY_SANDBOX: 'false' };
  assert.equal(verifierProduction(fedapay).ok, true);
  assert.ok(erreur(verifierProduction({ ...fedapay, FEDAPAY_SECRET_KEY: 'pk_live_xxxxxxxxxxxx' }), 'FEDAPAY_SECRET_KEY'));
  assert.ok(erreur(verifierProduction({ ...fedapay, FEDAPAY_WEBHOOK_SECRET: 'wh_sandbox_xxxxxxxxxxxx' }), 'FEDAPAY_WEBHOOK_SECRET'));
  for (const nom of ['PGPASSWORD', 'OHT_SAUVEGARDE_CLE']) {
    const secret = 'confidentiel-operateur-synthetique';
    const r = verifierProduction({ ...base(), [nom]: secret, NEXT_PUBLIC_COPIE: secret });
    assert.ok(erreur(r, 'EXPOSITION_PUBLIQUE'));
    assert.ok(!JSON.stringify(r).includes(secret));
  }
});
