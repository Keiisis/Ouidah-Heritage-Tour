"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useEffect, useMemo, useRef, useState } from "react";
import { introuvable as INTROUVABLE } from "@/content/introuvable";
import { useContenu } from "@/components/ui/ContenuSite";
import { ButtonPrimary } from "@/components/ui/Buttons";
import { Objet3D } from "@/components/ui/Objet3D";
import { Icon } from "@/components/ui/Icon";
import "./introuvable.css";

export type Cible = { titre: string; href: string; type: string; image: string | null };
export type Entree = { nom: string; type: string; href: string };

// Maquette A « La correction » : l'adresse demandée s'affiche en très grand sur l'aplat soleil, puis ses lettres se
// réarrangent en l'adresse publiée la plus proche (distance d'édition) : les lettres gardées glissent, celles en trop tombent,
// celles qui manquent montent en latérite. Le mot se replie après « / » et « - ». Mouvement : transform + opacity.
// Les lettres sont posées à la main dans un calque que React ne rend pas (enfants vides), d'où le travail dans les effets.

const sansAccent = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const dernier = (h: string) => h.replace(/\/+$/, "").split("/").pop() ?? "";
type Op = { op: "garde" | "remplace" | "retire" | "ajoute"; i: number; j: number };

function edition(a: string, b: string) {
  const m = a.length, n = b.length, D = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) D[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ops: Op[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && D[i][j] === D[i - 1][j - 1]) ops.unshift({ op: "garde", i: --i, j: --j });
    else if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + 1) ops.unshift({ op: "remplace", i: --i, j: --j });
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) ops.unshift({ op: "retire", i: --i, j: -1 });
    else ops.unshift({ op: "ajoute", i: -1, j: --j });
  }
  return { d: D[m][n], ops };
}

// proximité sur le dernier segment (la faute porte presque toujours dessus), départagée par le chemin entier
function plusProche(demande: string, cibles: Cible[]) {
  const mot = sansAccent(dernier(demande));
  let meilleur: (Cible & { score: number }) | null = null;
  for (const c of cibles) {
    const s = sansAccent(dernier(c.href));
    const score = edition(mot, s).d / Math.max(mot.length, s.length, 1) + edition(sansAccent(demande), sansAccent(c.href)).d / 1000;
    if (!meilleur || score < meilleur.score) meilleur = { ...c, score };
  }
  return meilleur && meilleur.score <= 0.55 ? meilleur : null;
}

// positions de chaque lettre dans un flux caché, à la largeur du calque (repli autorisé après « / » et « - »)
function positions(calque: HTMLElement, texte: string) {
  const m = document.createElement("div");
  m.className = "pi-mesure";
  for (const ch of texte) {
    const s = document.createElement("span");
    s.textContent = ch;
    m.append(s);
    if (ch === "/" || ch === "-") m.append(document.createElement("wbr"));
  }
  calque.append(m);
  const o = m.getBoundingClientRect();
  const xs = [...m.querySelectorAll("span")].map((s) => { const r = s.getBoundingClientRect(); return [r.left - o.left, r.top - o.top] as const; });
  m.remove();
  return { xs, h: o.height };
}

function poserEtCorriger(calque: HTMLElement, avant: string, apres: string | null, instant: boolean) {
  const t = Math.round(Math.max(52, Math.min(132, calque.clientWidth / 9.4)));
  calque.style.setProperty("--pi-taille", `${t}px`);
  calque.replaceChildren();
  const A = positions(calque, avant), B = apres ? positions(calque, apres) : A;
  calque.style.height = `${Math.ceil(Math.max(A.h, B.h))}px`;
  const lettres = [...avant].map((ch, i) => {
    const s = document.createElement("span");
    s.className = "pi-lettre";
    s.textContent = ch;
    s.style.transform = `translate(${A.xs[i][0]}px, ${A.xs[i][1]}px)`;
    calque.append(s);
    return s;
  });
  if (!apres) return;
  const at = (d: number) => (instant ? "0s" : `${d}s`);
  let retard = 0, k = 0;
  for (const o of edition(sansAccent(avant), sansAccent(apres)).ops) {
    if (o.op === "garde") {
      const s = lettres[o.i];
      s.style.transitionDelay = at(0.45 + k++ * 0.012);
      s.style.transform = `translate(${B.xs[o.j][0]}px, ${B.xs[o.j][1]}px)`;
    } else if (o.op !== "ajoute") {
      const s = lettres[o.i];
      s.style.transitionDelay = at(retard);
      s.style.transform += ` translateY(${t * 0.8}px) rotate(${o.i % 2 ? 16 : -14}deg)`;
      s.classList.add("is-part");
      retard += 0.05;
    }
    if (o.op === "ajoute" || o.op === "remplace") {
      const s = document.createElement("span");
      s.className = "pi-lettre is-ajout is-part";
      s.textContent = apres[o.j];
      s.style.transform = `translate(${B.xs[o.j][0]}px, ${B.xs[o.j][1] - t * 0.6}px)`;
      calque.append(s);
      const x = B.xs[o.j];
      requestAnimationFrame(() => requestAnimationFrame(() => {
        s.style.transitionDelay = at(0.95 + o.j * 0.022);
        s.style.transform = `translate(${x[0]}px, ${x[1]}px)`;
        s.classList.remove("is-part");
      }));
    }
  }
}

