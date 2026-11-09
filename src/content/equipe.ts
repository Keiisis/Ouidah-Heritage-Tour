// Textes de la connexion de l'équipe (/agents, /admins), maquette G « Le porte-badge » (objet TXT), en français.
// Rien d'inventé : aucun chiffre, aucun nom. Le prénom de l'arrivée vient du serveur, jamais d'ici.
// Aucune valeur de démonstration ici : elles restent côté serveur (api/equipe).

export type Role = "agents" | "admins";

const salut = (h: number) => (h >= 18 || h < 5 ? "Bonsoir" : "Bonjour");

export const equipe = {
  meta: { agents: "Espace agent · Ouidah Heritage Tour", admins: "Administration · Ouidah Heritage Tour" },
  role: {
    agents: { nom: "Espace agent", titre: "Bon retour sur le terrain", tampon: "Agent" },
    admins: { nom: "Administration", titre: "Administration OHT", tampon: "Admin" },
  } satisfies Record<Role, { nom: string; titre: string; tampon: string }>,
  fuseau: "Africa/Porto-Novo",

  photo: { src: "/ouidah/eng-4-paillote.jpg", largeur: 1280, hauteur: 1707, legende: "Paillote au toit de chaume, Ouidah" },
  // carte d'accréditation : emblème rond original (règle de Kevin du 02/11 : la bannière « OUIDAH » sert seulement à la navigation)
  logoEncre: { src: "/brand/oht-embleme.webp", alt: "Ouidah Heritage Tour" },
  logoClair: { src: "/brand/oht-logo.png" },
  serie: "Accréditation OHT",
  tamponMarque: "OHT",
  talon1: "Accès réservé à l’équipe Ouidah Heritage Tour",
  talon2: "ouidahheritagetour.bj",

  // salutation à l'heure de Ouidah : « Bonjour · 16 h 33 à Ouidah »
  salut,
  heure: { apres: " à Ouidah", separateur: " · " },

  // 1-3. connexion
  sousConnexion: "Connectez-vous avec votre adresse e-mail et votre mot de passe.",
  email: "Adresse e-mail",
  mdp: "Mot de passe",
  afficher: "Afficher le mot de passe",
  masquer: "Masquer le mot de passe",
  maj: "Majuscules activées",
  oubli: "Mot de passe oublié ?",
  premiere: "Première connexion ?",
  connecter: "Se connecter",
  verification: "Vérification…",
  // le compte invité n'a pas encore de mot de passe : le rappel « Première connexion ? » évite de s'acharner (ne dit pas si l'adresse existe)
  erreur: "E-mail ou mot de passe incorrect. Première connexion ? Demandez votre code avec « Première connexion ? ».",
  essaisRestants: (n: number) => `E-mail ou mot de passe incorrect. Encore ${n} essai${n > 1 ? "s" : ""} avant une pause de 15 minutes. Première connexion ? Demandez votre code avec « Première connexion ? ».`,
  bloque: "Trop d’essais. Réessayez dans 15 minutes.",
  vide: "Indiquez votre e-mail et votre mot de passe.",
  suggere: (m: string) => `Vouliez-vous dire ${m} ?`,
  souvenir: "Adresse retenue sur cet appareil.",
  pasVous: "Ce n’est pas vous ?",
  retour: "Retour",

  // réponses du serveur hors parcours
  pasEncore: "L’accès de l’équipe ouvre bientôt. Votre saisie n’a pas été envoyée.",
  reseau: "La connexion a échoué. Vérifiez votre réseau, puis réessayez.",
  faible: "Le mot de passe doit compter au moins 12 caractères.",
  tropTot: "Un code vient d’être demandé. Patientez une minute avant d’en demander un autre.",
  expire: "La vérification a expiré. Demandez un nouveau code.",
  bloquee: "Connexion refusée depuis cette adresse. Contactez un administrateur d’OHT.",

  // 4. mot de passe oublié, première connexion
  oubliTitre: "Mot de passe oublié",
  premiereTitre: "Première connexion",
  oubliSous: "Indiquez votre adresse e-mail : vous recevrez un code à 6 chiffres pour choisir un nouveau mot de passe.",
  premiereSous: "Indiquez l’adresse e-mail que l’administration a enregistrée : vous recevrez un code à 6 chiffres pour choisir votre mot de passe.",
  recevoir: "Recevoir un code",
  emailInvalide: "Indiquez une adresse e-mail valide.",

  // 5-7. code
  codeTitre: "Saisissez le code",
  codeSous: (m: string) => `Si un compte existe pour ${m}, un code vient d’y être envoyé.`,
  legende: "Code à 6 chiffres",
  chiffre: (i: number) => `Chiffre ${i} sur 6`,
  coller: "Coller le code",
  validite: "Code valable 10 minutes",
  valideEncore: (m: number) => `Code valable encore ${m} min`,
  renvoyer: "Renvoyer le code",
  renvoyerDans: (s: number) => `Renvoyer dans ${s} s`,
  renvoye: "Un nouveau code a été envoyé.",
  valider: "Vérifier le code",
  codeErreur: "Code incorrect ou expiré.",
  // lien vers la messagerie de l'adresse saisie
  messagerie: {
    "gmail.com": ["Ouvrir Gmail", "https://mail.google.com/"],
    "outlook.com": ["Ouvrir Outlook", "https://outlook.live.com/"],
    "hotmail.com": ["Ouvrir Outlook", "https://outlook.live.com/"],
    "hotmail.fr": ["Ouvrir Outlook", "https://outlook.live.com/"],
    "live.com": ["Ouvrir Outlook", "https://outlook.live.com/"],
    "yahoo.fr": ["Ouvrir Yahoo Mail", "https://mail.yahoo.com/"],
    "yahoo.com": ["Ouvrir Yahoo Mail", "https://mail.yahoo.com/"],
  } as Record<string, readonly [string, string]>,

  // 8. nouveau mot de passe
  nouveauTitre: "Nouveau mot de passe",
  nouveauSous: "Choisissez un mot de passe que vous n’utilisez nulle part ailleurs.",
  mdp1: "Nouveau mot de passe",
  mdp2: "Confirmez le mot de passe",
  exigences: { longueur: "Au moins 12 caractères", email: "Différent de votre adresse e-mail", pareil: "Les deux saisies sont identiques" },
  enregistrer: "Enregistrer et me connecter",

  // 9-10. réussite, arrivée (« Bonjour, » puis le prénom si le serveur en renvoie un, sinon « Bonjour. »)
  succesTitre: "Accès accordé",
  succesSous: "Ouverture de votre espace…",
  accueil: (s: string, prenom: string | null) => (prenom ? `${s},` : `${s}.`),

  // accueil provisoire une fois connecté (le tableau de bord arrive au lot L2)
  ouvert: {
    titre: (prenom: string) => `Bienvenue, ${prenom}`,
    role: { agent: "Agent", admin: "Administration" },
    provisoire: "Votre tableau de bord est en préparation.",
    deconnexion: "Se déconnecter",
    sortie: "Déconnexion…",
  },
};
