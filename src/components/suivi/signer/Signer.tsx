import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { lireMentions, type ImageDoc } from "@/lib/serveur/documents/mentions";
import type { SignatureLue } from "@/lib/serveur/documents/signature";
import type { Dossier } from "@/lib/suivi";
import { CarteSejour } from "./CarteSejour";
import { Ecran } from "./Ecran";
import { enLettres, jourLong, nombre, periode, remplir, type Langage } from "./format";
import { carteDuSejour, refsLignes, type RefEtape } from "./sejour";
import "./signer.css";

// Écran « Signer le devis » (maquette E validée, 03/11/2026) : en-tête, feuille du devis dont la carte du séjour est
// l'en-tête (cartouche : titre, numéro, client), lignes renvoyées aux étapes de la carte, total, cartes de signature, et
// le panneau de signature. Tout vient du dossier lu en base, dans la langue de la demande. La Direction générale vient
// des mentions des documents (reglages_documents, sinon legal.json) : signature et cachet affichés seulement s'ils
// existent ; sans eux, la carte garde son titre, son filet, le nom et la fonction, jamais un emplacement vide (Kevin).
const dataUrl = (i: ImageDoc | null) => (i ? `data:image/${i.png ? "png" : "jpeg"};base64,${Buffer.from(i.octets).toString("base64")}` : null);
const n2 = (i: number) => String(i).padStart(2, "0");
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export type ContexteSigner = { circuit: string | null; lieux: string[]; expire: boolean; signature: SignatureLue | null };

