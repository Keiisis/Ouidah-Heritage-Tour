import "server-only";
import { revalidateTag } from "next/cache";
import { REGISTRE, type CleContenu } from "@/lib/contenu-registre";
import { LANGUES, type Langue } from "@/lib/langue";
import { base } from "../base";
import { cleGroq } from "../assistant/fournisseur";
import { rpcTache } from "../equipe/pilotage/taches";
import { lireReglagesTraduction } from "./reglages";
import { appliquerContenu, assemblerChamps, cleMemoire, estContenuAuto, extraireContenu, lireValeursChamps, preparerSegments, sourceContenu, traductionValide, type ChampAuto, type SegmentAuto } from "./moteur";
import { MAX_CARACTERES_LOT, MAX_SEGMENTS_LOT, traduireSegments } from "./fournisseur";
import { extraireBlog, extraireCatalogue, reconstruireBlog, reconstruireCatalogue, type SourceBlog, type SourceCatalogue } from "./adaptateurs-blog-catalogue";
import { mediasBlog } from "../blog/lectures";

type Objet = Record<string, unknown>;
type Type = "contenu" | "produits" | "categories" | "matieres" | "blog";
type Snapshot = { version: 1; glossaire: string; langueSource: Langue; champs: Record<string, string>; traductions: Partial<Record<Langue, Record<string, string>>> };
type Job = { type: Type; cle: string; generation: number; lease: string; donnees: { source: Objet; variantes?: unknown }; snapshot: Snapshot | null; humains?: Partial<Record<Langue, { source: Objet; avant: unknown; apres: unknown }>>; essais: number };
type Memoire = { cle: string; source: string; langue_source: Langue; langue: Langue; contexte: string; traduction: string; origine: "auto" | "humain" };
const objet = (v: unknown): v is Objet => v !== null && typeof v === "object" && !Array.isArray(v);
const champSegment = (c: ChampAuto): SegmentAuto => ({ id: c.id, source: c.source, contexte: `${c.contexte}:champ-complet`, max: c.max });

/** Acquittement séparé : un arrêt après le commit SQL ne doit pas laisser l'ancien cache affiché. */
async function invaliderCache(): Promise<boolean> {
  try {
    const r = await base("traduction_auto_file?select=type,cle,generation:cache_generation&cache_a_invalider=eq.true&limit=100");
    if (!r.ok) return false;
    const documents = await r.json() as { type: Type; cle: string; generation: number }[];
    if (!documents.length) return true;
    for (const tag of new Set(documents.map(d => d.type === "contenu" ? "contenu" : d.type === "blog" ? "blog" : "boutique"))) revalidateTag(tag, { expire: 0 });
    return Boolean(await rpcTache("traduction_auto_acquitter_cache", { p_documents: documents }));
  } catch { return false; }
}

async function lireMemoire(cles: string[]): Promise<Map<string, Memoire>> {
  const resultat = new Map<string, Memoire>();
  for (let debut = 0; debut < cles.length; debut += 60) {
    const lot = cles.slice(debut, debut + 60);
    const r = await base(`traduction_auto_memoire?select=cle,source,langue_source,langue,contexte,traduction,origine&cle=in.(${lot.join(",")})`);
    if (!r.ok) throw new Error("base");
    for (const m of await r.json() as Memoire[]) resultat.set(m.cle, m);
  }
  return resultat;
}

function document(job: Job) {
  const source = job.donnees.source;
  if (!objet(source)) return null;
  let champs: ChampAuto[], langueSource: Langue = "FR";
  let mode: "cles" | "imbrique" = "cles";
  let champsCible: ((langue: Langue) => ChampAuto[]) | undefined;
  let cible: (langue: Langue) => unknown;
  let construire: (langue: Langue, valeurs: Record<string, string>) => unknown;
  if (job.type === "contenu") {
    if (!estContenuAuto(job.cle)) return null;
    const cle = job.cle as CleContenu, valeur = sourceContenu(cle, source.valeur);
    const extraction = extraireContenu(cle, valeur);
    mode = extraction.mode === "imbrique" ? "imbrique" : "cles";
    champsCible = langue => extraireContenu(cle, valeur, langue).champs;
    champs = extraction.champs;
    cible = langue => extraction.mode === "imbrique" ? (objet(valeur) ? valeur[langue] : null)
      : objet(job.donnees.variantes) && objet(job.donnees.variantes[langue]) ? job.donnees.variantes[langue].valeur : null;
    construire = (langue, valeurs) => {
      const complet = appliquerContenu(cle, valeur, extraction.mode === "imbrique" ? valeur : cible(langue), valeurs, langue);
      return extraction.mode === "imbrique" && objet(complet) ? complet[langue] : complet;
    };
  } else if (job.type === "blog") {
    if (source.etat !== "publie") return null;
    if (!LANGUES.includes(source.langue as Langue)) throw new Error("validation");
    langueSource = source.langue as Langue;
    const article = source as SourceBlog;
    champs = extraireBlog(article);
    cible = langue => Array.isArray(job.donnees.variantes) ? job.donnees.variantes.find(v => objet(v) && v.langue === langue) : null;
    construire = (_langue, valeurs) => reconstruireBlog(article, valeurs, mediasBlog());
  } else {
    if (job.type === "produits" && source.publie !== true) return null;
    const type = job.type, article = source as SourceCatalogue;
    champs = extraireCatalogue(type, article);
    cible = langue => objet(source.traductions) ? source.traductions[langue] : null;
    construire = (_langue, valeurs) => reconstruireCatalogue(type, article, valeurs);
  }
  return { champs, champsCible: champsCible ?? (() => champs), langueSource, cible, construire, mode };
}

