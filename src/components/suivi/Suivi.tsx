import Link from "@/components/ui/LienPublic";
import QRCode from "qrcode";
import { DEVIS } from "@/content/fr";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import type { Dossier } from "@/lib/suivi";
import { ButtonPrimary, LinkLine } from "@/components/ui/Buttons";
import { Embarquement } from "./Embarquement";
import { payerCommande } from "@/app/(fr)/suivi/[jeton]/actions";
import { Papier } from "./Papier";
import { QrTicket } from "./QrTicket";
import { date, montant, recap, vueTicket } from "./format";
import "./suivi.css";

// Page de suivi d'une commande (portes A3, A4, A5, A7) : en haut, le ticket imprimé de la maquette validée (imprimante,
// papier qui sort par à-coups, statut, tampon OHT si payé, QR vers le document) ; dessous, des sections sobres sur blanc :
// billets d'entrée, récapitulatif, documents, devis, dossier lié, contact. Tout vient du dossier lu en base, dans la langue
// de la commande. Rendu serveur, lisible sans JavaScript (seuls le QR du ticket et l'animation dépendent du navigateur).
type Champ = { libelle: string; valeur: string | string[] | null; visible: boolean };
const plein = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";

function contacts(SOCIETE: Record<string, Champ>) {
  const e = SOCIETE.email, t = SOCIETE.telephones;
  return {
    email: e?.visible && plein(e.valeur) ? e.valeur.trim() : null,
    telephones: t?.visible && Array.isArray(t.valeur) ? t.valeur.filter(plein) : [],
  };
}

