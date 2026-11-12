import { readdirSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Adresses inconnues. Le dossier [lang] prend tout premier segment pour une langue : /contact ou /circuitz y tombaient et
// Next servait sa 404 brute (notFound() du layout racine, sans limite au-dessus). On les réécrit, sans proxy, vers une
// fiche absente qui rend la page introuvable du site avec le statut 404, le menu et la langue de l'adresse (l'adresse
// tapée reste dans la barre : la page la lit pour proposer la plus proche). Un slug ne commence jamais par « _ ».
const LANGUES = ["en", "es", "de", "pt", "ht", "gcf"];
const INTROUVABLE = "/circuits/_introuvable";
// premiers segments servis par les routes du site (dossiers de src/app, groupes dépliés), relus à chaque build
const dossiers = (d: string): string[] => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory())
  .flatMap((e) => (/^\(.+\)$/.test(e.name) ? dossiers(path.join(d, e.name)) : /^[[_@]/.test(e.name) ? [] : [e.name]));
const SEGMENTS = [...LANGUES, ...dossiers(path.join(__dirname, "src", "app"))];
// segment qui n'est aucun de ceux de la liste (noms de dossiers : lettres, chiffres, tirets), ni interne (« _ »), ni fichier
const ni = (liste: string[]) => `${liste.length ? `(?!(?:${liste.join("|")})(?:/|$))` : ""}(?!_)[^/.]+`;
// adresses de rubriques sans page propre : la section de l'accueil qui les montre (ancres SECTIONS de content/fr.ts)
const RUBRIQUES = [
  { de: "/circuits", vers: "#chemins" },
  { de: "/ouidah", vers: "#lieux" },
  { de: "/ouidah/lieux", vers: "#lieux" },
];

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
      ...RUBRIQUES.flatMap(({ de, vers }) => [
        { source: de, destination: `/${vers}`, permanent: false },
        { source: `/:lang(${LANGUES.join("|")})${de}`, destination: `/:lang${vers}`, permanent: false },
      ]),
      // la Route des Esclaves n'a pas de fiche lieu : sa fiche est celle du circuit
      { source: "/ouidah/lieux/route-des-esclaves", destination: "/circuits/route-des-esclaves", permanent: false },
      { source: `/:lang(${LANGUES.join("|")})/ouidah/lieux/route-des-esclaves`, destination: "/:lang/circuits/route-des-esclaves", permanent: false },
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
  async rewrites() {
    return {
      // avant les routes dynamiques : un segment seul qui n'est ni une langue ni une page (/contact), ou un premier
      // segment inconnu suivi d'autres (/contact/x)
      afterFiles: [
        { source: `/:premier(${ni(LANGUES)})`, destination: INTROUVABLE },
        { source: `/:premier(${ni(SEGMENTS)})/:reste+`, destination: INTROUVABLE },
      ],
      // après elles : ce qu'aucune route ne sert, dans la langue de l'adresse (/en/x, /ouidah/x/y)
      fallback: [
        { source: `/:lang(${LANGUES.join("|")})/:reste+`, destination: `/:lang${INTROUVABLE}` },
        { source: `/:premier(${ni([])})/:reste+`, destination: INTROUVABLE },
      ],
    };
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
