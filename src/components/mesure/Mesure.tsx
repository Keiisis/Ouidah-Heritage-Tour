"use client";

import { Analytics, type BeforeSend } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { lireEco } from "./eco";
import { useConsentement } from "@/lib/consentement";
import { langueDuSite } from "@/lib/langue";

// Mesure d'audience maison : chaque page affichée est gardée en mémoire, puis les vues de la visite partent ensemble à
// /api/mesure en un seul envoi (VUES_MAX par envoi ; sendBeacon, sinon fetch keepalive) quand l'onglet est caché ou quitté
// (visibilitychange « hidden », pagehide), SEULEMENT si le visiteur a accepté la catégorie « mesure » du bandeau. Une vue
// encore en mémoire quand le navigateur est tué sans signal est perdue. Aucun cookie, aucun stockage, aucun identifiant :
// le chemin, la langue de la page et un référent dont le serveur ne garde que la catégorie (document.referrer pour la page
// d'arrivée, l'origine du site ensuite, comptée « site »). Le serveur refuse lui-même robots, Do Not Track et GPC.
// usePathname sous <Suspense> : avec cacheComponents, une page à paramètre inconnu au build se prérend sans ce composant
// (doc Next 16 « usePathname › Cache Components ») ; le layout peut donc le monter tel quel.
const ADRESSE = "/api/mesure";
const VUES_MAX = 20; // même plafond que lib/serveur/mesure-regles.ts (non importable ici)
type Vue = { chemin: string; langue: string; ref?: string };
// Vercel Web Analytics, sous le même accord et hors mode économie (eco.ts) : jamais les pages privées ni à jeton personnel (même liste que PRIVE de
// lib/serveur/mesure-regles.ts, non importable ici sans tirer le contenu du site dans le navigateur), query et hash retirés.
const PRIVE = /^\/(?:(?:fr|en|es|de|pt|ht|gcf)\/)?(?:agents|admins|api|suivi|payer|devis\/reprendre|lettre|mes-donnees|maintenance)(?:\/|$)/;
const LOCAL = /^(?:localhost|127\.0\.0\.1|\[::1\])$/;
const filtrer: BeforeSend = (e) => {
  const u = new URL(e.url);
  if (PRIVE.test(u.pathname)) return null;
  return { ...e, url: `${u.origin}${u.pathname}` };
};

function Compteur() {
  const choix = useConsentement();
  const chemin = usePathname();
  const accord = choix?.mesure === true;
  const arrivee = useRef<string | null>(chemin); // page d'arrivée, tant que le visiteur n'a pas changé de page
  const envoye = useRef<string | null>(null); // une seule vue par page affichée (double effet du mode strict en développement)
  const file = useRef<Vue[]>([]); // vues pas encore envoyées
  const [eco, setEco] = useState<boolean | null>(null);

  useEffect(() => {
    if (chemin !== arrivee.current) arrivee.current = null;
    if (!accord || envoye.current === chemin) return;
    envoye.current = chemin;
    const ref = arrivee.current === chemin ? document.referrer : location.origin;
    file.current.push({ chemin, langue: langueDuSite(), ...(ref ? { ref } : {}) });
  }, [accord, chemin]);

  useEffect(() => {
    if (!accord) return;
    void lireEco().then(setEco);
    const vider = () => {
      while (file.current.length) {
        const corps = JSON.stringify({ vues: file.current.splice(0, VUES_MAX) });
        // texte simple : sendBeacon n'accepte qu'un type de contenu sans prévol ; le serveur lit le JSON du corps
        if (!("sendBeacon" in navigator && navigator.sendBeacon(ADRESSE, corps))) fetch(ADRESSE, { method: "POST", body: corps, keepalive: true }).catch(() => {});
      }
    };
    const cache = () => document.visibilityState === "hidden" && vider();
    document.addEventListener("visibilitychange", cache);
    window.addEventListener("pagehide", vider);
    return () => {
      document.removeEventListener("visibilitychange", cache);
      window.removeEventListener("pagehide", vider);
    };
  }, [accord]);

  // le script /_vercel/insights n'est servi que par Vercel : rien sur le poste local (sinon 404 à chaque page), ni en mode
  // économie (eco null tant qu'il n'est pas lu). `accord` n'est vrai qu'après l'hydratation (choix lu dans le navigateur),
  // location est donc toujours défini ici
  return accord && eco === false && !LOCAL.test(location.hostname) ? <Analytics beforeSend={filtrer} /> : null;
}

export function Mesure() {
  return (
    <Suspense fallback={null}>
      <Compteur />
    </Suspense>
  );
}
