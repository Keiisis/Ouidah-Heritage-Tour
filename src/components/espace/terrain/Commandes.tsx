"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { espace } from "@/content/espace";
import { terrain } from "@/content/espace-terrain";
import { useMouvementReduit } from "@/lib/mouvement";
import { avancerCommande, annulerCommande, chiffrerCommande, lienPaiementCommande } from "@/lib/serveur/equipe/terrain/commandes-actions";
import { type EtatCommande, SUIVANT, TRANSITIONS_COMMANDE } from "@/lib/serveur/equipe/terrain/regles";
import { peutPasser } from "@/lib/serveur/machines";
import { Vide } from "../Bloc";
import { Picto } from "../Picto";

// Commandes boutique à préparer puis à remettre (lot terrain L5) : compteurs qui filtrent par état, une carte par commande
// (articles et options, retrait ou livraison, client joignable), et le seul pas suivant permis. Le serveur relit la session
// et l'état en base à chaque clic, puis renvoie la liste à jour (refresh) : rien n'est décidé ici. Mouvement : les cartes se
// replacent (FLIP, motion layout), l'état qui change se pose comme un tampon ; rien en mouvement réduit.

const C = terrain.commandes;
export type CarteCommande = {
  id: string;
  reference: string;
  etat: EtatCommande;
  client: string;
  telephone: string | null;
  articles: { nom: string; quantite: number; options: string[] }[];
  mode: "retrait" | "livraison";
  adresse: string | null;
  message: string | null;
  total: string | null;
  paiement?: "attente" | "paye" | "a_regulariser";
  frais?: number | null; // frais de livraison (FCFA), compris dans le total
  zone?: string | null;
  echeance?: number | null; // paiement immédiat : fin de la réservation du stock (ms)
  quand: string;
};
const fcfa = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: espace.ouidah.fuseau });
type Filtre = "tous" | EtatCommande;
const FILTRES: Filtre[] = ["tous", "a_confirmer", "a_preparer", "prete", "remise", "annulee"];
const GLISSE = [0.625, 0.05, 0, 1] as const;

