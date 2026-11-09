import { metadonneesPage } from "@/lib/serveur/seo";
import { metadonneesService, PageService } from "@/components/services/PageService";
export const generateMetadata = async () => metadonneesPage("/partenaires", await metadonneesService("partenaires"));
export default function Page() { return <PageService type="partenaires" />; }