import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranBlog } from "@/components/espace/blog/EcranBlog";

// Blog (admins) : liste filtrable et éditeur d'un article (?id=), dossier fixe, sorti du [section] prérendu. La session et
// l'adresse sont lues sous <Suspense> ; sans session admin, retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "blog")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranBlog role="admins" recherche={searchParams} />
    </Suspense>
  );
}
