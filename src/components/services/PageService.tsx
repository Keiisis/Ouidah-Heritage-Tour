import { Suspense } from "react";
import { languePage, lireContenuPage } from "@/lib/serveur/contenu-page";
import { langueService } from "@/lib/serveur/services/regles";
import { disponibilites } from "@/lib/serveur/services/public";
import { connection } from "next/server";
import { FormulaireService } from "./FormulaireService";
import type { CopieServices } from "@/content/services";
import type { Metadata } from "next";

export async function metadonneesService(type:"rendez-vous"|"partenaires"|"mes-donnees"):Promise<Metadata> {
  const langue=langueService(await languePage()),T=(await lireContenuPage("services.copiesServices"))[langue];
  return {title:type==="rendez-vous"?T.metaRendezVous:type==="partenaires"?T.metaPartenaires:T.metaDonnees,description:type==="rendez-vous"?T.rendezVousDescription:type==="partenaires"?T.partenairesDescription:T.donneesDescription,...(type==="mes-donnees"?{robots:{index:false,follow:false}}:{})};
}

async function RendezVous({T,langue}:{T:CopieServices;langue:ReturnType<typeof langueService>}) {
  await connection(); const c=await disponibilites(); return <FormulaireService type="rendez-vous" T={T} langue={langue} creneaux={c??[]} indisponible={c===null}/>;
}
export async function PageService({type}:{type:"rendez-vous"|"partenaires"|"mes-donnees"}) {
  const langue=langueService(await languePage()), copies=await lireContenuPage("services.copiesServices"),T=copies[langue];
  const titre=type==="rendez-vous"?T.rendezVous:type==="partenaires"?T.partenaires:T.donnees;
  const description=type==="rendez-vous"?T.rendezVousDescription:type==="partenaires"?T.partenairesDescription:T.donneesDescription;
  return <div className="services-page"><header className="services-entete"><h1>{titre}</h1><p>{description}</p></header>{type==="rendez-vous"?<Suspense fallback={<p className="services-vide">{T.enCours}</p>}><RendezVous T={T} langue={langue}/></Suspense>:<FormulaireService type={type} T={T} langue={langue}/>}</div>;
}
