"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useEffect, useRef, useState } from "react";
import { adresseAgence, conciergerie as CONCIERGERIE, equipe as EQUIPE, nav as NAV, SECTIONS } from "@/content/fr";
import { useContenu, useLangue } from "@/components/ui/ContenuSite";
import { ChoisirLangue } from "@/components/ui/ChoisirLangue";
import { useDevise } from "@/lib/devise";
import { compterDossier, useDossier } from "@/lib/voyage";
import { Icon } from "@/components/ui/Icon";

// Section 1 — barre de navigation : logo à gauche, 6 entrées (Ouidah et L'agence ouvrent un menu, même plan que le pied
// de page), devise, langue, un bouton jaune ; dégradé marine en haut de page, verre dépoli après 20 px de défilement.
// Menu mobile en <dialog> natif (piège du focus et touche Échap fournis par le navigateur).
// blog : vrai quand au moins un article est publié ; sinon pas de lien.
export function Header({ blog }: { blog: boolean }) {
  const nav = useContenu("fr.nav", NAV);
  const langue = useLangue();
  const equipe = useContenu("fr.equipe", EQUIPE);
  const conciergerie = useContenu("fr.conciergerie", CONCIERGERIE);
  const primary = nav.primary.filter((l) => blog || !l.blog).map((l) => ({
    ...l, sous: l.sous?.map((s) => ({ ...s, href: s.href === SECTIONS.agence || s.href === "/a-propos" ? adresseAgence(equipe) : s.href })),
  }));
  const [defile, setDefile] = useState(false);
  const [devise, setDevise, devises] = useDevise();
  const [menu, setMenu] = useState<string | null>(null);
  const tiroir = useRef<HTMLDialogElement>(null);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  // menu ouvert par le survol : le clic qui suit le garde ouvert (sinon survol puis clic le refermait aussitôt)
  const parSurvol = useRef(false);
  const barre = useRef<HTMLElement>(null);
  // « Votre voyage · N » dès qu'un élément est composé sur l'accueil (dates, lieux, services), sinon « Créer mon voyage »
  const dossier = useDossier();
  const n = dossier ? compterDossier(dossier, conciergerie) : 0;
  const livre = n ? nav.voyage(n) : nav.book.label;

  // menu déroulant : se ferme à Échap (le focus revient sur son bouton) et au clic ailleurs
  useEffect(() => {
    if (!menu) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      document.getElementById(`menu-${menu}-bouton`)?.focus();
      setMenu(null);
    };
    const dehors = (e: PointerEvent) => {
      if (!barre.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("keydown", echap);
    document.addEventListener("pointerdown", dehors);
    return () => {
      document.removeEventListener("keydown", echap);
      document.removeEventListener("pointerdown", dehors);
    };
  }, [menu]);

  useEffect(() => {
    const surDefilement = () => setDefile(window.scrollY > 20);
    surDefilement();
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  const fermer = () => tiroir.current?.close();
  const bascule = (long: boolean, padding: string) => (
    <div className={`flex items-center rounded-lg border border-white/20 bg-white/10 p-0.5 text-xs font-semibold`}>
      {devises.map((c) => (
        <button
          key={c.code}
          type="button"
          aria-pressed={devise === c.code}
          onClick={() => setDevise(c.code)}
          className={`${padding} relative rounded-md transition-colors before:absolute before:inset-x-0 before:-inset-y-2.5 ${devise === c.code ? "bg-sun text-abyss" : "text-white/80 hover:text-white"}`}
        >
          {long ? c.long : c.short}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <header
        data-navigation
        className={`fixed top-0 right-0 left-0 z-50 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${
          defile ? "border-b border-white/10 bg-abyss/90 py-3 shadow-[0_1px_0_rgb(0_0_0/0.06)] backdrop-blur-[16px]" : "bg-gradient-to-b from-abyss/90 via-abyss/40 to-transparent py-4"
        } [@media(max-height:480px)]:py-1`}
      >
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
          {/* paysage bas (téléphone couché) : barre ramenée à 52 px au lieu de 73 */}
          <div className="flex h-12 items-center justify-between gap-8 [@media(max-height:480px)]:h-11">
            <Link href="/" aria-label={nav.home} className="group flex shrink-0 items-center gap-3 focus-visible:outline-sun">
              {/* emblème rond original sur pastille blanche + nom (la patronne, via Kevin le 10/11 : la bannière « OUIDAH » le dénaturait) */}
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white transition-transform group-hover:scale-[1.04] sm:size-11 lg:size-12">
                <Image src={nav.embleme.src} alt="" width={48} height={48} priority className="size-[34px] sm:size-[38px] lg:size-[42px]" />
              </span>
              <span className="font-display text-2xl/none font-semibold tracking-tight text-white">
                {nav.wordmark[0]}
                <span className="mt-1 block text-[13px]/none text-sun sm:mt-0 sm:inline sm:text-2xl/none"> {nav.wordmark[1]}</span>
              </span>
            </Link>

            <nav ref={barre} className="hidden shrink-0 items-center gap-7 text-[15px] font-medium text-white/90 min-[1360px]:flex">
              {primary.map((l) => {
                if (!l.sous) {
                  return (
                    <Link key={l.href} href={l.href} className="relative py-1 whitespace-nowrap transition-colors hover:text-sun focus-visible:rounded focus-visible:outline-sun">
                      {l.label}
                    </Link>
                  );
                }
                const id = l.href.replace(/\W+/g, "");
                const ouvert = menu === id;
                return (
                  <div
                    key={l.href}
                    className="relative"
                    onMouseEnter={() => {
                      parSurvol.current = true;
                      setMenu(id);
                    }}
                    onMouseLeave={() => {
                      parSurvol.current = false;
                      setMenu(null);
                    }}
                    // le focus quitte le menu (Tab) : il se ferme
                    onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setMenu((m) => (m === id ? null : m))}
                  >
                    <button
                      id={`menu-${id}-bouton`}
                      type="button"
                      aria-expanded={ouvert}
                      aria-controls={`menu-${id}`}
                      aria-label={nav.sousLabel(l.label)}
                      onClick={() => {
                        setMenu(ouvert && !parSurvol.current ? null : id);
                        parSurvol.current = false;
                      }}
                      className={`inline-flex items-center gap-1 py-1 whitespace-nowrap transition-colors hover:text-sun focus-visible:rounded focus-visible:outline-sun ${ouvert ? "text-sun" : ""}`}
                    >
                      {l.label}
                      <Icon name="chevron-right" className={`size-3.5 transition-transform duration-300 ${ouvert ? "-rotate-90" : "rotate-90"}`} />
                    </button>
                    <div id={`menu-${id}`} hidden={!ouvert} className="absolute top-full left-1/2 -translate-x-1/2 pt-3">
                      <ul className="min-w-56 rounded-2xl border border-white/15 bg-abyss/95 p-2 shadow-[0_24px_48px_-20px_rgba(0,0,0,.7)] backdrop-blur-[16px]">
                        {l.sous.map((s) => (
                          <li key={s.href + s.label}>
                            <Link href={s.href} onClick={() => setMenu(null)} className="flex min-h-10 items-center rounded-xl px-3 text-[14px] whitespace-nowrap text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-sun">
                              {s.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden sm:flex">{bascule(false, "px-2.5 py-1")}</div>

              <details className="relative hidden md:block">
                <summary
                  aria-label={nav.languageLabel}
                  className="relative inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors before:absolute before:inset-x-0 before:-inset-y-2 hover:border-white/40 hover:text-white focus-visible:outline-sun"
                >
                  <Icon name="globe" className="size-3.5 text-sun" />
                  <span>{langue}</span>
                </summary>
                <ul className="absolute right-0 mt-2 w-48 rounded-lg border border-white/20 bg-abyss/95 py-2 text-white backdrop-blur-[16px]">
                  {nav.languages.map((l) => (
                    <li key={l.code}>
                      <ChoisirLangue code={l.code} className={`flex min-h-11 items-center px-4 text-sm ${l.code === langue ? "text-sun" : "text-white/70"}`}>{l.label}</ChoisirLangue>
                    </li>
                  ))}
                </ul>
              </details>

              <Link
                href={nav.book.href}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-sun px-5 py-2.5 text-sm font-bold tracking-tight whitespace-nowrap text-abyss shadow-sm transition-[background-color,box-shadow,transform] duration-200 hover:bg-sun-deep hover:shadow-md focus-visible:outline-sun active:scale-[0.98]"
              >
                {livre}
              </Link>

              <button
                type="button"
                onClick={() => {
                  tiroir.current?.showModal();
                  setTiroirOuvert(true);
                }}
                aria-label={nav.open}
                aria-haspopup="dialog"
                aria-expanded={tiroirOuvert}
                aria-controls="site-menu"
                className="relative rounded-lg p-2 text-white/90 transition-colors before:absolute before:-inset-0.5 hover:bg-white/10 hover:text-white focus-visible:outline-sun min-[1360px]:hidden"
              >
                <Icon name="menu" className="size-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <dialog
        id="site-menu"
        ref={tiroir}
        onClose={() => setTiroirOuvert(false)}
        aria-label={nav.drawerLabel}
        // Tab et Maj+Tab tournent dans le tiroir : le focus n'en sort pas tant qu'il est ouvert
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const cibles = [...e.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")].filter((x) => x.getClientRects().length);
          const [premier, dernier] = [cibles[0], cibles.at(-1)];
          const actif = document.activeElement;
          if (e.shiftKey ? actif === premier || actif === e.currentTarget : actif === dernier) {
            e.preventDefault();
            (e.shiftKey ? dernier : premier)?.focus();
          }
        }}
        data-lenis-prevent
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-abyss/95 text-white backdrop-blur-xl min-[1360px]:hidden"
      >
        <div className="flex min-h-full flex-col justify-between overflow-y-auto px-6 pt-24 pb-8">
          <button type="button" onClick={fermer} aria-label={nav.close} className="absolute top-4 right-4 rounded-lg p-2 text-white/90 before:absolute before:-inset-0.5 hover:bg-white/10 hover:text-white focus-visible:outline-sun sm:right-6">
            <Icon name="close" className="size-6" />
          </button>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-sun">{nav.drawerLabel}</p>
            <div className="flex flex-col space-y-3">
              {primary.map((l) =>
                l.sous ? (
                  <div key={l.href} className="border-b border-white/10 pb-2">
                    <p className="py-2 text-lg font-medium text-white">{l.label}</p>
                    <ul className="space-y-1 pl-3">
                      {l.sous.map((s) => (
                        <li key={s.href + s.label}>
                          <Link href={s.href} onClick={fermer} className="flex min-h-10 items-center justify-between text-[15px] text-white/75 hover:text-sun">
                            <span>{s.label}</span>
                            <Icon name="chevron-right" className="size-4 text-white/30" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Link key={l.href} href={l.href} onClick={fermer} className="flex items-center justify-between border-b border-white/10 py-2 text-lg font-medium text-white hover:text-sun">
                    <span>{l.label}</span>
                    <Icon name="chevron-right" className="size-4 text-white/40" />
                  </Link>
                ),
              )}
            </div>
          </div>

          <div className="mt-8 space-y-4 border-t border-white/10 pt-6">
            <div className="flex flex-wrap gap-1" aria-label={nav.languageLabel}>
              {nav.languages.map((l) => <ChoisirLangue key={l.code} code={l.code} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm ${l.code === langue ? "bg-white/16 text-sun" : "text-white/80"}`}>{l.code}</ChoisirLangue>)}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-white/70">{nav.currencyLabel}</span>
              {bascule(true, "px-3 py-1")}
            </div>
            <Link href={nav.contact.href} onClick={fermer} className="flex w-full items-center justify-center gap-2 rounded-full border border-white/30 py-3 font-medium text-white hover:bg-white/10">
              <Icon name="phone" className="size-4 text-sun" />
              <span>{nav.contact.label}</span>
            </Link>
            <Link href={nav.book.href} onClick={fermer} className="block w-full rounded-full bg-sun py-3.5 text-center font-bold text-abyss shadow-lg">
              {livre}
            </Link>
            <p className="pt-2 text-center text-xs text-white/50">{nav.drawerNote}</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
