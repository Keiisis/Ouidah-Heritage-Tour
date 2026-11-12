import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";

// Attributions exigées par les licences des photos et du son (CC BY, CC BY-SA, ODbL, domaine public) : une seule liste
// discrète, dans la section « Crédits » des mentions légales (lien du pied de page), jamais sur l'image elle-même.
// Légendes et mention « adaptée » dans la langue de la page (les auteurs, licences et liens ne changent pas).
const hote = (url: string) => (/commons\.wikimedia\.org/.test(url) ? "Wikimedia Commons" : new URL(url).hostname.replace(/^www\./, ""));

export async function ListeCredits() {
  const [T, creditsPhotos] = await Promise.all([lireContenu("fr.creditsPage"), lireContenu("credits-photos.creditsPhotos")]);
  if (!creditsPhotos.length) return null;
  return (
    <ul className="lg-credits">
      {creditsPhotos.map((c) => (
        <li key={c.fichier}>
          {c.oeuvre} · {c.auteur} ·{" "}
          <a href={c.source} target="_blank" rel="noopener noreferrer">
            {hote(c.source)}
          </a>{" "}
          ·{" "}
          <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer license">
            {c.licence}
          </a>
          {c.modifiee ? ` · ${T.modifiee}` : ""}
        </li>
      ))}
    </ul>
  );
}
