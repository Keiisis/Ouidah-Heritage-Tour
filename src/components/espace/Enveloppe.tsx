import Image from "next/image";
import type { ReactNode } from "react";
import type { Role } from "@/content/equipe";
import { chemin, espace as T, GROUPES, logos, section } from "@/content/espace";
import { droitsEffectifs } from "@/lib/serveur/equipe/securite/droits";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerRole, type Session } from "@/lib/serveur/equipe/session";
import { BasculeTheme, Cadre } from "./Cadre";
import { Deconnexion, GroupeNav, LienSection, NavCadre, NavSoleil } from "./NavClient";
import { Palette } from "./Palette";
import { Picto } from "./Picto";
import "./enveloppe.css";

// Coque de l'espace connecté (maquette E) : navigation latérale navy groupée, la petite course du soleil en tête,
// le pied (thème, déconnexion, qui est connecté), la barre du bas en 390, la palette Ctrl K. Rendue par le layout de
// /admins et /agents (sous <Suspense>, session lue à la requête) : elle reste en place d'une section à l'autre, seule la
// zone de travail change (Kevin, 10/11 : plus d'impression de rechargement). Section courante lue dans l'adresse
// (LienSection, GroupeNav). Sans session : la page seule (écran de connexion G).
export async function Coque({ role, children }: { role: Role; children: ReactNode }) {
  const session = await exigerRole(role);
  if (!session) return children;
  return <CoqueSession role={role} session={session} minute={minuteServeur()}>{children}</CoqueSession>;
}

// Écrans de section : la coque vient du layout ; Enveloppe ne fait que passer la zone de travail (ses props restent celles
// des 47 écrans qui l'appellent : rôle, session et section courante sont relus par la coque).
export function Enveloppe({ children }: { role: Role; session: Session; actif: string; minute: number; children: ReactNode }) {
  return children;
}

function CoqueSession({ role, session, minute, children }: { role: Role; session: Session; minute: number; children: ReactNode }) {
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
            <LienSection key={id} href={chemin(role, id)} racine={id === "accueil"} className="bas">
              <Picto nom={x.picto} />
              <span>{court}</span>
            </LienSection>
          ) : null;
        })}
      >
        <Image className="esp-nav-logo" src={logos.navigation.src} alt={logos.navigation.alt} width={logos.navigation.largeur} height={logos.navigation.hauteur} sizes="120px" priority />
        <NavSoleil />
        <div className="esp-groupes" id="esp-groupes" data-lenis-prevent>
          {GROUPES[role].map((g) => (
            <GroupeNav key={g.groupe} adresses={g.sections.map((x) => chemin(role, x.id))}>
              <summary>
                <span>{g.groupe}</span>
                <Picto nom="chevron" className="ic chev" />
              </summary>
              <ul>
                {g.sections.filter((x) => !masquee(x.id)).map((x) => (
                  <li key={x.id}>
                    <LienSection href={chemin(role, x.id)} racine={x.id === "accueil"}>
                      <Picto nom={x.picto} />
                      <span>{x.nom}</span>
                    </LienSection>
                  </li>
                ))}
              </ul>
            </GroupeNav>
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
