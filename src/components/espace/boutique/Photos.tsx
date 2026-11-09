"use client";

import Image from "next/image";
import { useId, useRef, useState, useTransition } from "react";
import { boutiqueAdmin as B } from "@/content/espace-boutique";
import { contenu as C } from "@/content/espace-contenu";
import { altValide, IMAGE_MAX, MIMES_IMAGE } from "@/lib/contenu-regles";
import { finaliserImage, preparerImage } from "@/lib/serveur/contenu/actions";
import type { PhotoAdmin } from "@/lib/serveur/equipe/boutique/regles";

export function Photos({ photos, changer, occuper, maximum = 30 }: { photos: PhotoAdmin[]; changer: (p: PhotoAdmin[]) => void; occuper: (v: boolean) => void; maximum?: number }) {
  const id = useId();
  const fichier = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [message, setMessage] = useState<{ erreur: boolean; texte: string } | null>(null);
  const [occupe, demarrer] = useTransition();
  function envoyer() {
    const f = fichier.current?.files?.[0];
    setMessage(null);
    const erreur = !f ? C.erreurs.fichier : !(MIMES_IMAGE as readonly string[]).includes(f.type) ? C.erreurs.type : f.size > IMAGE_MAX || !f.size ? C.erreurs.taille : !altValide(alt) ? C.erreurs.alt : null;
    if (erreur || !f) return setMessage({ erreur: true, texte: erreur ?? C.erreurs.fichier });
    occuper(true);
    demarrer(async () => {
      try {
        const depot = await preparerImage(f.type, f.size);
        if (!("ok" in depot) || !depot.url || !depot.objet) return setMessage({ erreur: true, texte: "erreur" in depot ? C.erreurs[depot.erreur] ?? C.erreurs.panne : C.erreurs.panne });
        const r = await fetch(depot.url, { method: "PUT", headers: { "content-type": f.type, "x-upsert": "false" }, body: f });
        if (!r.ok) return setMessage({ erreur: true, texte: C.erreurs.stockage });
        const fin = await finaliserImage(depot.objet, alt);
        if (!("ok" in fin) || !fin.image) return setMessage({ erreur: true, texte: "erreur" in fin ? C.erreurs[fin.erreur] ?? C.erreurs.panne : C.erreurs.panne });
        changer([...photos, fin.image]);
        setAlt("");
        if (fichier.current) fichier.current.value = "";
        setMessage({ erreur: false, texte: B.imageAjoutee });
      } catch { setMessage({ erreur: true, texte: C.erreurs.reseau }); }
      finally { occuper(false); }
    });
  }
  function deplacer(index: number, sens: number) {
    const copie = [...photos];
    [copie[index], copie[index + sens]] = [copie[index + sens], copie[index]];
    changer(copie);
  }
  return <div className="bt-photos">
    {photos.length > 0 && <ol className="bt-photos-liste">
      {photos.map((p, i) => <li key={`${p.src}-${i}`}>
        <Image src={p.src} alt={p.alt} width={160} height={200} unoptimized className="bt-photo" />
        <div className="bt-photo-champs">
          <span className="aide">{i === 0 ? B.couverture : `${B.image} ${i + 1}`}</span>
          <div className="champ"><label htmlFor={`${id}-alt-${i}`}>{B.alt}</label><input id={`${id}-alt-${i}`} value={p.alt} maxLength={300} required onChange={(e) => changer(photos.map((a, n) => n === i ? { ...a, alt: e.target.value } : a))} /></div>
          <div className="fin-pied">
            {maximum > 1 && <><button type="button" className="bouton-2 bouton-petit" disabled={occupe || i === 0} onClick={() => deplacer(i, -1)} aria-label={`${B.monter} ${i + 1}`}>{B.monter}</button><button type="button" className="bouton-2 bouton-petit" disabled={occupe || i === photos.length - 1} onClick={() => deplacer(i, 1)} aria-label={`${B.descendre} ${i + 1}`}>{B.descendre}</button></>}
            <button type="button" className="bouton-2 bouton-petit" disabled={occupe} onClick={() => changer(photos.filter((_, n) => n !== i))} aria-label={`${B.retirerPhoto} ${i + 1}`}>{B.retirerPhoto}</button>
          </div>
        </div>
      </li>)}
    </ol>}
    {photos.length < maximum && <div className="bt-upload">
      <div className="champs">
        <div className="champ"><label htmlFor={`${id}-fichier`}>{B.fichier}</label><input id={`${id}-fichier`} ref={fichier} type="file" accept={MIMES_IMAGE.join(",")} disabled={occupe} aria-describedby={`${id}-note`} /><span id={`${id}-note`} className="aide">{B.fichierAide}</span></div>
        <div className="champ"><label htmlFor={`${id}-alt`}>{B.alt}</label><input id={`${id}-alt`} value={alt} maxLength={300} disabled={occupe} onChange={(e) => setAlt(e.target.value)} /></div>
      </div>
      <button type="button" className="bouton-2 bouton-petit" onClick={envoyer} disabled={occupe}>{occupe ? B.televersement : B.televerser}</button>
    </div>}
    {message && <p className="fin-retour" data-ton={message.erreur ? "erreur" : "ok"} role={message.erreur ? "alert" : "status"}>{message.texte}</p>}
  </div>;
}
