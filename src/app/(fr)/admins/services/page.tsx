import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranServices } from "@/components/services/EcranServices";

// Rendez-vous et candidatures (admin) : la session est lue sous <Suspense> ; sans session admin, retour à /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "services")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranServices admin />
    </Suspense>
  );
}
