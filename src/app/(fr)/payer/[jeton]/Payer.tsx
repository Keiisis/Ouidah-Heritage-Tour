"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { copiesPayer as COPIES_PAYER } from "@/content/espace-finances";
import { useContenu } from "@/components/ui/ContenuSite";
import type { LangueDoc } from "@/lib/suivi";
import { lancer, verifier } from "./actions";

// Paiement d'un lien, côté navigateur : le client choisit une passerelle, le serveur prépare le paiement au montant du lien
// (page hébergée de la passerelle ou widget Kkiapay), puis l'état revient TOUJOURS du serveur, qui relit la transaction
// auprès de la passerelle. Le navigateur ne décide jamais qu'un paiement a réussi.
type Etat = "ouvert" | "envoi" | "verification" | "non_confirme" | "paye" | "fini" | "erreur";
type Props = { jeton: string; langue: LangueDoc; montant: string; euros: string; expire: string; client: string; reference: string; etat: "ouvert" | "paye" | "fini"; passerelles: string[]; transaction: string | null; suivi: string | null };
type Kkiapay = { openKkiapayWidget: (o: Record<string, unknown>) => void; addSuccessListener: (cb: (r: { transactionId?: string }) => void) => void };
const NOMS: Record<string, string> = { kkiapay: "Kkiapay", fedapay: "FedaPay", stripe: "Stripe", flutterwave: "Flutterwave", paystack: "Paystack" };

function chargerScript(src: string) {
  return new Promise<void>((ok, ko) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    document.body.append(Object.assign(document.createElement("script"), { src, async: true, onload: () => ok(), onerror: () => ko(new Error(src)) }));
  });
}

export function Payer(p: Props) {
  const t = useContenu("espace-finances.copiesPayer", COPIES_PAYER)[p.langue];
  const [etat, setEtat] = useState<Etat>(p.etat === "ouvert" && p.transaction ? "verification" : p.etat);
  const [, demarrer] = useTransition();
  const verifierServeur = (transaction: string | null) => {
    setEtat("verification");
    demarrer(async () => {
      const r = await verifier(p.jeton, transaction).catch(() => null);
      setEtat(r === "paye" ? "paye" : r === null ? "erreur" : "non_confirme");
    });
  };
  // retour de la page hébergée de la passerelle : l'état réel est demandé au serveur une fois
  useEffect(() => {
    if (p.etat !== "ouvert" || !p.transaction) return;
    let vivant = true;
    verifier(p.jeton, p.transaction)
      .then((r) => vivant && setEtat(r === "paye" ? "paye" : r === null ? "erreur" : "non_confirme"))
      .catch(() => vivant && setEtat("erreur"));
    return () => {
      vivant = false;
    };
  }, [p.etat, p.jeton, p.transaction]);

  const payer = (nom: string) => {
    setEtat("envoi");
    demarrer(async () => {
      const r = await lancer(p.jeton, nom).catch(() => null);
      if (!r?.ok) {
        setEtat(r?.erreur === "paye" ? "paye" : r?.erreur === "expire" ? "fini" : "erreur");
        return;
      }
      if (r.lancement.mode === "redirection") {
        window.location.assign(r.lancement.url);
        return;
      }
      try {
        await chargerScript("https://cdn.kkiapay.me/k.js");
        const k = window as unknown as Kkiapay;
        k.addSuccessListener(({ transactionId }) => verifierServeur(transactionId ?? null));
        const options = { ...r.lancement.options };
        delete options.passerelle; // repère interne, pas une option du widget
        k.openKkiapayWidget(options);
        setEtat("ouvert");
      } catch {
        setEtat("erreur");
      }
    });
  };

  const message = { envoi: t.ouverture, verification: t.verification, non_confirme: t.nonConfirme, erreur: t.erreur, fini: t.plusValable, paye: null, ouvert: null }[etat];
  return (
    <div className="py" lang={p.langue.toLowerCase()}>
      <section className="py-carte" aria-labelledby="py-titre" data-etat={etat}>
        <p className="py-pour">{t.pour(p.client)}</p>
        <h1 id="py-titre">{etat === "paye" ? t.paye : t.titre}</h1>
        <dl className="py-recap">
          <div>
            <dt>{t.reference}</dt>
            <dd>{p.reference}</dd>
          </div>
          <div className="py-total">
            <dt>{t.total}</dt>
            <dd>
              <b>{p.montant} FCFA</b>
              <span>{t.soit(p.euros)}</span>
            </dd>
          </div>
        </dl>
        {etat === "paye" ? (
          <p className="py-ok" role="status">
            {t.payeSous}
          </p>
        ) : etat === "fini" ? (
          <p className="py-message" role="status">
            {t.plusValable}
          </p>
        ) : null}
        {/* commande de la boutique : son suivi montre l'état, le reçu, et rouvre un lien si celui-ci n'est plus valable */}
        {p.suivi && (etat === "paye" || etat === "fini") ? (
          <a className="py-reverifier py-suivi" href={`/suivi/${p.suivi}`}>
            {t.suivi}
          </a>
        ) : null}
        {etat === "paye" || etat === "fini" ? null : (
          <>
            <p className="py-note">
              {t.sansAcompte} {t.expire(p.expire)}
            </p>
            {p.passerelles.length ? (
              <fieldset className="py-passerelles" disabled={etat === "envoi" || etat === "verification"}>
                <legend>{t.choisir}</legend>
                {p.passerelles.map((nom) => (
                  <button key={nom} type="button" className="py-passerelle" onClick={() => payer(nom)} aria-label={`${t.payer} · ${NOMS[nom] ?? nom}`} data-passerelle={nom}>
                    <Image src={`/paiement/${nom}.svg`} alt="" width={120} height={28} />
                    <span>{t.payer}</span>
                  </button>
                ))}
              </fieldset>
            ) : (
              <p className="py-message">{t.aucune}</p>
            )}
            <p className="py-message" role={etat === "erreur" ? "alert" : "status"} aria-live="polite">
              {message}
            </p>
            {etat === "non_confirme" && (
              <button type="button" className="py-reverifier" onClick={() => verifierServeur(p.transaction)}>
                {t.reverifier}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
