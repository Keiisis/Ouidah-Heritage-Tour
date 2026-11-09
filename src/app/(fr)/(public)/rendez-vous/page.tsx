import { metadonneesPage } from "@/lib/serveur/seo";
import { metadonneesService, PageService } from "@/components/services/PageService";
export const generateMetadata = async () => metadonneesPage("/rendez-vous", await metadonneesService("rendez-vous"));
export default function Page() { return <PageService type="rendez-vous" />; }