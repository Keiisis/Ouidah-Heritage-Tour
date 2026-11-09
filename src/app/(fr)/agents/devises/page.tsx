import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranDevises } from "@/components/espace/reglages/EcranDevises";

export const metadata: Metadata = { title: `${section("agents", "devises")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };
export default function Page() { return <Suspense fallback={null}><EcranDevises role="agents" /></Suspense>; }
