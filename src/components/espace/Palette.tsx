"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Role } from "@/content/equipe";
import { chemin, espace as T, SECTIONS } from "@/content/espace";
import { useMouvementReduit } from "@/lib/mouvement";
import { useEspace } from "./Cadre";
import { Picto } from "./Picto";
import { transversal as X } from "@/content/transversal";
import { rechercherEquipe, type ResultatRecherche } from "@/lib/serveur/equipe/pilotage/recherche";
import "./palette.css";

// Palette « Chercher ou aller à » : toutes les sections du rôle et la bascule du thème. Ctrl K (ou ⌘ K) et « / »
// l'ouvrent, « t » bascule le thème ; flèches, Entrée, Échap. Les résultats filtrés se replacent en FLIP (motion).
const OUVRIR = "esp:palette";
const simple = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function BoutonPalette() {
  return (
    <button type="button" className="chercher" aria-label={T.chercher} aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(OUVRIR))}>
      <Picto nom="recherche" />
      <span>{T.chercher}</span>
      <kbd>{T.raccourci}</kbd>
    </button>
  );
}

export function Palette({ role }: { role: Role }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [ouverte, setOuverte] = useState(false);
  const [recherche, setRecherche] = useState<{ q: string; lignes: ResultatRecherche[]; erreur?: boolean }>({ q: "", lignes: [] });
  const router = useRouter();
  const { theme, changer } = useEspace();
  const reduit = useMouvementReduit();
  const id = useId();
  const basculer = () => changer(theme === "sombre" ? "clair" : "sombre");

  const tout = [
    ...SECTIONS[role].map((x) => ({ cle: x.id, nom: x.nom, type: x.groupe, faire: () => router.push(chemin(role, x.id)) })),
    { cle: "theme", nom: theme === "sombre" ? T.theme.clair : T.theme.sombre, type: T.palette.action, faire: basculer },
  ];
  const vue = [...tout.filter((c) => !q.trim() || simple(`${c.nom} ${c.type}`).includes(simple(q.trim()))),
    ...(recherche.q === q ? recherche.lignes.map((c) => ({ ...c, faire: () => router.push(c.href) })) : [])];
  const choisi = Math.min(sel, Math.max(vue.length - 1, 0));

  useEffect(() => {
    if (!ouverte || q.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      rechercherEquipe(q, role).then((r) => {
        if (active) setRecherche({ q, lignes: "resultats" in r ? r.resultats : [], erreur: "erreur" in r });
      }).catch(() => { if (active) setRecherche({ q, lignes: [], erreur: true }); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [q, role, ouverte]);

  useEffect(() => {
    const ouvrir = () => {
      const d = ref.current;
      if (!d || d.open) return;
      setQ("");
      setSel(0);
      setRecherche({ q: "", lignes: [] });
      setOuverte(true);
      d.showModal();
    };
    const touche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ouvrir();
        return;
      }
      const saisie = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "") || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (saisie || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.key === "/") {
        e.preventDefault();
        ouvrir();
      } else if (e.key === "t") basculer();
    };
    window.addEventListener(OUVRIR, ouvrir);
    window.addEventListener("keydown", touche);
    return () => {
      window.removeEventListener(OUVRIR, ouvrir);
      window.removeEventListener("keydown", touche);
    };
  });

  const executer = (i: number) => {
    const c = vue[i];
    if (!c) return;
    ref.current?.close();
    c.faire();
  };

  return (
    <dialog ref={ref} className="esp-palette" aria-labelledby={`${id}-titre`} onClose={() => { setOuverte(false); setRecherche({ q: "", lignes: [] }); }} onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <h2 className="invisible" id={`${id}-titre`}>
        {T.palette.titre}
      </h2>
      <div className="palette-champ">
        <Picto nom="recherche" />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={vue.length ? `${id}-${choisi}` : undefined}
          aria-label={T.palette.titre}
          placeholder={T.palette.place}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = Math.max(vue.length, 1);
              setSel((choisi + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            } else if (e.key === "Enter") {
              e.preventDefault();
              executer(choisi);
            }
          }}
        />
      </div>
      {q.trim().length >= 2 && <p className="aide" role="status">{recherche.q !== q ? X.recherche.attente : recherche.erreur ? X.recherche.panne : ""}</p>}
      <ul id={`${id}-liste`} role="listbox" aria-label={T.palette.titre} data-lenis-prevent>
        {vue.length ? (
          vue.map((c, i) => (
            <motion.li layout={reduit ? false : "position"} key={c.cle} id={`${id}-${i}`} role="option" aria-selected={i === choisi} onClick={() => executer(i)} onMouseMove={() => i !== choisi && setSel(i)}>
              {c.nom}
              <small>{c.type}</small>
            </motion.li>
          ))
        ) : (
          <li className="rien" role="option" aria-selected="false" aria-disabled="true">
            {T.palette.rien}
          </li>
        )}
      </ul>
    </dialog>
  );
}
