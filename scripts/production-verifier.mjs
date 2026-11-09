import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isIP } from 'node:net';

export const passerelles = {
  kkiapay: ['KKIAPAY_PUBLIC_KEY', 'KKIAPAY_PRIVATE_KEY', 'KKIAPAY_SECRET_KEY', 'KKIAPAY_WEBHOOK_SECRET'],
  fedapay: ['FEDAPAY_SECRET_KEY', 'FEDAPAY_WEBHOOK_SECRET'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  paystack: ['PAYSTACK_SECRET_KEY'],
  flutterwave: ['FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_SECRET_HASH'],
};
const sels = ['EQUIPE_SEL', 'EMPREINTE_SEL', 'BILLET_SECRET', 'CRON_SECRET'];
const factice = /^(?:(?:fixture|disabled|demo|test|votre|your|replace)[_-]|changeme$|todo$|x{3,}$|a.remplacer$)/i;
const adresse = (v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);
const hote = (v) => v.length <= 253 && v.includes('.') && v.split('.').every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
  && !/(?:^|\.)(?:localhost|local|invalid|example|test|example\.(?:com|org|net))$/i.test(v);
function origine(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && hote(u.hostname) && !isIP(u.hostname)
      && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && !u.port;
  } catch { return false; }
}
function cleServeur(v) {
  if (v.startsWith('sb_secret_')) return /^sb_secret_[a-z\d_-]{20,}$/i.test(v);
  if (!/^[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+$/i.test(v)) return false;
  try {
    const [entete, contenu] = v.split('.').slice(0, 2).map((partie) => JSON.parse(Buffer.from(partie, 'base64url').toString()));
    return entete.alg === 'HS256' && entete.typ === 'JWT' && contenu.role === 'service_role';
  }
  catch { return false; }
}

/** Contrôle local de forme uniquement. Aucun appel API, affichage de valeur ou accès à la base. */
export function verifierProduction(env, { paiements = [], imap = false } = {}) {
  const controles = [];
  const valeur = (nom) => typeof env[nom] === 'string' ? env[nom].trim() : '';
  const ajouter = (nom, etat, message) => controles.push({ nom, etat, message });
  const requis = (nom, valide = () => true, attente = 'Valeur requise.') => {
    const v = valeur(nom);
    if (!v) ajouter(nom, 'erreur', 'Absente.');
    else if (factice.test(v) || !valide(v)) ajouter(nom, 'erreur', attente);
    else ajouter(nom, 'ok', 'Présente ; forme cohérente, connexion non vérifiée.');
  };
  requis('SITE_URL', origine, 'Origine HTTPS publique requise, sans chemin, port, identifiant ni paramètres.');
  requis('SUPABASE_URL', origine, 'Origine HTTPS Supabase requise, sans chemin ni identifiant.');
  requis('SUPABASE_SECRET_KEY', cleServeur, 'Clé serveur attendue ; anon/publishable refusée. Validité à vérifier chez Supabase.');
  for (const nom of sels) requis(nom, (v) => v.length >= 32 && env[nom] === v, 'Au moins 32 caractères aléatoires, sans espaces de bord.');
  if (new Set(sels.map(valeur).filter(Boolean)).size !== sels.filter((n) => valeur(n)).length)
    ajouter('SECRETS_DISTINCTS', 'erreur', 'Les quatre secrets de signature doivent être différents.');
  requis('EMAIL_OHT', adresse, 'Adresse de réception des avis internes attendue.');
  requis('SMTP_HOTE', hote, 'Nom DNS du serveur SMTP attendu.');
  requis('SMTP_PORT', (v) => ['465', '587'].includes(v), 'Port 465 TLS ou 587 STARTTLS attendu pour Vercel.');
  requis('SMTP_UTILISATEUR', adresse, 'Adresse du compte expéditeur attendue.');
  requis('SMTP_MDP');
  requis('GROQ_API_KEYS', (v) => v.split(',').every((k) => /^gsk_[a-z\d]{20,}$/i.test(k.trim())), 'Clés Groq attendues, séparées par des virgules, sans élément vide.');
  const groupeImap = ['IMAP_HOTE', 'IMAP_UTILISATEUR', 'IMAP_MDP'];
  if (imap || groupeImap.some((n) => valeur(n))) {
    requis('IMAP_HOTE', hote, 'Nom DNS du serveur IMAP attendu.');
    requis('IMAP_PORT', (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535, 'Port IMAP TLS entier entre 1 et 65535 attendu.');
    requis('IMAP_UTILISATEUR');
    requis('IMAP_MDP');
  } else ajouter('IMAP', 'attention', 'Non configuré ; ne pas activer sa relève dans l’admin.');

  let nombre = 0;
  if (paiements.some((n) => !Object.hasOwn(passerelles, n))) ajouter('PAIEMENTS', 'erreur', 'Nom de passerelle inconnu.');
  for (const [nom, cles] of Object.entries(passerelles)) {
    if (!paiements.includes(nom) && !cles.some((n) => valeur(n))) continue;
    nombre++;
    for (const cle of cles) requis(cle);
    if (nom === 'kkiapay' || nom === 'fedapay') {
      const variable = `${nom.toUpperCase()}_SANDBOX`;
      requis(variable, (v) => v === 'false', 'Production : false explicite et clés live correspondantes requis.');
    }
    if (nom === 'stripe' || nom === 'paystack') {
      const cle = `${nom.toUpperCase()}_SECRET_KEY`;
      if (valeur(cle) && !/^sk_live_[a-z\d]+$/i.test(valeur(cle))) ajouter(cle, 'erreur', 'Clé live sk_live_ attendue.');
    }
    if (nom === 'stripe' && valeur('STRIPE_WEBHOOK_SECRET') && !valeur('STRIPE_WEBHOOK_SECRET').startsWith('whsec_'))
      ajouter('STRIPE_WEBHOOK_SECRET', 'erreur', 'Secret de destination webhook whsec_ attendu.');
    if (nom === 'fedapay') {
      if (/^pk_|^(?:sk_)?(?:sandbox|dev|test)_/i.test(valeur('FEDAPAY_SECRET_KEY')))
        ajouter('FEDAPAY_SECRET_KEY', 'erreur', 'Clé publique ou de test refusée ; prendre la clé secrète live.');
      if (/^wh_(?:sandbox|dev|test)_/i.test(valeur('FEDAPAY_WEBHOOK_SECRET')))
        ajouter('FEDAPAY_WEBHOOK_SECRET', 'erreur', 'Secret webhook de test refusé ; prendre celui du point de terminaison live.');
    }
    if (nom === 'flutterwave' && /(?:^|[-_])TEST(?:[-_]|$)/i.test(valeur('FLUTTERWAVE_SECRET_KEY')))
      ajouter('FLUTTERWAVE_SECRET_KEY', 'erreur', 'Clé de test refusée en production.');
    ajouter(nom.toUpperCase(), 'attention', 'Compte XOF, mode live, signature webhook et activation admin à vérifier avec le prestataire.');
  }
  if (!nombre) ajouter('PAIEMENTS', 'attention', 'Aucune passerelle configurée ; choisir --paiements=nom pour rendre ses clés obligatoires.');

  for (const nom of ['EQUIPE_DEMO', 'BOUTIQUE_BROUILLONS', 'EQUIPE_BOITE', 'ASSISTANT_FAUX'])
    if (valeur(nom)) ajouter(nom, 'erreur', 'Variable de simulation à retirer de la configuration de production.');
  if (valeur('NODE_TLS_REJECT_UNAUTHORIZED') === '0') ajouter('TLS', 'erreur', 'La vérification des certificats TLS doit rester active.');
  const emcfEnvironnement = valeur('EMCF_ENVIRONNEMENT') || 'test';
  const emcfAutorisation = valeur('EMCF_PRODUCTION_AUTORISEE');
  if (!['test', 'production'].includes(emcfEnvironnement))
    ajouter('EMCF_ENVIRONNEMENT', 'erreur', 'Valeurs acceptées : test ou production. Aucun environnement inconnu autorisé.');
  if (emcfAutorisation && !['0', '1'].includes(emcfAutorisation))
    ajouter('EMCF_PRODUCTION_AUTORISEE', 'erreur', '0 verrouille la production ; 1 seulement après validation DGI.');
  if (emcfAutorisation === '1' && emcfEnvironnement !== 'production')
    ajouter('EMCF_PRODUCTION_AUTORISEE', 'erreur', 'Retirer l’autorisation de production dans l’environnement de test.');
  if (valeur('EMCF_JETON') || emcfEnvironnement === 'production') {
    requis('EMCF_JETON', (v) => !/[\r\n\u0000]/.test(v), 'Jeton DGI requis sans retour à la ligne ni caractère nul.');
    if (emcfEnvironnement === 'production') {
      if (emcfAutorisation !== '1') ajouter('EMCF_PRODUCTION_AUTORISEE', 'erreur', 'Production verrouillée ; activer avec 1 seulement après validation DGI.');
      ajouter('EMCF', 'attention', 'Connecteur de production déclaré : validation DGI, identité IFU/NIM et recette réelle à contrôler. Émission explicite dans /admins/emcf uniquement.');
    } else ajouter('EMCF', 'attention', 'Bac à sable DGI ; ses résultats ne certifient aucun document client. Émission explicite dans /admins/emcf uniquement.');
  } else ajouter('EMCF', 'attention', 'Jeton absent ; connecteur e-MECeF indisponible. Aucun appel fiscal automatique.');
  // N’affiche ni la valeur ni le nom d’une variable publique inconnue.
  const secrets = ['SUPABASE_SECRET_KEY', ...sels, 'SMTP_MDP', 'IMAP_MDP', 'GROQ_API_KEYS', 'EMCF_JETON', 'OHT_SAUVEGARDE_CLE', 'PGPASSWORD', ...Object.values(passerelles).flat().filter((n) => n !== 'KKIAPAY_PUBLIC_KEY')];
  const valeursSecretes = secrets.flatMap((n) => n === 'GROQ_API_KEYS' ? valeur(n).split(',').map((v) => v.trim()).filter(Boolean) : [valeur(n)]).filter(Boolean);
  if (Object.entries(env).some(([n, v]) => n.startsWith('NEXT_PUBLIC_') && typeof v === 'string' && valeursSecretes.some((secret) => v.includes(secret))))
    ajouter('EXPOSITION_PUBLIQUE', 'erreur', 'Un secret serveur est recopié dans une variable NEXT_PUBLIC_. Retirer cette exposition.');
  return { ok: !controles.some((c) => c.etat === 'erreur'), controles };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((a) => !['--local', '--json', '--imap'].includes(a) && !a.startsWith('--paiements='))) {
    console.error('Usage : npm run production:verifier -- [--local] [--json] [--imap] [--paiements=kkiapay,fedapay,stripe,paystack,flutterwave]');
    process.exitCode = 2;
    return;
  }
  if (args.includes('--local')) {
    const require = createRequire(import.meta.url);
    const { loadEnvConfig } = require('@next/env');
    loadEnvConfig(resolve(dirname(fileURLToPath(import.meta.url)), '..'), false, { info() {}, error() {} });
  }
  const paiements = args.filter((a) => a.startsWith('--paiements=')).flatMap((a) => a.slice('--paiements='.length).split(','));
  const resultat = verifierProduction(process.env, { paiements, imap: args.includes('--imap') });
  if (args.includes('--json')) console.log(JSON.stringify(resultat, null, 2));
  else {
    console.log('Configuration de production — contrôle hors réseau, sans activation ni preuve de connexion.');
    for (const c of resultat.controles) console.log(`[${c.etat}] ${c.nom} : ${c.message}`);
    console.log(resultat.ok ? 'Formes contrôlées. Effectuer la recette réelle du guide avant activation.' : 'Configuration incomplète ou incohérente. Corriger les erreurs avant activation.');
  }
  process.exitCode = resultat.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch { console.error('Contrôle impossible ; vérifier l’installation locale et les fichiers d’environnement. Aucune valeur affichée.'); process.exitCode = 2; }
}
