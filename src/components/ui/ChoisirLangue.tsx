"use client";

import { Suspense, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { adresseChangementLangue, adresseLangue } from "@/lib/adresses-langues";
import { normaliserLangue } from "@/lib/langue";
import { useLangue } from "./ContenuSite";
const abonnement = (f: () => void) => {
  window.addEventListener("hashchange", f);
  window.addEventListener("popstate", f);
  return () => { window.removeEventListener("hashchange", f); window.removeEventListener("popstate", f); };
};
const adresseCourante = (code: string) => {
  const variantes = Object.fromEntries([...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map(l => [l.hreflang.toLowerCase().split("-")[0], l.href]));
  return adresseChangementLangue(window.location.href, normaliserLangue(code), variantes);
};

type Props = { code: string; children: React.ReactNode; className?: string };
function LienLangue({ code, children, className }: Props) {
  const actuelle = useLangue();
  const chemin = usePathname();
  const recherche = useSearchParams();
  const adresseServeur = chemin + (recherche.size ? `?${recherche}` : "");
  const adresse = useSyncExternalStore(abonnement, () => adresseCourante(code), () => adresseChangementLangue(adresseServeur, normaliserLangue(code)));
  return <a href={adresse} hrefLang={code.toLowerCase()} lang={code.toLowerCase()} aria-current={actuelle === code ? "page" : undefined} className={className}>{children}</a>;
}

export function ChoisirLangue(props: Props) {
  return <Suspense fallback={<a href={adresseLangue("/", normaliserLangue(props.code))} className={props.className}>{props.children}</a>}><LienLangue {...props} /></Suspense>;
}