export async function Suivi({ dossier: d, bienvenue, indisponible = false }: { dossier: Dossier; bienvenue: boolean; indisponible?: boolean }) {
  const [legal, signer, suivi] = await Promise.all([lireContenu("legal"), lireContenu("suivi.signer"), lireContenu("suivi.suivi")]);
  const T = suivi[d.langue];
  const vue = vueTicket(d, T);
  const film = bienvenue && d.cas === "paiement" && d.statut === "paye";
  const billets = d.cas === "paiement" && d.statut === "paye" ? d.billets : [];
  const qrs = await Promise.all(billets.map((b) => QRCode.toString(b.code, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0f162d", light: "#ffffff" } })));
  const devis = d.cas === "pret" ? d.devis : null;
  // devis prêt pas encore signé : il se signe en ligne (/suivi/<jeton>/signer)
  const aSigner = d.cas === "pret" && d.statut === "pret" && !!d.devis && d.document?.type === "devis" && !d.signature;
  const lie = d.lie ? (d.cas === "paiement" ? T.lie.accompagnement : T.lie.billets) : null;
  const { email, telephones } = contacts(legal.societe);
  const prix = (v: number) => montant(T, v, "XOF");

  return (
    <div lang={T.html} className="sv">
      <div aria-hidden="true" className="h-20 bg-abyss" />
      <section className={`sv-haut on-dark${film ? " is-imprime" : ""}`}>
        <div className="container-oht sv-haut-grille">
          <div className="sv-imprimante">
            <div className="sv-fente" aria-hidden="true" />
            <div className="sv-sortie">
              <Papier vue={vue} qr={<QrTicket chemin={vue.qr.chemin} label={vue.qr.label} />} />
            </div>
          </div>
          <div className="sv-texte">
            <h1 className="sv-titre">{vue.titre}</h1>
            <p className="sv-sous">{vue.sous}</p>
            <div className="sv-actions">
              {/* commande confirmée non réglée : le serveur ouvre le lien de paiement (montant relu en base) */}
              {d.payerEnLigne ? (
                <form action={payerCommande}>
                  <input type="hidden" name="jeton" value={d.jeton} />
                  <button type="submit" className="sv-action is-primaire">
                    {T.enLigne.payer}
                  </button>
                </form>
              ) : null}
              {aSigner ? (
                <Link href={`/suivi/${d.jeton}/signer`} prefetch={false} className="sv-action is-primaire">
                  {signer[d.langue].lien}
                </Link>
              ) : null}
              {vue.actions.map((a) =>
                a.document ? (
                  <a key={a.href} href={a.href} className={`sv-action ${aSigner ? "is-secondaire" : "is-primaire"}`}>
                    {a.libelle}
                  </a>
                ) : (
                  <Link key={a.href} href={a.href} className={`sv-action ${a.primaire && !d.payerEnLigne ? "is-primaire" : "is-secondaire"}`}>
                    {a.libelle}
                  </Link>
                ),
              )}
            </div>
            {indisponible && d.payerEnLigne ? (
              <p className="sv-sous" role="alert">
                {T.enLigne.indisponible}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="sv-corps">
        <div className="container-oht">
          {billets.length ? (
            <section className="sv-bloc" aria-labelledby="sv-billets">
              <h2 id="sv-billets">{T.billets.titre(billets.length)}</h2>
              <ul className="sv-billets">
                {billets.map((b, i) => (
                  <li key={b.numero} className="sv-billet">
                    <span className="sv-billet-qr" role="img" aria-label={`${T.billets.billet(i + 1, billets.length)} · ${T.billets.numero(b.numero)}`} dangerouslySetInnerHTML={{ __html: qrs[i] }} />
                    <p>
                      <b>{T.billets.billet(i + 1, billets.length)}</b>
                      <span>{T.billets.numero(b.numero)}</span>
                      <span>{T.billets.entree}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="sv-bloc" aria-labelledby="sv-recap">
            <h2 id="sv-recap">{T.recap.titre}</h2>
            <dl className="sv-liste">
              {recap(d, T).map(([k, v], i) => (
                <div key={i}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {d.document ? (
            <section className="sv-bloc" aria-labelledby="sv-documents">
              <h2 id="sv-documents">{T.documents.titre}</h2>
              <div className="sv-document">
                <p>
                  <b>
                    {T.documents[d.document.type]} {d.document.numero}
                  </b>
                  <span>{date(T, d.document.date)}</span>
                </p>
                <a href={d.document.url} className="oht-lien">
                  {T.documents.telecharger}
                </a>
              </div>
            </section>
          ) : null}

          {devis ? (
            <section className="sv-bloc" aria-labelledby="sv-devis">
              <h2 id="sv-devis">{T.devis.titre}</h2>
              <div>
                <ul className="sv-devis">
                  {devis.lignes.map((l, i) => (
                    <li key={i}>
                      <span>
                        {l.libelle}
                        <small>
                          {T.devis.quantite} {l.quantite} · {T.devis.prix} {prix(l.prixUnitaire)}
                        </small>
                      </span>
                      <span>{prix(l.quantite * l.prixUnitaire)}</span>
                    </li>
                  ))}
                </ul>
                <p className="sv-devis-total">
                  <span>{T.devis.total}</span>
                  <span>{prix(devis.montant)}</span>
                </p>
                {devis.valableJusquAu ? <p className="sv-note">{T.devis.valable(date(T, devis.valableJusquAu))}</p> : null}
                {devis.note ? <p className="sv-note">{devis.note}</p> : null}
              </div>
            </section>
          ) : null}

          {lie && d.lie ? (
            <section className="sv-bloc" aria-labelledby="sv-lie">
              <h2 id="sv-lie">{lie.titre}</h2>
              <div>
                <p className="sv-texte-courant">{lie.texte}</p>
                <LinkLine href={`/suivi/${d.lie}`} prefetch={false}>{T.lie.ouvrir}</LinkLine>
              </div>
            </section>
          ) : null}

          <section className="sv-bloc" aria-labelledby="sv-contact">
            <h2 id="sv-contact">{T.contact.titre}</h2>
            <div className="sv-contact">
              <p className="sv-texte-courant">{T.contact.texte(d.reference)}</p>
              <ButtonPrimary href={DEVIS.question} className="is-plein-mobile">
                {T.contact.ecrire}
              </ButtonPrimary>
              {email || telephones.length ? (
                <dl className="sv-liste">
                  {email ? (
                    <div>
                      <dt>{T.contact.email}</dt>
                      <dd>
                        <a href={`mailto:${email}`} className="oht-lien">
                          {email}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {telephones.length ? (
                    <div>
                      <dt>{T.contact.telephone}</dt>
                      <dd>
                        {telephones.map((n) => (
                          <a key={n} href={`tel:${n.replace(/[^\d+]/g, "")}`} className="oht-lien">
                            {n}
                          </a>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {film ? <Embarquement vue={vue} titre={T.titre} /> : null}
    </div>
  );
}
