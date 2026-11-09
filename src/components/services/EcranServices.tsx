import { redirect } from "next/navigation";
import { lireContenu } from "@/lib/contenu";
import { Enveloppe } from "@/components/espace/Enveloppe";
import { Tete } from "@/components/espace/Tete";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireServices } from "@/lib/serveur/services/equipe";
import { GestionServices } from "./GestionServices";
export async function EcranServices({admin=false}:{admin?:boolean}) {
  const role=admin?"admins":"agents",s=admin?await exigerRole("admins"):await exigerDroit("demandes");
  if(!s)redirect(`/${role}`);
  const T=await lireContenu("services.servicesEquipe"),donnees=await lireServices(s);
  return <Enveloppe role={role} session={s} actif={admin?"services":"rendez-vous"} minute={minuteServeur()}><Tete titre={T.titre} sous={T.description}/>{donnees?<GestionServices donnees={donnees} T={T} admin={s.role==="admin"} profilId={s.profilId}/>:<p className="services-equipe" role="alert">{T.panne}</p>}</Enveloppe>;
}
