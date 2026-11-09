"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

// QR du ticket : adresse absolue du document (PDF) ou de la page de suivi, calculée dans le navigateur avec
// location.origin. Avant le calcul (et sans JavaScript), un carré vide de la même taille tient la place.
export function QrTicket({ chemin, label }: { chemin: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void QRCode.toString(new URL(chemin, window.location.origin).href, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1b1a22", light: "#fbf8f2" } }).then((s) => vivant && setSvg(s));
    return () => {
      vivant = false;
    };
  }, [chemin]);
  return <span className="sv-qr-code" role="img" aria-label={label} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}
