import { themeSite } from "@/content/site";

const couleur = /^#[0-9a-f]{6}$/i;
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function contraste(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function themeValide(valeur: unknown): valeur is typeof themeSite {
  if (!valeur || typeof valeur !== "object" || !("couleurs" in valeur) || !valeur.couleurs || typeof valeur.couleurs !== "object") return false;
  const c = valeur.couleurs as Record<string, unknown>;
  if (!Object.keys(themeSite.couleurs).every(k => typeof c[k] === "string" && couleur.test(c[k]))) return false;
  return ["brand-primary", "brand-primary-hover", "surface-brand", "surface-abyss"].every(k => contraste(c[k] as string, "#f7f1e8") >= 4.5)
    && contraste(c["accent-sun"] as string, c["surface-abyss"] as string) >= 4.5;
}
export function variablesTheme(valeur: unknown): Record<string, string> {
  const t = themeValide(valeur) ? valeur : themeSite;
  return Object.fromEntries(Object.entries(t.couleurs).map(([cle, v]) => [`--${cle}`, v]));
}
