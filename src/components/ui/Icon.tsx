import { ICONES, type NomIcone } from "./icones";

// Icônes Hugeicons (MIT) au trait, servies depuis le site (aucun appel externe). Toujours décoratives : le libellé est porté ailleurs.
// Le trait se dessine quand un parent porte la classe .oht-vivant et passe au survol ou au focus (globals.css).
export function Icon({ name, className = "size-5" }: { name: NomIcone; className?: string }) {
  return <svg viewBox="0 0 24 24" className={`oht-icon ${className}`} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: ICONES[name] }} />;
}
