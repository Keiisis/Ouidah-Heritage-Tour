import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lireEco } from "@/components/mesure/eco";
import { rafraichir } from "./rafraichir";

/** L'écran se relit auprès du serveur (router.refresh : même rendu, même contrôle de session) toutes les `secondes`,
 * 60 s au moins, en pause onglet caché ou après 5 min sans geste (règles : rafraichir.ts). Un seul minuteur par écran. */
export function useRafraichir(secondes: number) {
  const router = useRouter();
  const [eco, setEco] = useState(false);
  useEffect(() => {
    let vivant = true;
    void lireEco().then((e) => vivant && setEco(e));
    return () => {
      vivant = false;
    };
  }, []);
  useEffect(
    () =>
      rafraichir(() => router.refresh(), secondes * 1000, {
        document,
        fenetre: window,
        maintenant: Date.now,
        plusTard: (f, ms) => window.setTimeout(f, ms),
        annuler: (t) => window.clearTimeout(t as number),
      }, eco),
    [router, secondes, eco],
  );
}
