import { redirect } from "next/navigation";

// Ancienne rubrique « Partenaires » du contenu (aucun rendu public) : retirée du menu. Les candidatures des partenaires
// arrivent dans « Rendez-vous et candidatures » ; un ancien favori y mène.
export default function Page() {
  redirect("/admins/services");
}
