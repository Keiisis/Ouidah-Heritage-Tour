import { NextResponse, type NextRequest } from "next/server";
import { lireJeton } from "@/lib/serveur/documents/jeton";
import { idDuJeton } from "@/lib/serveur/equipe/finances/public";

// Le suivi et le paiement vérifient la signature du jeton avant tout rendu : un lien faux ou incomplet reçoit l'écran
// « Ce lien n'est plus valable » avec un vrai 404 (titre, e-mail de l'agence, lien vers le billet). Les fiches valident leur
// slug contre le contenu publié dans leur page bloquante (instant = false) : une liste figée ici empêcherait les ajouts
// depuis l'admin.
const introuvable = (request: NextRequest) => NextResponse.rewrite(new URL("/_introuvable", request.url), { status: 404 });
const invalide = (request: NextRequest) => NextResponse.rewrite(new URL("/lien-invalide", request.url), { status: 404, headers: { "x-robots-tag": "noindex, nofollow" } });
const prive = () => NextResponse.next({ headers: { "x-robots-tag": "noindex, nofollow" } });
const lire = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
};

export async function proxy(request: NextRequest) {
  const chemin = request.nextUrl.pathname;
  const s = chemin.match(/^\/suivi\/([^/]+)(?:\/document|\/signer)?\/?$/);
  if (s) return lireJeton(lire(s[1])) ? prive() : invalide(request);
  if (chemin.startsWith("/suivi")) return introuvable(request);
  const p = chemin.match(/^\/payer\/([^/]+)\/?$/);
  if (p) return idDuJeton(lire(p[1])) ? prive() : invalide(request);
}

// toutes les pages (maintenance), sauf les fichiers internes de Next et l'icône
export const config = { matcher: ["/suivi/:path*", "/payer/:path*", "/agents/:path*", "/admins/:path*"] };
