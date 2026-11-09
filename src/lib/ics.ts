import type { Evenement } from "@/content/types";
import { iso } from "@/lib/jours";

// Fichier .ics (agenda Google, Apple, Outlook) pour une occurrence d'événement, journées entières : section Agenda et
// talon de réservation payé.
export function telechargerIcs(o: { e: Pick<Evenement, "slug" | "title" | "place" | "text">; a: number; b: number }) {
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const d = (n: number) => iso(n).replace(/-/g, "");
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ouidah Heritage Tour//FR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${o.e.slug}-${d(o.a)}@ouidah-heritage-tour`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d(o.a)}`, `DTEND;VALUE=DATE:${d(o.b + 1)}`, `SUMMARY:${esc(o.e.title)}`, `LOCATION:${esc(o.e.place)}`, `DESCRIPTION:${esc(o.e.text)}`, "END:VEVENT", "END:VCALENDAR"];
  const url = URL.createObjectURL(new Blob([lignes.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
  const lien = Object.assign(document.createElement("a"), { href: url, download: `${o.e.slug}-${iso(o.a)}.ics` });
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
