"use client";
import { useMemo } from "react";
import { suivi as SUIVI } from "@/content/suivi";
import { useContenu, useLangue } from "@/components/ui/ContenuSite";
import { LOCALES } from "./langue";
import { formatteurDate } from "./formats";

export function useFormatsSite() {
  const langue = useLangue();
  const suivi = useContenu("suivi.suivi", SUIVI);
  const mois = suivi[langue].mois;
  return useMemo(() => ({
    langue,
    locale: LOCALES[langue],
    date: (options: Intl.DateTimeFormatOptions) => formatteurDate(langue, options, mois),
    nombre: (options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(LOCALES[langue], options),
  }), [langue, mois]);
}
