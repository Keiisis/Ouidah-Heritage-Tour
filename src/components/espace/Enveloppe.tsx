import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/content/equipe";
import { chemin, espace as T, GROUPES, logos, section } from "@/content/espace";
import { droitsEffectifs } from "@/lib/serveur/equipe/securite/droits";
import type { Session } from "@/lib/serveur/equipe/session";
import { BasculeTheme, Cadre } from "./Cadre";
import { Deconnexion, NavCadre, NavSoleil } from "./NavClient";
import { Palette } from "./Palette";
import { Picto } from "./Picto";
import "./enveloppe.css";

// Enveloppe de l'espace connecté (maquette E) : navigation latérale navy groupée, la petite course du soleil en tête,
// le pied (thème, déconnexion, qui est connecté), la barre du bas en 390, la palette Ctrl K. Composant serveur rendu
// sous <Suspense> par l'entrée ou la section, une fois la session lue : `minute` est l'heure de cette requête.
export function Enveloppe({ role, session, actif, minute, children }: { role: Role; session: Session; actif: string; minute: number; children: ReactNode }) {
  const courant = (id: string) => (id === actif ? ("page" as const) : undefined);
  const initiales = `${session.prenom[0] ?? ""}${session.nom[0] ?? ""}`.toUpperCase();
  // « Blog » et « Articles de la boutique » n'apparaissent dans le menu d'un agent qu'avec le droit « site » ou « boutique »
  // (la page le revérifie : SansDroit sinon)
  const masquee = (id: string) => role === "agents" && session.role !== "admin" && ((id === "blog" && !droitsEffectifs(session.droits).site) || (id === "boutique" && !droitsEffectifs(session.droits).boutique));
  return (
    <Cadre role={role} theme={session.theme === "sombre" ? "sombre" : "clair"} minute={minute}>
      <NavCadre
        bas={T.bas[role].map(([id, court]) => {
          const x = section(role, id);
          return x ? (
            <Link key={id} href={chemin(role, id)} className="bas" aria-current={courant(id)}>
              <Picto nom={x.picto} />
              <span>{court}</span>
            </Link>
          ) : null;
        })}
      >
        <Image className="esp-nav-logo" src={logos.navigation.src} alt={logos.navigation.alt} width={logos.navigation.largeur} height={logos.navigation.hauteur} sizes="120px" priority />
        <NavSoleil />
        <div className="esp-groupes" id="esp-groupes" data-lenis-prevent>
          {GROUPES[role].map((g) => (
            <details key={g.groupe} className="esp-groupe" open={g.sections.some((x) => x.id === actif) || undefined}>
              <summary>
                <span>{g.groupe}</span>
                <Picto nom="chevron" className="ic chev" />
              </summary>
              <ul>
                {g.sections.filter((x) => !masquee(x.id)).map((x) => (
                  <li key={x.id}>
                    <Link href={chemin(role, x.id)} aria-current={courant(x.id)}>
                      <Picto nom={x.picto} />
                      <span>{x.nom}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
        <div className="esp-nav-pied">
          <BasculeTheme libelle />
          <Deconnexion role={role} />
          <div className="moi">
            <span className="avatar" aria-hidden="true">
              {initiales}
            </span>
            <span>
              {session.prenom} {session.nom}
              <small>{T.role[session.role]}</small>
            </span>
          </div>
        </div>
      </NavCadre>
      {/* zone de travail : un <div>, car le layout racine pose déjà l'unique <main id="contenu"> de la page (deux <main>
          visibles sont interdits par HTML et brouillent les lecteurs d'écran) */}
      <div className="esp-principal" data-session={session.role}>
        {children}
      </div>
      <Palette role={role} />
    </Cadre>
  );
}