export function Commandes({ commandes, admin = false }: { commandes: CarteCommande[]; admin?: boolean }) {
  const reduit = useMouvementReduit();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [occupe, setOccupe] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [, demarrer] = useTransition();
  const [annulation, setAnnulation] = useState<string | null>(null);
  const minuteur = useRef<number | undefined>(undefined);

  const nombre = (f: Filtre) => (f === "tous" ? commandes.length : commandes.filter((c) => c.etat === f).length);
  const vues = filtre === "tous" ? commandes : commandes.filter((c) => c.etat === filtre);
  const annoncer = (texte: string, erreur = false) => {
    setAnnonce({ texte, erreur });
    clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setAnnonce(null), 6000);
  };

  // actions de l'équipe : seulement les transitions permises par TRANSITIONS_COMMANDE (même table que la base)
  const pasDe = (etat: EtatCommande) => { const p = SUIVANT[etat]; return p && peutPasser(TRANSITIONS_COMMANDE, etat, p.vers) ? p : undefined; };
  const annulable = (etat: EtatCommande) => etat !== "annulee" && peutPasser(TRANSITIONS_COMMANDE, etat, "annulee");

  const avancer = (c: CarteCommande) => {
    const pas = pasDe(c.etat);
    if (!pas || occupe) return;
    setOccupe(c.id);
    demarrer(async () => {
      try {
        const r = await avancerCommande(c.id, c.etat);
        if ("ok" in r) annoncer(C.annonces[pas.vers](c.reference));
        else annoncer(C.erreurs[r.erreur], true);
      } catch {
        annoncer(C.erreurs.reseau, true);
      }
      setOccupe(null);
    });
  };

  const annuler = (c: CarteCommande, motif: string) => {
    if (occupe) return;
    setOccupe(c.id);
    demarrer(async () => {
      try {
        const r = await annulerCommande(c.id, c.etat, motif);
        if ("ok" in r) { annoncer(C.annulee(c.reference)); setAnnulation(null); }
        else annoncer(C.erreurs[r.erreur], true);
      } catch { annoncer(C.erreurs.reseau, true); }
      setOccupe(null);
    });
  };

  // lien de paiement en ligne (montant fixé par le serveur) : copié pour l'envoyer au client, sinon affiché en clair
  const copierLien = (c: CarteCommande) => {
    if (occupe) return;
    setOccupe(c.id);
    demarrer(async () => {
      try {
        const r = await lienPaiementCommande(c.id);
        if ("ok" in r) {
          const url = new URL(r.chemin, window.location.origin).href;
          const copie = await navigator.clipboard?.writeText(url).then(() => true, () => false);
          annoncer(copie ? C.lienCopie(c.reference) : C.lienACopier(c.reference, url));
        } else annoncer(C.erreurs[r.erreur] ?? C.erreurs.panne, true);
      } catch {
        annoncer(C.erreurs.reseau, true);
      }
      setOccupe(null);
    });
  };

  return (
    <div className="esp-terrain">
      <div className="filtres" role="group" aria-label={C.filtres}>
        {FILTRES.map((f) => (
          <button key={f} type="button" data-filtre={f} aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
            <b>{nombre(f)}</b>
            <span>{f === "tous" ? C.tous : C.etats[f]}</span>
          </button>
        ))}
      </div>
      {!commandes.length ? (
        <Vide texte={C.vide} />
      ) : !vues.length ? (
        <p className="meta">{C.filtreVide}</p>
      ) : (
        <ul className="commandes-liste" id="liste-commandes">
          <AnimatePresence initial={false}>
            {vues.map((c) => {
              const pas = pasDe(c.etat);
              return (
                <motion.li key={c.id} id={`commande-${c.id}`} className="commande" data-commande={c.reference} data-etat={c.etat} layout={reduit ? false : "position"} transition={{ layout: { duration: 0.5, ease: GLISSE } }}>
                  <div className="haut">
                    <span className="ref">{c.reference}</span>
                    <span key={c.etat} className="etat tampon" data-e={c.etat}>
                      {C.etats[c.etat]}
                    </span>
                  </div>
                  <p className="client">
                    <b>{c.client}</b>
                    {c.telephone && (
                      <>
                        {", "}
                        <a href={`tel:${c.telephone.replace(/[^\d+]/g, "")}`}>{c.telephone}</a>
                      </>
                    )}
                  </p>
                  <ul aria-label={C.articles(c.articles.reduce((t, a) => t + a.quantite, 0))}>
                    {c.articles.map((a, i) => (
                      <li key={i}>
                        {a.quantite} × {a.nom}
                        {a.options.length > 0 && <span className="meta"> ({C.options(a.options)})</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="meta">
                    <Picto nom={c.mode === "livraison" ? "voiture" : "sac"} /> {c.mode === "livraison" ? C.livraison : C.retrait}
                    {c.adresse && <>, {c.adresse}</>}
                  </p>
                  {c.message && (
                    <p className="meta">
                      {C.message} : {c.message}
                    </p>
                  )}
                  <p className="meta">
                    {c.total && <span className="total">{c.total}</span>} {c.quand}
                  </p>
                  {c.mode === "livraison" && c.frais != null && <p className="meta">{C.frais(c.zone ?? null, `${fcfa.format(c.frais)} ${espace.monnaie.fcfa}`)}</p>}
                  {c.paiement && <p className="meta">{C.paiement[c.paiement]}</p>}
                  {c.echeance != null && c.etat === "a_preparer" && c.paiement === "attente" && <p className="meta">{C.echeance(heure.format(c.echeance))}</p>}
                  {admin && c.etat === "a_confirmer" && c.total === null && <button type="button" className="bouton" disabled={occupe !== null} onClick={() => {
                    setOccupe(c.id);
                    demarrer(async () => {
                      try { const r = await chiffrerCommande(c.id); annoncer("ok" in r ? C.chiffres : C.erreurs[r.erreur], !("ok" in r)); }
                      catch { annoncer(C.erreurs.reseau, true); }
                      setOccupe(null);
                    });
                  }}>{C.chiffrer}</button>}
                  {(c.etat === "a_preparer" || c.etat === "prete") && c.paiement !== "paye" && <p><Link className="lien" href="/agents/agence">{C.saisirPaiement}</Link></p>}
                  {(c.etat === "a_preparer" || c.etat === "prete") && c.paiement === "attente" && c.total !== null && (
                    <button type="button" className="bouton" data-lien-paiement={c.reference} aria-busy={occupe === c.id} disabled={occupe !== null} onClick={() => copierLien(c)}>
                      {C.lienPaiement}
                    </button>
                  )}
                  {pas && (
                    <button type="button" className="bouton accent" data-avancer={pas.vers} aria-label={C.actionDe(C.actions[pas.vers], c.reference)} aria-busy={occupe === c.id} disabled={occupe === c.id} onClick={() => avancer(c)}>
                      <Picto nom="coche" />
                      {C.actions[pas.vers]}
                    </button>
                  )}
                  {annulable(c.etat) && (
                    <details open={annulation === c.id} onToggle={(e) => { if (!e.currentTarget.open && annulation === c.id) setAnnulation(null); }}>
                      <summary onClick={(e) => { e.preventDefault(); setAnnulation(annulation === c.id ? null : c.id); }}>{C.annuler}</summary>
                      <form onSubmit={(e) => { e.preventDefault(); annuler(c, String(new FormData(e.currentTarget).get("motif") ?? "")); }}>
                        <div className="champ"><label htmlFor={`annuler-${c.id}`}>{C.motifAnnulation}</label><input id={`annuler-${c.id}`} name="motif" minLength={3} maxLength={280} required /></div>
                        <p className="meta">{C.annulationAide}</p>
                        <button type="submit" className="bouton" disabled={occupe !== null}>{C.annuler}</button>
                      </form>
                    </details>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <p className="esp-annonce" role="status" aria-live="polite" data-ton={annonce?.erreur ? "erreur" : undefined}>
        {annonce?.texte ?? ""}
      </p>
    </div>
  );
}
