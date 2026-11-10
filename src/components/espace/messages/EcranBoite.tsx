import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { msg } from "@/content/espace-messages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireBoite } from "@/lib/serveur/equipe/messages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Conversations } from "../assistant/Conversations";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { ilYa } from "../outils";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { transversal as X } from "@/content/transversal";
import { configurationImap, lireCourrielsRecus } from "@/lib/serveur/equipe/messages/imap";
import { lireTaches } from "@/lib/serveur/equipe/pilotage/taches";
import { lire } from "@/lib/serveur/equipe/finances/lectures";
import { ReglageTache } from "../pilotage/ReglageTache";
import { Reception, ReleverBoite } from "./Reception";
import "./messages.css";

// Boîte de réception (lot L6), rendue sous <Suspense> : source 1, les questions posées sur le site (table demandes) —
// l'agent ne voit que celles de ses dossiers, l'admin toutes. « Répondre » ouvre le composeur sur la fiche du client avec
// le modèle « Réponse à une demande » ; sans fiche, sur l'adresse du message (?a=, mode « Une adresse »). Source 2 :
// courriels IMAP importés, rattachés au dossier courant, avec le même « Répondre » vers l'adresse de l'expéditeur.
export async function EcranBoite({ role }: { role: Role }) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const messages = await lireBoite(s);
  const [courriels, reglages, dossiers] = await Promise.all([lireCourrielsRecus(s), s.role === "admin" ? lireTaches() : null, s.role === "admin" ? lire<{ id: string; nom: string }>("demandes?select=id,nom&statut=eq.envoyee&order=cree_le.desc&limit=500") : null]);
  const config = s.role === "admin" ? configurationImap() : null;
  const releve = config ? await lire<{ releve_le: string | null; erreur: boolean }>(`imap_releves?select=releve_le,erreur&boite=eq.${config.boite}`) : null;
  const B = msg.boite;
  const minute = minuteServeur();
  return (
    <Enveloppe role={role} session={s} actif="boite" minute={minute}>
      <Tete titre={B.titre} sous={B.sous[role]} />
      <div className="esp-grille esp-messages esp-boite">
        <Bloc id="t-boi" titre={B.site} compte={messages?.length ?? null} s={8} i={1}>
          {!messages ? (
            <Vide texte={[T.vides.indisponible, ""]} />
          ) : messages.length ? (
            <ul className="liste" id="liste-messages">
              {messages.map((m) => (
                <li key={m.id} data-message={m.id}>
                  <article className="message">
                    <div className="tete">
                      <span className="titre">{m.nom}</span>
                      <span className="langue" title={T.langues[m.langue]}>{m.langue}</span>
                      <span className="meta">{ilYa(m.recu, minute)}</span>
                    </div>
                    <span className="meta">{m.email} · {m.agent ? B.attribue(m.agent) : B.nonAttribue}</span>
                    {m.texte && <blockquote>{m.texte}</blockquote>}
                    <div className="groupe-outils">
                      {m.clientId ? (
                        <Link className="bouton-2 bouton-petit" href={`/${role}/courrier?client=${m.clientId}&modele=reponse`} data-repondre={m.id}>
                          <Picto nom="courrier" />
                          {B.repondre}
                        </Link>
                      ) : m.email ? (
                        <Link className="bouton-2 bouton-petit" href={`/${role}/courrier?a=${encodeURIComponent(m.email)}`} data-repondre={m.id}>
                          <Picto nom="courrier" />
                          {B.repondre}
                        </Link>
                      ) : (
                        <span className="aide">{B.sansFiche}</span>
                      )}
                      <Link className="lien" href={`/${role}/demandes/${m.id}`}>
                        {B.voirDossier}
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <Vide texte={B.vide[role]} />
          )}
        </Bloc>
        <Bloc id="t-imap" titre={X.imap.titre} s={12} i={2}>
          {s.role === "admin" && <>
            {!config && <p className="mention">{X.imap.sansConfig}</p>}
            {releve?.[0]?.releve_le && <p className="aide">{X.imap.dernier} : {ilYa(releve[0].releve_le, minute)}</p>}
            {releve?.[0]?.erreur && <p role="status">{X.imap.erreur}</p>}
            <ReleverBoite configure={Boolean(config)} />
            {reglages && <ReglageTache nom="imap_actif" actif={reglages.imap_actif} libelle={X.imap.auto} />}
          </>}
          {courriels ? <Reception messages={courriels} role={role} dossiers={dossiers} /> : <Vide texte={[T.vides.indisponible, ""]} />}
        </Bloc>
        <Conversations role={role} minute={minute} />
      </div>
    </Enveloppe>
  );
}