export async function Signer({ dossier: d, contexte, hote }: { dossier: Dossier & { devis: NonNullable<Dossier["devis"]>; document: NonNullable<Dossier["document"]> }; contexte: ContexteSigner; hote: string }) {
  const [signer, suivi, tours, destinations, releve] = await Promise.all([
    lireContenu("suivi.signer"), lireContenu("suivi.suivi"), lireContenu("fr.tours"), lireContenu("fr.destinations"), lireContenu("lieux-ouidah"),
  ]);
  const S = signer[d.langue], T = suivi[d.langue];
  const M = await lireMentions(d.langue);
  const sigDg = dataUrl(M.signature), cachet = dataUrl(M.cachet);
  const fonction = M.fonction ?? S.direction.role;
  const L: Langage = { locale: T.locale, mois: T.mois };
  const n = (v: number) => nombre(v, L);
  const numero = d.document.numero;
  const carte = carteDuSejour(contexte.circuit, contexte.lieux, { tours, destinations, releve });
  const refs = refsLignes(d.devis.lignes.map((l) => l.libelle), carte.circuit, carte.etapes);
  const avecEtapes = refs.some(Boolean);

  const o = d.objet.type === "voyage" ? d.objet : null;
  const meta: [string, string][] = [];
  if (o?.arrivee && o.depart) {
    const nuits = Math.round((Date.parse(o.depart) - Date.parse(o.arrivee)) / 864e5);
    meta.push([S.sejour, `${periode(o.arrivee, o.depart, L)}${nuits > 0 ? ` · ${S.nuits(nuits)}` : ""}`]);
  }
  if (o && o.adultes + o.enfants > 0) meta.push([T.ticket.voyageurs, S.personnes(o.adultes, o.enfants)]);
  if (d.devis.valableJusquAu) meta.push([majuscule(S.valable.replace("{date}", "").trim()), jourLong(d.devis.valableJusquAu, L)]);
  const client = (cls: string) => (
    <div className={`sg-client ${cls}`}>
      <p className="sg-lib">{S.preparePour}</p>
      <p className="sg-nom">{d.client.nom}</p>
      <p className="sg-mail">{d.client.email}</p>
      {meta.length ? (
        <dl className="sg-meta">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
  const pastille = (r: RefEtape) =>
    !r ? null : r.length === 1 ? (
      <span className="sg-ref-etape">
        <span className="sr-only">{remplir(S.etapeUne, { n: n2(r[0]) })}</span>
        <b aria-hidden="true">{n2(r[0])}</b>
      </span>
    ) : (
      <span className="sg-ref-etape">
        <span className="sr-only">{remplir(S.etapesDeA, { a: n2(r[0]), b: n2(r[1]) })}</span>
        <b aria-hidden="true">{n2(r[0])}</b>
        <span aria-hidden="true">{S.a}</span>
        <b aria-hidden="true">{n2(r[1])}</b>
      </span>
    );
  const [avant, apres] = S.lettres ? S.lettres.split("{somme}") : ["", ""];
  const km = carte.km === null ? null : new Intl.NumberFormat(T.locale ?? "fr-FR", { maximumFractionDigits: 1 }).format(carte.km);
  const noms = carte.etapes.map((e, i) => `${n2(i + 1)} ${e.nom}`).join(", ");

  return (
    <div lang={T.html} className="sg">
      <div aria-hidden="true" className="h-20 bg-abyss" />
      <header className="sg-haut">
        <Link className="sg-marque" href="/">
          <Image src="/brand/oht-embleme.webp" alt="" width={40} height={40} />
          Ouidah Heritage Tour
        </Link>
        <p>
          <span className="sg-mot">{S.devis} </span>
          <b>{numero}</b>
        </p>
      </header>

      <Ecran
        T={S.ecran}
        L={L}
        langue={d.langue}
        jeton={d.jeton}
        nomClient={d.client.nom}
        titreCarte={S.bonPourAccord}
        titreFeuille={`${S.devis} ${numero}`}
        montant={n(d.devis.montant)}
        valable={d.devis.valableJusquAu ? remplir(S.valable, { date: jourLong(d.devis.valableJusquAu, L) }) : null}
        verifier={S.verifier}
        adresse={`${hote}/suivi/${d.jeton}`}
        document={d.document.url}
        expire={contexte.expire}
        signee={contexte.signature}
        carte={
          <CarteSejour
            donnees={{ etapes: carte.etapes, ligne: carte.ligne, aPied: carte.aPied, fond: carte.fond, lagune: carte.lagune, rivage: carte.rivage, cadre: carte.cadre }}
            textes={{ ocean: S.carte.ocean, lagune: S.carte.lagune, parcours: km ? remplir(S.carte.parcours, { km }) : null, locale: T.locale ?? "fr-FR" }}
            aria={noms ? remplir(S.carte.aria, { etapes: noms }) : S.carte.sans}
          >
            <h2>{S.devis}</h2>
            <p className="sg-numero">{numero}</p>
            <p className="sg-etat">
              <i aria-hidden="true" />
              {remplir(S.emis, { date: jourLong(d.document.date, L) })}
            </p>
            {client("is-carte")}
          </CarteSejour>
        }
        corps={
          <>
            {client("is-doc")}
            <table className="sg-lignes">
              <colgroup>
                {avecEtapes ? <col className="sg-c-e" /> : null}
                <col />
                <col className="sg-c-t" />
              </colgroup>
              <thead>
                <tr>
                  {avecEtapes ? <th>{S.etape}</th> : null}
                  <th>{S.designation}</th>
                  <th className="sg-n">{S.montant}</th>
                </tr>
              </thead>
              <tbody>
                {d.devis.lignes.map((l, i) => (
                  <tr key={i}>
                    {avecEtapes ? <td className="sg-e">{pastille(refs[i])}</td> : null}
                    <td>
                      <span className="sg-d">{l.libelle}</span>
                      <span className="sg-s">
                        <span className="sg-num">
                          {l.quantite} × {n(l.prixUnitaire)}
                        </span>
                      </span>
                    </td>
                    <td className="sg-n sg-t">{n(l.quantite * l.prixUnitaire)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.devis.note ? <p className="sg-note">{d.devis.note}</p> : null}
            <section className="sg-somme">
              <div>
                <p className="sg-lib">{S.total}</p>
                <p className="sg-montant">
                  {n(d.devis.montant)}
                  <small>FCFA</small>
                </p>
              </div>
              <div>
                {S.lettres ? (
                  <p className="sg-lettres">
                    {avant}
                    <b>{enLettres(d.devis.montant)}</b>
                    {apres}
                  </p>
                ) : null}
                <p className="sg-refs">
                  <span>
                    <b>{S.demande}</b>
                    <code className="sg-num">{d.reference}</code>
                  </span>
                </p>
              </div>
            </section>
          </>
        }
        direction={
          <article className={`sg-carte-s${sigDg ? "" : " is-sans-signature"}`}>
            <header>
              <h2>{S.direction.titre}</h2>
            </header>
            {sigDg ? (
              <div className="sg-zone">
                <span className="sg-sig-img" role="img" aria-label={[S.direction.signature, M.signataire].filter(Boolean).join(" · ")} style={{ backgroundImage: `url(${sigDg})` }} />
              </div>
            ) : null}
            <div className="sg-ligne-nom">
              <div>
                {M.signataire ? <p className="sg-qui">{M.signataire}</p> : null}
                <p className="sg-preuve">{fonction}</p>
              </div>
              {cachet ? <span className="sg-cachet-img" role="img" aria-label={S.direction.cachet} style={{ backgroundImage: `url(${cachet})` }} /> : null}
            </div>
            {sigDg || cachet ? <p className="sg-pied-c">{S.direction.pied}</p> : null}
          </article>
        }
      />
    </div>
  );
}
