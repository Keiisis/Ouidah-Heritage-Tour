import releve from "@/content/lieux-ouidah.json";
import { destinations, tours } from "@/content/fr";
import { longueur } from "@/lib/geo";

// Carte du séjour de l'écran de signature (maquette E) : les vrais lieux de la demande, dans l'ordre (étapes du circuit
// choisi, puis lieux ajoutés au dossier), coordonnées de fr.ts ou du relevé. Seul un vrai tracé à pied est dessiné (celui
// du circuit, avec sa longueur) ; sans tracé, les étapes restent des pastilles, sans ligne inventée entre elles. Le dépôt n'a aucune géométrie de côte : le rivage est la latitude de la Porte du
// Non-Retour (sur la plage), l'océan l'aplat dessous. Les autres lieux relevés deviennent les petits points du fond.
export type LonLat = [number, number];
export type EtapeCarte = { nom: string; lon: number; lat: number };
export type DonneesCarte = { etapes: EtapeCarte[]; ligne: LonLat[]; aPied: boolean; fond: LonLat[]; lagune: LonLat | null; rivage: number; cadre: LonLat[] };
export type RefEtape = [number] | [number, number] | null;

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
export function carteDuSejour(circuit: string | null, lieux: string[], contenu = { tours, destinations, releve }): DonneesCarte & { circuit: { titre: string; n: number } | null; km: number | null } {
  const { tours, destinations, releve } = contenu;
  const DESTINATIONS = new Map(destinations.map((d) => [d.slug, d]));
  const RELEVE = new Map(releve.lieux.filter((l) => l.coords.length === 2).map((l) => [l.slug, l]));
  const coords = (slug: string) => DESTINATIONS.get(slug)?.coords ?? null;
  const PORTE = coords("porte-du-non-retour") ?? [6.3242524, 2.0895803];
  const MUSEE = coords("musee-histoire") ?? [6.3588947, 2.0901242];
  
  function etape(id: string): (EtapeCarte & { cle: string }) | null {
    const d = DESTINATIONS.get(id);
    if (d) return { cle: d.slug, nom: d.name.replace(/'/g, "’"), lon: d.coords[1], lat: d.coords[0] };
    const l = id.startsWith("r:") ? RELEVE.get(id.slice(2)) : undefined;
    return l ? { cle: l.slug, nom: l.nom.replace(/'/g, "’"), lon: l.coords[1], lat: l.coords[0] } : null;
  }
  

  const C = circuit ? tours.find((t) => t.slug === circuit) ?? null : null;
  const vus = new Set<string>();
  const etapes = [...(C?.stops ?? []), ...lieux].flatMap((id) => {
    const e = etape(id);
    if (!e || vus.has(e.cle)) return [];
    vus.add(e.cle);
    return [e];
  });
  const nCircuit = C ? C.stops.filter((s) => DESTINATIONS.has(s)).length : 0;
  const ligne: LonLat[] = C?.trace ? C.trace.map(([lon, lat]) => [r6(lon), r6(lat)]) : [];
  const aPied = ligne.length > 1;
  const lagune = RELEVE.get("lagune-de-ouidah");
  return {
    etapes: etapes.map(({ nom, lon, lat }) => ({ nom, lon, lat })),
    ligne,
    aPied,
    km: aPied ? longueur(ligne) / 1000 : null,
    fond: releve.lieux.filter((l) => l.coords.length === 2 && !vus.has(l.slug)).map((l) => [r6(l.coords[1]), r6(l.coords[0])]),
    lagune: lagune ? [lagune.coords[1], lagune.coords[0]] : null,
    rivage: PORTE[0],
    cadre: [[MUSEE[1], MUSEE[0]], [PORTE[1], PORTE[0]]], // sans étape : la ville jusqu'à la plage
    circuit: C && nCircuit ? { titre: C.title, n: nCircuit } : null,
  };
}

// Renvoi d'une ligne du devis aux étapes de la carte : la ligne qui nomme le circuit couvre toutes ses étapes, celle qui
// nomme un seul lieu du séjour porte son numéro ; les autres (navette, hébergement) n'en ont pas.
const norme = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const cle = (nom: string) => norme(nom).replace(/^(?:l|la|le|les) /, "").replace(/ de ouidah$/, "");

export function refsLignes(libelles: string[], circuit: { titre: string; n: number } | null, etapes: EtapeCarte[]): RefEtape[] {
  const cleCircuit = circuit ? cle(circuit.titre.split(",")[0]) : null;
  const cles = etapes.map((e) => cle(e.nom));
  return libelles.map((l) => {
    const n = ` ${norme(l)} `;
    if (circuit && cleCircuit && n.includes(` ${cleCircuit} `)) return circuit.n > 1 ? [1, circuit.n] : [1];
    const i = cles.flatMap((c, k) => (c && n.includes(` ${c} `) ? [k] : []));
    return i.length === 1 ? [i[0] + 1] : null;
  });
}
