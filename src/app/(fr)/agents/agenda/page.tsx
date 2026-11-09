import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranAgenda } from "@/components/espace/terrain/EcranAgenda";

// Agenda de l'agent (lot terrain L5) : dossier fixe, sorti du [section] prérendu. La vue (?vue=jour|semaine&j=AAAA-MM-JJ)
// est une donnée de la requête, lue sous <Suspense> avec la session ; sans session, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "agenda")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

const un = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={null}>{searchParams.then((q) => <EcranAgenda vue={un(q.vue)} j={un(q.j)} />)}</Suspense>;
}
