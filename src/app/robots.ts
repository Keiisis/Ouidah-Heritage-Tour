import type { MetadataRoute } from "next";
import { origineSite } from "@/lib/serveur/seo";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admins", "/agents", "/api/", "/suivi/", "/payer/", "/lettre/", "/maintenance", "/*/mes-donnees", "/mes-donnees", "/*/devis/reprendre/", "/devis/reprendre/"] }, sitemap: `${origineSite()}/sitemap.xml` };
}
