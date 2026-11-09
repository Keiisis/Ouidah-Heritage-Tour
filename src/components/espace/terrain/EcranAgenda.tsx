import Link from "next/link";
import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { terrain } from "@/content/espace-terrain";
import { iso, jourOuidah } from "@/lib/jours";
import { etatMoment } from "@/lib/serveur/equipe/dossiers-regles";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lireAgenda } from "@/lib/serveur/equipe/terrain/agenda";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Agenda, type JourVu } from "./Agenda";
import "./terrain.css";

// Écran « Agenda » de l'agent (lot terrain L5), rendu sous <Suspense> : sans session valable, retour à l'entrée /agents.
// Vue jour ou semaine (lundi à dimanche) d'après l'adresse (?vue=jour|semaine&j=AAAA-MM-JJ), à l'heure de Ouidah. Les
// moments viennent des dossiers de l'agent (lot L4) ; dates et heures formatées ici. Si la base ne répond pas, on le dit.
const A = terrain.agenda;
const MIN = 60_000, JOUR_MS = 86_400_000, DECALAGE = T.ouidah.decalage * MIN;
const leJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const court = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const enOuidah = (ms: number) => new Date(ms + DECALAGE).toISOString();
const hm = (ms: number) => enOuidah(ms).slice(11, 16).replace(":", " h ");
const jourDeIso = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / JOUR_MS);
const lundi = (j: number) => j - ((j + 3) % 7); // le 1er janvier 1970 était un jeudi

export async function EcranAgenda({ vue, j }: { vue?: string; j?: string }) {
  const s = await exigerRole("agents");
  if (!s) redirect("/agents");
  const minute = minuteServeur(); // l'heure de la requête, lue après la session (comme les autres écrans)
  const ms = minute * 60_000;
  const auj = jourOuidah(ms);
  const lu = typeof j === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j) ? jourDeIso(j) : NaN;
  const choisi = Number.isFinite(lu) ? Math.min(auj + 3 * 366, Math.max(auj - 366, lu)) : auj;
  const unJour = vue === "jour";
  const debut = unJour ? choisi : lundi(choisi);
  const n = unJour ? 1 : 7;
  const a = await lireAgenda(s, debut, n);
  const lien = (v: "jour" | "semaine", jour: number) => `/agents/agenda?vue=${v}&j=${iso(jour)}`;
  const v = unJour ? "jour" : "semaine";
  const periode = unJour ? leJour.format((debut + 0.5) * JOUR_MS) : A.periodeSemaine(court.format(debut * JOUR_MS), court.format((debut + 6) * JOUR_MS));

  const jours: JourVu[] = a
    ? Array.from({ length: n }, (_, i) => {
        const d = debut + i;
        return {
          iso: iso(d),
          titre: leJour.format((d + 0.5) * JOUR_MS),
          aujourdhui: d === auj,
          moments: a.moments
            .filter((m) => jourOuidah(m.debut) === d)
            .map((m) => ({ id: m.id, dossier: m.dossier, client: m.client, type: m.type, lieu: m.lieu, heure: `${hm(m.debut)} – ${hm(m.fin)}`, date: enOuidah(m.debut).slice(0, 10), hhmm: enOuidah(m.debut).slice(11, 16), etat: etatMoment(m, ms) })),
        };
      })
    : [];

  return (
    <Enveloppe role="agents" session={s} actif="agenda" minute={minute}>
      <Tete titre={A.titre} sous={A.sous} />
      <div className="esp-terrain">
        <nav className="agenda-outils" aria-label={A.vue}>
          <div className="groupe">
            <Link className="bouton-2 bouton-petit" href={lien("jour", choisi)} aria-current={unJour ? "page" : undefined} data-vue="jour">
              {A.vues.jour}
            </Link>
            <Link className="bouton-2 bouton-petit" href={lien("semaine", choisi)} aria-current={unJour ? undefined : "page"} data-vue="semaine">
              {A.vues.semaine}
            </Link>
          </div>
          <p className="agenda-periode" id="agenda-periode">
            {periode}
          </p>
          <div className="groupe">
            <Link className="bouton-2 bouton-petit" href={lien(v, choisi - n)} rel="prev" data-nav="precedent">
              {A.precedent}
            </Link>
            <Link className="bouton-2 bouton-petit" href={lien(v, auj)} data-nav="aujourdhui">
              {A.aujourdhui}
            </Link>
            <Link className="bouton-2 bouton-petit" href={lien(v, choisi + n)} rel="next" data-nav="suivant">
              {A.suivant}
            </Link>
          </div>
        </nav>
      </div>
      {a ? (
        <Agenda key={`${v}-${debut}`} jours={jours} dossiers={a.dossiers} lieux={a.lieux.map((l) => ({ id: l.id, nom: l.nom }))} dateParDefaut={iso(choisi)} unJour={unJour} />
      ) : (
        <div className="esp-grille">
          <Bloc id="t-age" titre={A.titre} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        </div>
      )}
    </Enveloppe>
  );
}
