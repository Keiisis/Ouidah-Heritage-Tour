// Pictos au trait propres à la boutique (ceux que le jeu du site n'a pas : cœur, sac, chariot, réglages, loupe de zoom,
// chevron bas), dessinés comme ceux de la maquette I. Toujours décoratifs : le libellé est porté ailleurs.
const TRACES = {
  coeur: '<path d="M12 20s-7.5-4.6-7.5-10.1C4.5 7 6.6 5 9 5c1.4 0 2.4.7 3 1.7.6-1 1.6-1.7 3-1.7 2.4 0 4.5 2 4.5 4.9C19.5 15.4 12 20 12 20z"/>',
  sac: '<path d="M5 8h14l-1.2 11H6.2L5 8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  reglages: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 8v5M8 10.5h5"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
} as const;

export type NomPicto = keyof typeof TRACES;

export function Picto({ nom, className = "" }: { nom: NomPicto; className?: string }) {
  return <svg viewBox="0 0 24 24" className={`bq-trait ${className}`} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: TRACES[nom] }} />;
}

// chariot de l'en-tête, plus large que haut (40 × 32)
export function Chariot() {
  return (
    <svg viewBox="0 0 40 32" className="bq-trait" aria-hidden="true" focusable="false">
      <path d="M2 4h5l4.5 17h20L36 9H9.5" />
      <circle cx="14" cy="27" r="2.2" />
      <circle cx="29" cy="27" r="2.2" />
    </svg>
  );
}
