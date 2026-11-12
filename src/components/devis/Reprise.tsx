"use client";

import Link from "@/components/ui/LienPublic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { devisPage as DEVIS_PAGE, nav as NAV } from "@/content/fr";
import { useContenu, useLangue } from "@/components/ui/ContenuSite";
import { adresseLangue } from "@/lib/adresses-langues";
import { ecrireDossier } from "@/lib/voyage";
import type { DossierEnvoye, Intention, ReponsesDevis } from "@/lib/demande";

// Reprise sur un autre appareil : le serveur rend le dossier et les réponses du brouillon ; ils sont remis sur cet
// appareil (chaque section de l'accueil les retrouve), puis la demande s'ouvre. Coordonnées jamais gardées : à retaper.
type Brouillon = { intention: Intention; circuit: string | null; langue: string; dossier: DossierEnvoye; reponses: ReponsesDevis };

export function Reprise({ jeton }: { jeton: string }) {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const nav = useContenu("fr.nav", NAV);
  const langue = useLangue();
  const router = useRouter();
  const [perdu, setPerdu] = useState(false);
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch("/api/devis/reprise", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jeton }) });
        if (annule) return;
        if (!res.ok) return setPerdu(true);
        const b = (await res.json()) as Brouillon;
        ecrireDossier({ sejour: b.dossier.sejour, lieux: b.dossier.lieux, raisons: b.dossier.raisons, services: b.dossier.services });
        try {
          localStorage.setItem("oht-devis", JSON.stringify({ reponses: { ...b.reponses, langue: b.langue }, champs: { nom: "", email: "", whatsapp: "", message: "" } }));
        } catch {
          /* navigation privée : la demande s'ouvre quand même, dossier compris */
        }
        const q = new URLSearchParams();
        if (b.intention !== "voyage") q.set("demande", b.intention);
        if (b.circuit) q.set("circuit", b.circuit);
        router.replace(adresseLangue(`/devis${q.size ? `?${q}` : ""}`, langue));
      } catch {
        if (!annule) setPerdu(true);
      }
    })();
    return () => {
      annule = true;
    };
  }, [jeton, router, langue]);

  return perdu ? (
    <div role="alert">
      <p className="max-w-[28ch] font-display text-[32px]/[1.15] font-semibold tracking-[-0.02em] md:text-[44px]">{T.reprendre.invalide}</p>
      {/* les deux suites de la phrase : recomposer le voyage, ou écrire à l'équipe */}
      <p className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-[16px]">
        <Link href={T.reprendre.accueil.href} className="oht-lien">
          {T.reprendre.accueil.label}
        </Link>
        <Link href={nav.contact.href} className="oht-lien">
          {nav.contact.label}
        </Link>
      </p>
    </div>
  ) : (
    <p aria-live="polite" className="font-display text-[32px] md:text-[44px]">
      {T.reprendre.chargement}
    </p>
  );
}
