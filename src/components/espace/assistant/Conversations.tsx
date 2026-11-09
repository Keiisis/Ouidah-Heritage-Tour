import Link from "next/link";
import { assistantEquipe, LIMITES } from "@/content/assistant";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { lireConversationsEquipe } from "@/lib/serveur/assistant/conversations";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { Bloc, Vide } from "../Bloc";
import { ilYa } from "../outils";
import { Repondre } from "./Repondre";

// Conversations du site passées à un agent, et conversations que l'assistant a transmises (résumé) : derniers messages,
// coordonnées laissées avec l'accord du visiteur, réponse et transformation en demande (passées à un agent seulement : une
// conversation transmise se traite par les coordonnées de son résumé). Droit « Demandes » exigé côté serveur ; un agent
// ne voit que les conversations libres et les siennes, l'admin toutes. Données réelles seulement.
const B = assistantEquipe.boite;

export async function Conversations({ role, minute }: { role: Role; minute: number }) {
  const s = await exigerDroit("demandes", role);
  const liste = s ? await lireConversationsEquipe(s) : null;
  return (
    <Bloc id="t-conv" titre={B.titre} compte={liste?.length ?? null} s={12} i={3}>
      {!s ? (
        <Vide texte={B.refus} />
      ) : !liste ? (
        <Vide texte={[T.vides.indisponible, ""]} />
      ) : liste.length ? (
        <ul className="liste" id="liste-conversations">
          {liste.map((c) => {
            const agent = c.mode === "agent";
            const direct = Date.parse(c.vu_le) >= minute * 60_000 - LIMITES.absentMinutes * 60_000;
            const contact = [c.contact_email, c.contact_whatsapp].filter(Boolean).join(" · ");
            return (
              <li key={c.id} data-conversation={c.id} data-transmise={c.transmise_le ? "" : undefined}>
                <article className="message">
                  <div className="tete">
                    <span className="titre">{c.contact_nom ?? B.auteurs.visiteur}</span>
                    <span className="langue" title={T.langues[c.langue]}>
                      {c.langue}
                    </span>
                    <span className="meta">{ilYa(c.passage_le ?? c.transmise_le ?? c.cree_le, minute)}</span>
                  </div>
                  {c.transmise_le && <span className="meta">{B.transmise}</span>}
                  {agent && (
                    <span className="meta" data-etat={direct ? "direct" : "absent"}>
                      {direct ? B.enDirect : B.horsLigne} · {c.agent ? B.prise(`${c.agent.prenom} ${c.agent.nom}`) : B.libre}
                    </span>
                  )}
                  {(agent || contact) && <span className="meta">{contact ? `${B.contact} : ${contact}` : B.sansContact}</span>}
                  {c.resume && (
                    <blockquote>
                      {c.resume.split("\n").map((l, i) => (
                        <p key={i}>{l}</p>
                      ))}
                    </blockquote>
                  )}
                  {c.plus > 0 && <span className="aide">{B.plus(c.plus)}</span>}
                  {c.messages.length > 0 && (
                    <ol className="liste" aria-label={B.titre}>
                      {c.messages.map((m) => (
                        <li key={m.id} data-auteur={m.auteur}>
                          <span className="meta">
                            {B.auteurs[m.auteur]}
                            {m.agent ? ` · ${m.agent.prenom}` : ""} · {ilYa(m.cree_le, minute)}
                          </span>
                          <p>{m.texte}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="groupe-outils">
                    {c.contact_whatsapp && (
                      <a className="lien" href={`https://wa.me/${c.contact_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                        {B.whatsapp}
                      </a>
                    )}
                    {c.demande_id && (
                      <Link className="lien" href={`/${role}/demandes/${c.demande_id}`}>
                        {B.voirDemande}
                      </Link>
                    )}
                  </div>
                  {agent && <Repondre id={c.id} transformable={!c.demande_id && Boolean(c.contact_nom && c.contact_email)} />}
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vide texte={B.vide} />
      )}
    </Bloc>
  );
}
