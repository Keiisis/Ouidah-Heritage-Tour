"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import type { LigneListe, MembreActif } from "@/lib/serveur/equipe/dossiers";
import { attribuer } from "@/lib/serveur/equipe/dossiers-actions";
import { ETAPES, type Etape } from "@/lib/serveur/equipe/dossiers-regles";
import { Bloc, Vide } from "./Bloc";
import { useMinute } from "./Cadre";
import { fcfa, ilYa } from "./outils";
import "./dossier.css";

// Liste des demandes (lot L4, maquette E ?ecran=dossier) : celles de l'agent, ou toutes pour un admin. Les compteurs par
// étape filtrent ; l'admin filtre aussi par agent et attribue chaque demande à un membre actif (le serveur relit tout et
// renvoie la liste à jour). `parEtape` : la même liste rangée par étape (Dossiers voyage). Chaque ligne ouvre le dossier
// à son adresse propre (/agents/demandes/<id>), dans le tiroir.
const D = T.demandes;
type Filtre = "toutes" | Etape;

export function Demandes({ role, demandes, membres, admin, parEtape = false }: { role: Role; demandes: LigneListe[]; membres: MembreActif[] | null; admin: boolean; parEtape?: boolean }) {
  const minute = useMinute();
  const [etape, setEtape] = useState<Filtre>("toutes");
  const [agent, setAgent] = useState<string>("tous");
  const [occupe, setOccupe] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [, demarrer] = useTransition();
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);

  const annoncer = (texte: string, erreur = false) => {
    setAnnonce({ texte, erreur });
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setAnnonce(null), 6000);
  };
  const parAgent = demandes.filter((x) => agent === "tous" || (agent === "aucun" ? !x.agent : x.agent?.id === agent));
  const nombre = (f: Filtre) => (f === "toutes" ? parAgent.length : parAgent.filter((x) => x.etape === f).length);
  const vues = etape === "toutes" ? parAgent : parAgent.filter((x) => x.etape === etape);

  const changerAgent = (x: LigneListe, id: string) => {
    if (occupe) return;
    setOccupe(x.id);
    demarrer(async () => {
      try {
        const r = await attribuer(x.id, id || null);
        const m = membres?.find((p) => p.id === id);
        if ("ok" in r) annoncer(m ? D.annonces.attribuee(x.nom, `${m.prenom} ${m.nom}`) : D.annonces.retiree(x.nom));
        else annoncer(r.erreur === "champs" ? T.refus.agent : T.refus[r.erreur === "refuse" ? "refuse" : "panne"], true);
      } catch {
        annoncer(T.refus.reseau, true);
      }
      setOccupe(null);
    });
  };

  const ligne = (x: LigneListe) => (
    <li key={x.id} data-demande={x.id} data-etape={x.etape}>
      <Link className="rangee" href={`/${role}/demandes/${x.id}`} aria-label={D.ouvrir(x.nom)} scroll={false}>
        <span className={x.agent ? "avatar" : "avatar neutre"} aria-hidden="true">
          {x.agent ? `${x.agent.prenom[0] ?? ""}${x.agent.nom[0] ?? ""}`.toUpperCase() : "?"}
        </span>
        <span className="texte">
          <span className="type">{T.admin.demandes.types[x.intention] ?? x.intention}</span>
          <span className="titre">{x.nom}</span>
          <span className="meta">
            {D.recue(ilYa(x.recue, minute))}
            {x.voyageurs > 0 ? `, ${D.voyageurs(x.voyageurs)}` : ""}
            {!admin ? "" : x.agent ? `, ${x.agent.prenom} ${x.agent.nom}` : `, ${D.nonAttribuee.toLowerCase()}`}
          </span>
        </span>
        <span className="langue" title={T.langues[x.langue]}>
          {x.langue}
        </span>
        {x.devis?.montant != null && <span className="num">{fcfa(x.devis.montant)}</span>}
        <span className="etat" data-e={x.etape}>
          {T.etapes[x.etape]}
        </span>
      </Link>
      {admin && membres && (
        <label className="attribution">
          <span className="invisible">{D.attribuerDe(x.nom)}</span>
          <select value={x.agent?.id ?? ""} disabled={occupe === x.id} aria-busy={occupe === x.id} data-attribuer={x.id} onChange={(e) => changerAgent(x, e.target.value)}>
            <option value="">{D.nonAttribuee}</option>
            {membres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.prenom} {m.nom}
              </option>
            ))}
            {x.agent && !membres.some((m) => m.id === x.agent?.id) && <option value={x.agent.id}>{`${x.agent.prenom} ${x.agent.nom}`}</option>}
          </select>
        </label>
      )}
    </li>
  );

  return (
    <div className="esp-grille esp-dossiers esp-demandes">
      <Bloc id="t-dem" titre={D.liste} compte={demandes.length} s={12} i={1}>
        <div className="outils-liste">
          <div className="filtres" role="group" aria-label={D.filtres}>
            {(["toutes", ...ETAPES] as Filtre[]).map((f) => (
              <button key={f} type="button" data-filtre={f} aria-pressed={etape === f} onClick={() => setEtape(f)}>
                <b>{nombre(f)}</b>
                <span>{f === "toutes" ? D.toutes(nombre(f)) : T.etapes[f]}</span>
              </button>
            ))}
          </div>
          {admin && membres && (
            <label className="filtre-agent">
              <span>{D.agent}</span>
              <select value={agent} onChange={(e) => setAgent(e.target.value)} data-filtre-agent>
                <option value="tous">{D.tousAgents}</option>
                <option value="aucun">{D.nonAttribuees}</option>
                {membres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.prenom} {m.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!demandes.length ? (
          <Vide texte={D.vide[role]} />
        ) : !vues.length ? (
          <p className="mention">{D.filtreVide}</p>
        ) : parEtape ? (
          ETAPES.filter((e) => vues.some((x) => x.etape === e)).map((e) => (
            <section key={e} className="groupe-etape" aria-labelledby={`etape-${e}`}>
              <h3 id={`etape-${e}`}>
                {T.etapes[e]} <span className="compte-petit">{vues.filter((x) => x.etape === e).length}</span>
              </h3>
              <ul className="liste liste-demandes">{vues.filter((x) => x.etape === e).map(ligne)}</ul>
            </section>
          ))
        ) : (
          <ul className="liste liste-demandes" id="liste-demandes">
            {vues.map(ligne)}
          </ul>
        )}
      </Bloc>
      <p className="esp-annonce" role="status" aria-live="polite" data-ton={annonce?.erreur ? "erreur" : undefined}>
        {annonce?.texte}
      </p>
    </div>
  );
}
