import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // documents de l'assistant (PDF, DOCX) téléversés par une action serveur : 4 Mo, sous le plafond de 4,5 Mo de Vercel ;
  // le type et la taille sont contrôlés par l'action
  // OHT_BUILD_CPUS : limite locale des workers de la build (PC à mémoire réduite) ; absente sur Vercel
  experimental: { serverActions: { bodySizeLimit: "4mb" }, globalNotFound: true, ...(process.env.OHT_BUILD_CPUS ? { cpus: Number(process.env.OHT_BUILD_CPUS) } : {}) },
  images: {
    unoptimized: true,
    minimumCacheTTL: 2678400,
    // Photos libres provisoires (Pexels), en attendant les photos d'OHT
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com", pathname: "/photos/**" },
      // Photos de la boutique, téléversées depuis l'admin (Supabase Storage, compartiment public « boutique »)
      { protocol: "https", hostname: "eidfekctzidyrhezpzsf.supabase.co", pathname: "/storage/v1/object/public/boutique/**" },
      // Images du contenu éditable et du blog (compartiment public « site-medias », WebP déjà redimensionnés au téléversement)
      { protocol: "https", hostname: "eidfekctzidyrhezpzsf.supabase.co", pathname: "/storage/v1/object/public/site-medias/**" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
      // Le rendu statique Next utilise des scripts en ligne. Sans nonce par requête,
      // ne pas prétendre les filtrer : bloquer objets, encadrement et changement de base.
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
    ] }];
  },
  async redirects() {
    return [
      { source: "/fr", destination: "/", permanent: true }, { source: "/fr/:path*", destination: "/:path*", permanent: true },
      // ancienne adresse /blog?langue=EN (la page /blog est statique et ne lit plus l'adresse sur le serveur) : vers la liste
      // de cette langue, query gardée (?categorie=, ?page=) ; langues = LANGUES_BLOG_SITE de src/content/blog-site.ts sauf FR
      ...["EN", "ES", "DE", "PT", "HT", "GCF"].map((l) => ({
        source: "/blog",
        has: [{ type: "query" as const, key: "langue", value: [...l].map((c) => `[${c}${c.toLowerCase()}]`).join("") }],
        destination: `/${l.toLowerCase()}/blog`,
        permanent: false,
      })),
    ];
  },
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
