import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { section } from "@/content/espace";
import { securite as S } from "@/content/espace-securite";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import "../fiche.css";

// Écran d'un agent connecté à qui ce droit n'est pas ouvert (lot « securite », exigerDroit) : le cadre de l'espace et un
// état honnête, aucune donnée de l'écran demandé. Sans session pour ce rôle, retour à l'entrée, comme partout.
export async function SansDroit({ role, actif }: { role: Role; actif: string }) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const x = section(role, actif);
  return (
    <Enveloppe role={role} session={s} actif={actif} minute={minuteServeur()}>
      <Tete titre={x?.nom ?? ""} sous={x?.groupe ?? ""} />
      <section className="esp-fiche construit" style={vars({ "--i": 1 })} data-sans-droit={actif}>
        <Vide texte={S.sansDroit.texte} />
        <Link className="bouton" href={`/${role}`}>
          {S.sansDroit.retour}
        </Link>
      </section>
    </Enveloppe>
  );
}
