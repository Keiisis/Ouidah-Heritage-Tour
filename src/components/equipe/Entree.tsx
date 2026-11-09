import type { Role } from "@/content/equipe";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Accueil } from "./Accueil";
import { Connexion } from "./Connexion";

// Entrée unique de /agents et /admins (composant serveur, toujours rendu sous <Suspense> : il lit le cookie de session).
// Sans session valable, ou avec le mauvais rôle (un agent sur /admins), la connexion G ; sinon l'accueil E.
export async function Entree({ role }: { role: Role }) {
  const s = await exigerRole(role);
  return s ? <Accueil role={role} session={s} /> : <Connexion role={role} />;
}
