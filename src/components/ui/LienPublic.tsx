"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useLangue } from "./ContenuSite";
import { adresseLangue } from "@/lib/adresses-langues";

/** Un seul passage pour tous les liens publics ; les URL techniques restent intactes. */
export default function LienPublic({ href, ...props }: ComponentProps<typeof Link>) {
  const langue = useLangue();
  const cible = typeof href === "string" ? adresseLangue(href, langue) : {
    ...href, ...(href.pathname ? { pathname: adresseLangue(href.pathname, langue) } : {}),
  };
  return <Link href={cible} {...props} />;
}
