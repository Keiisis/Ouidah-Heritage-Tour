import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranBlog } from "@/components/espace/blog/EcranBlog";

// Blog (agents avec le droit « site ») : liste filtrable et éditeur d'un article (?id=), lus sous <Suspense> avec la
// session ; sans le droit, l'état « sans droit » ; sans session, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "blog")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranBlog role="agents" recherche={searchParams} />
    </Suspense>
  );
}
