"use client";

import Link from "next/link";
import { useState } from "react";
import type { Role } from "@/content/equipe";
import { finances as F } from "@/content/espace-finances";
import type { LigneDevisListe } from "@/lib/serveur/equipe/finances/lectures";
import { euroDeFcfa, fcfa } from "../outils";

// Liste des devis (table devis), filtrée par état et, pour l'admin, par agent. Les lignes viennent du serveur, déjà
// limitées aux dossiers de l'agent ; les filtres ne font que trier ce qui est déjà autorisé.
const ETATS = ["brouillon", "pret", "paye"] as const;
const D = F.devis;
const leJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Porto-Novo" });

export function ListeDevis({ role, lignes, admin }: { role: Role; lignes: LigneDevisListe[]; admin: boolean }) {
  const [etat, setEtat] = useState<"tous" | (typeof ETATS)[number]>("tous");
  const [agent, setAgent] = useState("");
  const agents = [...new Map(lignes.filter((l) => l.agent).map((l) => [l.agent!.id, l.agent!])).values()];
  const parAgent = lignes.filter((l) => !agent || (agent === "aucun" ? !l.agent : l.agent?.id === agent));
  const vues = parAgent.filter((l) => etat === "tous" || l.statut === etat);
  const compte = (e: string) => parAgent.filter((l) => e === "tous" || l.statut === e).length;
  return (
    <div className="bloc-corps">
      <div className="outils-liste">
        <div className="filtres" role="group" aria-label={D.filtreEtat}>
          {(["tous", ...ETATS] as const).map((e) => (
            <button key={e} type="button" aria-pressed={etat === e} onClick={() => setEtat(e)} data-filtre={e}>
              <b>{compte(e)}</b>
              <span>{e === "tous" ? D.tous : F.etatsDevis[e]}</span>
            </button>
          ))}
        </div>
        {admin && (
          <label className="filtre-agent">
            {D.filtreAgent}
            <select value={agent} onChange={(e) => setAgent(e.target.value)} name="agent">
              <option value="">{D.tousAgents}</option>
              <option value="aucun">{D.sansAgent}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.prenom} {a.nom}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {vues.length ? (
        <div className="tableau-defile">
          <table className="tableau">
            <thead>
              <tr>
                <th scope="col">{D.cols.client}</th>
                {admin && <th scope="col">{D.cols.agent}</th>}
                <th scope="col">{D.cols.etat}</th>
                <th scope="col">{D.cols.montant}</th>
                <th scope="col">{D.cols.date}</th>
              </tr>
            </thead>
            <tbody>
              {vues.map((l) => (
                <tr key={l.id} data-devis={l.id}>
                  <td data-col={D.cols.client}>
                    <Link className="lien" href={`/${role}/demandes/${l.demande}`} aria-label={D.ouvrir(l.client)}>
                      {l.client}
                    </Link>
                    {l.numero && <span className="sous-cell">{l.numero}</span>}
                  </td>
                  {admin && <td data-col={D.cols.agent}>{l.agent ? `${l.agent.prenom} ${l.agent.nom}` : D.sansAgent}</td>}
                  <td data-col={D.cols.etat}>
                    <span className="etat" data-e={l.statut}>
                      {F.etatsDevis[l.statut] ?? l.statut}
                    </span>
                  </td>
                  <td data-col={D.cols.montant}>
                    {l.montant !== null ? (
                      <span className="num">
                        {fcfa(l.montant)}
                        <small>{euroDeFcfa(l.montant)}</small>
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td data-col={D.cols.date}>{l.publie ? leJour.format(Date.parse(l.publie)) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="vide">
          <b>{lignes.length ? D.filtreVide : D.vide[0]}</b>
          {!lignes.length && <span>{D.vide[1]}</span>}
        </div>
      )}
    </div>
  );
}