export function Introuvable({ cibles, index }: { cibles: Cible[]; index: Entree[] }) {
  const T = useContenu("introuvable.introuvable", INTROUVABLE);
  const calque = useRef<HTMLDivElement>(null);
  const [cible, setCible] = useState<(Cible & { score: number }) | null>(null);
  const [lue, setLue] = useState(false); // adresse lue (le rendu serveur ne la connaît pas)
  const [vue, setVue] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const el = calque.current;
    if (!el) return;
    const demande = decodeURIComponent(location.pathname).toLowerCase();
    const c = plusProche(demande, cibles);
    const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let minuterie = 0, large = innerWidth;
    let annule = false;
    void document.fonts.ready.then(() => {
      if (annule) return;
      setCible(c);
      setLue(true);
      poserEtCorriger(el, demande, null, true);
      minuterie = window.setTimeout(() => {
        poserEtCorriger(el, demande, c?.href ?? null, calme);
        window.setTimeout(() => setVue(true), calme ? 0 : 1700);
      }, calme ? 0 : 700);
    });
    const redimension = () => {
      if (Math.abs(innerWidth - large) < 40) return;
      large = innerWidth;
      poserEtCorriger(el, demande, c?.href ?? null, true);
    };
    addEventListener("resize", redimension);
    return () => { annule = true; clearTimeout(minuterie); removeEventListener("resize", redimension); };
  }, [cibles]);

  const resultats = useMemo(() => {
    const v = sansAccent(q.trim());
    if (v.length < 2) return null;
    const mots = v.split(/\s+/);
    return index.filter((x) => { const cle = sansAccent(`${x.nom} ${x.type}`); return mots.every((m) => cle.includes(m)); }).slice(0, 6);
  }, [q, index]);

  return (
    <div className="pi">
      <section className="pi-scene">
        <div className="pi-conteneur">
          <div ref={calque} className="pi-mot" aria-hidden="true" />
          <div className="pi-dit">
            <div>
              <h1>{T.titre}</h1>
              <p>{lue && !cible ? T.chapoSansProposition : T.chapo}</p>
            </div>
            {cible && (
              <div className={`pi-proposition ${vue ? "is-vue" : ""}`} aria-live="polite">
                {cible.image && <Image src={cible.image} alt="" width={80} height={80} sizes="80px" />}
                <span>
                  <span className="pi-quoi">{T.proposition(cible.type)}</span>
                  <span className="pi-titre">{cible.titre}</span>
                </span>
                <ButtonPrimary href={cible.href}>{T.yAller}</ButtonPrimary>
              </div>
            )}
          </div>
          <div className="pi-chercher">
            <label className="pi-champ">
              <Icon name="search" className="size-5" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" placeholder={T.recherche.placeholder} aria-label={T.recherche.label} aria-controls={resultats ? "pi-resultats" : undefined} />
            </label>
            {resultats && (
              <ul className="pi-resultats" id="pi-resultats">
                {resultats.length ? resultats.map((x) => (
                  <li key={`${x.href}-${x.nom}`}><Link href={x.href}><span className="pi-nom">{x.nom}</span><span className="pi-type">{x.type}</span></Link></li>
                )) : (
                  <li><Link href="/devis?demande=question"><span className="pi-nom">{T.recherche.rien}</span><span className="pi-type">{T.recherche.nousEcrire}</span></Link></li>
                )}
              </ul>
            )}
          </div>
        </div>
      </section>
      <div className="pi-suite">
        <ul className="pi-conteneur pi-chemins" aria-label={T.cheminsLabel}>
          {T.chemins.map((c) => (
            <li key={c.href}>
              <Link href={c.href}>
                <Objet3D nom={c.objet} taille={72} />
                <span><span className="pi-nom">{c.nom}</span><span className="pi-ou">{c.ou}</span></span>
                <span className="pi-fleche" aria-hidden="true"><Icon name="arrow-right" className="size-5" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
