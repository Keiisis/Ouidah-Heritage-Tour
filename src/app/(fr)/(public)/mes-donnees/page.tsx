import { metadonneesPage } from "@/lib/serveur/seo";
import { metadonneesService, PageService } from "@/components/services/PageService";
export const generateMetadata = async () => metadonneesPage("/mes-donnees", await metadonneesService("mes-donnees"));
export default function Page() { return <PageService type="mes-donnees" />; }