/** File SQL durable. Le rendu public ne charge jamais ce module ni le fournisseur. */
export async function traiterTraductions(): Promise<{ traites: number; erreur?: string }> {
  if (!await invaliderCache()) return { traites: 0, erreur: "base" };
  const reg = await lireReglagesTraduction();
  if (!reg) return { traites: 0, erreur: "base" };
  if (!reg.actif || !cleGroq()) return { traites: 0, erreur: reg.actif ? "configuration" : undefined };
  const init = await rpcTache("traduction_auto_initialiser", { p_cles: Object.keys(REGISTRE).filter(estContenuAuto), p_forcer: false });
  if (!init) return { traites: 0, erreur: "base" };
  const limite = Date.now() + 43_000;
  let traites = 0;
  while (Date.now() < limite) {
    const prise = await rpcTache<Job | null>("traduction_auto_prendre", {});
    if (!prise) return { traites, erreur: "base" };
    const job = prise.valeur;
    if (!job) return { traites };
    const identite = { p_type: job.type, p_cle: job.cle, p_generation: job.generation, p_lease: job.lease };
    const reporter = async (erreur: string) => {
      const attente = erreur === "budget" ? 3600 : erreur ? Math.min(3600, 30 * 2 ** Math.min(job.essais, 6)) : 1;
      await rpcTache("traduction_auto_reporter", { ...identite, p_erreur: erreur, p_attente_secondes: attente });
    };
    try {
      const doc = document(job);
      if (!doc) {
        const fin = await rpcTache("traduction_auto_finaliser", { ...identite, p_traductions: job.type === "contenu" ? { mode: "cles", valeurs: {} } : {}, p_snapshot: {} });
        if (!fin) throw new Error("base");
        traites++; continue;
      }
      const options = { langueSource: doc.langueSource, glossaire: reg.glossaire };
      const snapshot: Snapshot = { version: 1, glossaire: reg.glossaire, langueSource: doc.langueSource, champs: Object.fromEntries(doc.champs.map(c => [c.id, c.source])), traductions: {} };
      const resultats: Partial<Record<Langue, unknown>> = {};
      for (const langue of LANGUES.filter(l => l !== doc.langueSource)) {
        const champs = doc.champsCible(langue);
        const actuelles = lireValeursChamps(champs, doc.cible(langue));
        const anciennes = job.snapshot?.version === 1 ? job.snapshot : null;
        const corrections: Memoire[] = [];
        for (const champ of champs) {
          const texte = actuelles[champ.id], precedent = anciennes?.traductions[langue]?.[champ.id];
          if (anciennes?.champs[champ.id] === champ.source && precedent !== undefined && texte !== undefined && texte !== precedent && traductionValide(champ.source, texte, champ.max)) {
            const segment = champSegment(champ);
            corrections.push({ cle: cleMemoire(segment, langue, options), source: champ.source, langue_source: doc.langueSource, langue, contexte: segment.contexte, traduction: texte, origine: "humain" });
          }
        }
        // Le trigger conserve la source exacte au moment d'une correction humaine,
        // y compris si cette correction précède le tout premier passage du worker.
        const evenement = job.humains?.[langue];
        if (evenement && objet(evenement.source)) {
          const historique = document({ ...job, donnees: { source: evenement.source }, humains: {} });
          if (historique) {
            const anciensChamps = historique.champsCible(langue);
            const avant = lireValeursChamps(anciensChamps, evenement.avant), apres = lireValeursChamps(anciensChamps, evenement.apres);
            for (const champ of anciensChamps) {
              const texte = apres[champ.id];
              if (texte === undefined || texte === avant[champ.id] || !traductionValide(champ.source, texte, champ.max)) continue;
              const segment = champSegment(champ), cle = cleMemoire(segment, langue, { ...options, langueSource: historique.langueSource });
              const precedente = corrections.findIndex(c => c.cle === cle);
              if (precedente >= 0) corrections.splice(precedente, 1);
              corrections.push({ cle, source: champ.source, langue_source: historique.langueSource, langue, contexte: segment.contexte, traduction: texte, origine: "humain" });
            }
          }
        }
        if (corrections.length) {
          const enregistrement = await rpcTache<number>("traduction_auto_memoriser", { ...identite, p_entrees: corrections });
          if (!enregistrement) throw new Error("base");
          if (enregistrement.valeur !== corrections.length) { await reporter(""); return { traites }; }
        }
        const plan = preparerSegments(champs);
        const clesChamps = new Map(champs.map(c => [c.id, cleMemoire(champSegment(c), langue, options)]));
        const memoire = await lireMemoire([...clesChamps.values(), ...plan.segments.map(s => cleMemoire(s, langue, options))]);
        const valeurs: Record<string, string> = {};
        for (const champ of champs) {
          const m = memoire.get(clesChamps.get(champ.id)!);
          if (m?.origine === "humain" && m.source === champ.source && traductionValide(champ.source, m.traduction, champ.max)) valeurs[champ.id] = m.traduction;
        }
        const restants = preparerSegments(champs.filter(c => !Object.hasOwn(valeurs, c.id)));
        const textes: Record<string, string> = {};
        const manquants: SegmentAuto[] = [];
        for (const segment of restants.segments) {
          const m = memoire.get(cleMemoire(segment, langue, options));
          if (m && m.source === segment.source && traductionValide(segment.source, m.traduction, segment.max)) textes[segment.id] = m.traduction;
          else manquants.push(segment);
        }
        while (manquants.length) {
          if (Date.now() > limite - 21_000) { await reporter(""); return { traites }; }
          const lot: SegmentAuto[] = []; let taille = 0;
          while (manquants.length && lot.length < MAX_SEGMENTS_LOT && taille + manquants[0].source.length <= MAX_CARACTERES_LOT) {
            const segment = manquants.shift()!; lot.push(segment); taille += segment.source.length;
          }
          if (!lot.length) throw new Error("validation");
          const plafond = Math.min(16000, Math.max(1500, taille * 2));
          const reserves = Buffer.byteLength(JSON.stringify(lot) + reg.glossaire, "utf8") + 6000 + plafond;
          const reservation = await rpcTache<string | null>("traduction_auto_reserver_budget", { p_jetons: reserves });
          if (!reservation) throw new Error("base");
          if (!reservation.valeur) { await reporter("budget"); return { traites, erreur: "budget" }; }
          const traduit = await traduireSegments(langue, lot, { ...options, modele: reg.modele, plafond });
          // Une requête sans usage fiable garde la réserve ; jamais un échec compté comme gratuit.
          const solde = await rpcTache("traduction_auto_solder_budget", { p_reservation: reservation.valeur, p_jetons: traduit.jetons > 0 ? traduit.jetons : null });
          if (!solde) throw new Error("base");
          if (!traduit.ok) throw new Error(traduit.erreur === "fournisseur" ? "fournisseur" : "validation");
          const entrees: Memoire[] = lot.map(s => ({ cle: cleMemoire(s, langue, options), source: s.source, langue_source: doc.langueSource, langue, contexte: s.contexte, traduction: traduit.traductions[s.id], origine: "auto" }));
          const enregistrement = await rpcTache<number>("traduction_auto_memoriser", { p_entrees: entrees });
          if (!enregistrement || enregistrement.valeur !== entrees.length) throw new Error("base");
          Object.assign(textes, traduit.traductions);
        }
        Object.assign(valeurs, assemblerChamps(restants, textes));
        resultats[langue] = doc.construire(langue, valeurs);
        snapshot.traductions[langue] = valeurs;
      }
      const fin = await rpcTache<string>("traduction_auto_finaliser", { ...identite, p_traductions: job.type === "contenu" ? { mode: doc.mode, valeurs: resultats } : resultats, p_snapshot: snapshot });
      if (!fin) throw new Error("base");
      if (fin.valeur === "applique") {
        traites++;
        if (!await invaliderCache()) return { traites, erreur: "base" };
      } else if (fin.valeur === "collision") return { traites, erreur: "conflit" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const erreur = ["base", "budget", "fournisseur", "validation"].includes(message) ? message : "validation";
      await reporter(erreur);
      return { traites, erreur };
    }
  }
  return { traites };
}
