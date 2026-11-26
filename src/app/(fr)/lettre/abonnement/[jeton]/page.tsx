import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Abonnement } from "@/components/espace/messages/Abonnement";
import { copiesLettre } from "@/content/courriels-lettre";
import { adresseLangue } from "@/lib/adresses-langues";
import { lireContenu } from "@/lib/contenu";
import { JOURS_GESTION, lireJetonGestion } from "@/lib/serveur/equipe/messages/envoi";
import { lireAbonne } from "@/lib/serveur/equipe/messages/lectures";
import { masquer } from "@/lib/serveur/equipe/messages/rendu";

// Gestion de l'abonnement à La lettre de Ouidah par le lien signé envoyé à l'adresse (26/11/2026) : langue et thèmes,
// désinscription, réinscription avec un nouvel accord. Jeton faux ou modifié : page introuvable ; jeton expiré : comment en
// recevoir un neuf. L'abonné est lu à la requête, sous <Suspense>, et la page parle sa langue. Jamais indexée.
export const metadata: Metadata = { title: "Ouidah Heritage Tour", robots: { index: false, follow: false } };

type Props = { params: Promise<{ jeton: string }> };

async function Contenu({ params }: Props) {
  const { jeton } = await params;
  await connection(); // l'échéance du jeton se lit à l'heure de la requête, jamais au rendu préparé
  const j = lireJetonGestion(jeton);
  if (!j) notFound();
  const a = await lireAbonne(j.id);
  if (!a) notFound();
  const L = a.langue;
  // lien expiré : la langue seule (aucune adresse, même masquée, ni aucun choix dans la page)
  if (j.expire) return <Abonnement jeton="" langue={L} email="" inscrit={false} sujets={[]} themes={[]} langues={[]} expire jours={JOURS_GESTION} accueil={`${adresseLangue("/", L)}#lettre`} />;
  // thèmes publiés (identifiants, objets) dans la langue de l'abonné : traduction du site, sinon celle des e-mails
  const [fr, traduit, nav] = await Promise.all([lireContenu("fr.newsletter"), lireContenu("fr.newsletter", L), lireContenu("fr.nav")]);
  const themes = fr.sujets.map((s) => {
    const t = traduit.sujets.find((x) => x.id === s.id);
    const v = L === "FR" || (t && t.nom !== s.nom) ? (t ?? s) : (copiesLettre[L].themes[s.id] ?? s);
    return { id: s.id, nom: v.nom, texte: v.texte, objet: s.objet };
  });
  return (
    <Abonnement
      jeton={jeton}
      langue={L}
      email={masquer(a.email)}
      inscrit={!a.desinscrit}
      sujets={a.sujets.filter((id) => themes.some((t) => t.id === id))}
      themes={themes}
      langues={nav.languages.map((l) => ({ code: l.code, nom: l.label }))}
      expire={false}
      jours={JOURS_GESTION}
      accueil={`${adresseLangue("/", L)}#lettre`}
    />
  );
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Contenu params={params} />
    </Suspense>
  );
}
