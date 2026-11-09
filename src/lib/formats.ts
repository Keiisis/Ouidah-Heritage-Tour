import { LOCALES, type Langue } from "./langue";

/** Intl ne connaît pas les mois créoles. Ils viennent des traductions éditables déjà utilisées par les documents. */
export function formatteurDate(langue: Langue, options: Intl.DateTimeFormatOptions, mois?: readonly string[]) {
  const creole = langue === "HT" || langue === "GCF";
  const f = new Intl.DateTimeFormat(LOCALES[langue], creole ? { ...options, weekday: undefined } : options);
  if (!creole || !mois?.length || !options.month || options.month === "numeric" || options.month === "2-digit") return f;
  const numeroMois = new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: options.timeZone });
  return { format: (v: Date | number) => f.formatToParts(v).map((p) => p.type === "month" ? mois[Number(numeroMois.format(v)) - 1] : p.value).join("") };
}
