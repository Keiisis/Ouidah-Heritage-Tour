"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { pilotage as P, TYPES_DOCUMENT } from "@/content/espace-pilotage";
import { confirmerDepot, preparerDepot } from "@/lib/serveur/equipe/pilotage/actions";
import type { DossierDocuments } from "@/lib/serveur/equipe/pilotage/lectures";
import { estMime, TAILLE_MAX } from "@/lib/serveur/equipe/pilotage/regles";
import { type Etat, Retour, texteRefus } from "./Envoi";

// Dépôt d'un document client en trois temps : (1) le serveur vérifie le dossier, le type et la taille et donne une URL
// de dépôt signée ; (2) le navigateur envoie le fichier directement au stockage privé (une fonction Vercel refuse plus de
// 4,5 Mo) ; (3) le serveur relit le fichier déposé (type, taille, premiers octets), l'efface s'il ne correspond pas, sinon
// enregistre sa fiche. Les contrôles faits ici ne servent qu'à prévenir plus tôt : le serveur décide.
const D = P.documents;

export function Depot({ dossiers }: { dossiers: DossierDocuments[] }) {
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [occupe, demarrer] = useTransition();
  const refus = (texte: string, champs: string[] = []) => setEtat({ ton: "erreur", texte, champs });

  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fichier = fd.get("fichier");
    const dossier = String(fd.get("dossier") ?? ""), type = String(fd.get("type") ?? "");
    setEtat(null);
    setN((x) => x + 1);
    if (!(fichier instanceof File) || fichier.size === 0) return refus(P.erreurs.champs, ["fichier"]);
    if (!estMime(fichier.type)) return refus(P.erreurs.type, ["fichier"]);
    if (fichier.size > TAILLE_MAX) return refus(P.erreurs.taille, ["fichier"]);
    demarrer(async () => {
      try {
        const a = await preparerDepot({ dossier, type, mime: fichier.type, taille: fichier.size });
        if (!("ok" in a)) return setEtat({ ton: "erreur", ...texteRefus(a) });
        setEtat({ ton: "ok", texte: D.envoiEnCours, champs: [] });
        const r = await fetch(a.url ?? "", { method: "PUT", headers: { "content-type": fichier.type, "x-upsert": "false" }, body: fichier });
        if (!r.ok) return refus(r.status === 413 ? P.erreurs.taille : P.erreurs.fichier);
        const b = await confirmerDepot({ dossier, type, objet: a.objet, nom: fichier.name });
        if (!("ok" in b)) return setEtat({ ton: "erreur", ...texteRefus(b) });
        setEtat({ ton: "ok", texte: D.ok, champs: [] });
        form.current?.reset();
      } catch {
        refus(P.erreurs.reseau);
      }
    });
  };

  return (
    <form ref={form} className="fin-form" id="depot-document" onSubmit={envoyer} aria-label={D.depot} aria-describedby={`${uid}-r`} noValidate>
      <div className="champs">
        <div className="champ">
          <label htmlFor={`${uid}-d`}>{D.dossier}</label>
          <select id={`${uid}-d`} name="dossier" required>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom ? `${d.nom} · ${d.reference}` : d.reference}
              </option>
            ))}
          </select>
        </div>
        <div className="champ">
          <label htmlFor={`${uid}-t`}>{D.type}</label>
          <select id={`${uid}-t`} name="type" required>
            {TYPES_DOCUMENT.map((t) => (
              <option key={t} value={t}>
                {D.types[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="champ large">
          <label htmlFor={`${uid}-f`}>{D.fichier}</label>
          <input id={`${uid}-f`} name="fichier" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" aria-describedby={`${uid}-a`} />
          <span className="aide" id={`${uid}-a`}>
            {D.aide(TAILLE_MAX / 1_048_576)}
          </span>
        </div>
      </div>
      <div className="fin-pied">
        <button type="submit" className="bouton" aria-busy={occupe} disabled={occupe}>
          {D.deposer}
        </button>
      </div>
      <Retour etat={etat} n={n} id={`${uid}-r`} />
    </form>
  );
}
