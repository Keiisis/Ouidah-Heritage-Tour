// E-mail du code à 6 chiffres envoyé à l'équipe (mot de passe oublié, première connexion), dans la première langue du
// compte (7 langues du site). Expéditeur : contact@ouidahheritagetour.bj (SMTP d'OHT). Rien d'inventé : aucun nom de
// personne, aucun chiffre hors du code et de sa validité réelle (10 minutes).
// Créoles (HT, GCF) et portugais : à faire relire par un locuteur avant la mise en ligne.
// Fichier de données sans import : le script scripts/equipe-premier-admin.mjs le lit aussi.
type CopieCode = {
  sujetOubli: string;
  sujetPremiere: string;
  bonjour: (prenom: string) => string;
  oubli: string;
  premiere: string;
  validite: string;
  ignorer: string;
  signature: string;
};

export type LangueEquipe = "FR" | "EN" | "ES" | "DE" | "PT" | "HT" | "GCF";
export const expediteurEquipe = "Ouidah Heritage Tour";

export const copiesCode: Record<LangueEquipe, CopieCode> = {
  FR: {
    sujetOubli: "Votre code pour choisir un nouveau mot de passe",
    sujetPremiere: "Votre code de première connexion",
    bonjour: (p) => `Bonjour ${p},`,
    oubli: "Voici votre code pour choisir un nouveau mot de passe dans l’espace de l’équipe Ouidah Heritage Tour :",
    premiere: "Voici votre code de première connexion à l’espace de l’équipe Ouidah Heritage Tour :",
    validite: "Ce code est valable 10 minutes et ne sert qu’une fois.",
    ignorer: "Si vous n’avez rien demandé, ignorez cet e-mail : votre mot de passe ne change pas.",
    signature: "Ouidah Heritage Tour, Ouidah (Bénin)",
  },
  EN: {
    sujetOubli: "Your code to choose a new password",
    sujetPremiere: "Your first sign-in code",
    bonjour: (p) => `Hello ${p},`,
    oubli: "Here is your code to choose a new password for the Ouidah Heritage Tour team area:",
    premiere: "Here is your first sign-in code for the Ouidah Heritage Tour team area:",
    validite: "This code is valid for 10 minutes and can be used once.",
    ignorer: "If you did not request it, ignore this email: your password stays the same.",
    signature: "Ouidah Heritage Tour, Ouidah (Benin)",
  },
  ES: {
    sujetOubli: "Su código para elegir una nueva contraseña",
    sujetPremiere: "Su código de primer acceso",
    bonjour: (p) => `Hola ${p}:`,
    oubli: "Este es su código para elegir una nueva contraseña en el espacio del equipo de Ouidah Heritage Tour:",
    premiere: "Este es su código de primer acceso al espacio del equipo de Ouidah Heritage Tour:",
    validite: "Este código es válido durante 10 minutos y solo sirve una vez.",
    ignorer: "Si no lo ha solicitado, ignore este correo: su contraseña no cambia.",
    signature: "Ouidah Heritage Tour, Ouidah (Benín)",
  },
  DE: {
    sujetOubli: "Ihr Code für ein neues Passwort",
    sujetPremiere: "Ihr Code für die erste Anmeldung",
    bonjour: (p) => `Hallo ${p},`,
    oubli: "Hier ist Ihr Code, um ein neues Passwort für den Teambereich von Ouidah Heritage Tour zu wählen:",
    premiere: "Hier ist Ihr Code für die erste Anmeldung im Teambereich von Ouidah Heritage Tour:",
    validite: "Dieser Code ist 10 Minuten gültig und nur einmal verwendbar.",
    ignorer: "Wenn Sie nichts angefordert haben, ignorieren Sie diese E-Mail: Ihr Passwort bleibt unverändert.",
    signature: "Ouidah Heritage Tour, Ouidah (Benin)",
  },
  PT: {
    sujetOubli: "O seu código para escolher uma nova palavra-passe",
    sujetPremiere: "O seu código de primeiro acesso",
    bonjour: (p) => `Olá ${p},`,
    oubli: "Eis o seu código para escolher uma nova palavra-passe no espaço da equipa da Ouidah Heritage Tour:",
    premiere: "Eis o seu código de primeiro acesso ao espaço da equipa da Ouidah Heritage Tour:",
    validite: "Este código é válido durante 10 minutos e só pode ser usado uma vez.",
    ignorer: "Se não pediu nada, ignore este e-mail: a sua palavra-passe não muda.",
    signature: "Ouidah Heritage Tour, Ouidah (Benim)",
  },
  HT: {
    sujetOubli: "Kòd ou pou chwazi yon nouvo modpas",
    sujetPremiere: "Kòd premye koneksyon ou",
    bonjour: (p) => `Bonjou ${p},`,
    oubli: "Men kòd ou pou chwazi yon nouvo modpas nan espas ekip Ouidah Heritage Tour la :",
    premiere: "Men kòd premye koneksyon ou nan espas ekip Ouidah Heritage Tour la :",
    validite: "Kòd sa a valab pandan 10 minit epi li sèvi yon sèl fwa.",
    ignorer: "Si se pa ou ki te mande l, pa okipe imèl sa a : modpas ou pa chanje.",
    signature: "Ouidah Heritage Tour, Ouidah (Benen)",
  },
  GCF: {
    sujetOubli: "Kòd a-w pou chwazi on nouvo mod-pas",
    sujetPremiere: "Kòd a-w pou prèmyé konnèksyon",
    bonjour: (p) => `Bonjou ${p},`,
    oubli: "Men kòd a-w pou chwazi on nouvo mod-pas adan lèspas a lékip Ouidah Heritage Tour :",
    premiere: "Men kòd a-w pou prèmyé konnèksyon adan lèspas a lékip Ouidah Heritage Tour :",
    validite: "Kòd-lasa bon pannan 10 minit é i ka sèvi on sèl fwa.",
    ignorer: "Si sé pa-w ki mandé-y, pa okipé-w di imèl-lasa : mod-pas a-w pa ka chanjé.",
    signature: "Ouidah Heritage Tour, Ouidah (Bénen)",
  },
};
