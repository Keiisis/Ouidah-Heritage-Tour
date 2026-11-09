import { NextResponse, type NextRequest } from "next/server";
import { lireJeton } from "@/lib/serveur/documents/jeton";

// Le suivi vérifie le jeton avant tout rendu. Les fiches valident leur slug contre le contenu publié dans leur page
// bloquante (instant = false) : une liste figée ici empêcherait les ajouts depuis l'admin.
const introuvable = (request: NextRequest) => NextResponse.rewrite(new URL("/_introuvable", request.url), { status: 404 });

export async function proxy(request: NextRequest) {
  const chemin = request.nextUrl.pathname;
  const s = chemin.match(/^\/suivi\/([^/]+)(?:\/document|\/signer)?\/?$/);
  if (s) return lireJeton(decodeURIComponent(s[1])) ? NextResponse.next({ headers: { "x-robots-tag": "noindex, nofollow" } }) : introuvable(request);
  if (chemin.startsWith("/suivi")) return introuvable(request);
}

// toutes les pages (maintenance), sauf les fichiers internes de Next et l'icône
export const config = { matcher: ["/suivi/:path*", "/payer/:path*", "/agents/:path*", "/admins/:path*"] };
