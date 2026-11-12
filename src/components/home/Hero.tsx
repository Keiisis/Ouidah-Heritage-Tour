import Link from "@/components/ui/LienPublic";
import { cleType } from "@/content/fr";
import { lireContenuPage as lireContenu, languePage } from "@/lib/serveur/contenu-page";
import { adresseLangue } from "@/lib/adresses-langues";
import { Icon } from "@/components/ui/Icon";
import { Objet3D } from "@/components/ui/Objet3D";
import { HeroFond } from "@/components/home/HeroFond";

// Section 2 — ouverture, reprise ligne à ligne du dossier bénin-tours (jaune et marine), en Fraunces / Manrope :
// photos en fondu enchaîné et Ken Burns, voile marine localisé derrière le texte (à gauche sur grand écran, en bas sur
// téléphone), accroche en simple ligne, titre en deux tons (le jaune réservé au mot clé et au bouton Rechercher), barre de
// recherche (destination, type, durée) envoyée en GET vers les circuits, une action secondaire, quatre repères chiffrés.
// Retouche Unslop (heydamir/unslop, CC BY 4.0) validée par Kevin le 05/11/2026. Entre 768 et 1023 px, sans pastilles d'objet
// et bouton réduit à la loupe : les choix n'y sont plus tronqués (Kevin, 10/11).
export async function Hero() {
  const langue = await languePage();
  const [hero, places, tours, tourFilters] = await Promise.all([lireContenu("fr.hero"), lireContenu("fr.places"), lireContenu("fr.tours"), lireContenu("fr.tourFilters")]);
  const search = {
    ...hero.search,
    fields: hero.search.fields.map((f) => ({
      ...f,
      options: f.name === "lieu"
        ? [f.options[0], ...places.map((p) => ({ value: p.slug, label: p.name }))]
        : f.name === "type"
          ? [f.options[0], ...tourFilters.slice(1).filter((t) => tours.some((c) => c.tag === t)).map((t) => ({ value: cleType(t), label: t }))]
          : f.options,
    })),
  };
  return (
    <section className="relative flex min-h-svh flex-col justify-between overflow-hidden bg-abyss pt-20 pb-8 text-white lg:min-h-screen lg:pt-24 lg:pb-12">
      <HeroFond images={hero.images} />
      <div aria-hidden="true" className="absolute inset-0 z-[1] bg-gradient-to-t from-abyss/85 via-abyss/45 to-abyss/20 lg:bg-gradient-to-r lg:from-abyss/80 lg:via-abyss/45 lg:to-transparent" />

      <div className="relative z-10 mx-auto my-auto flex w-full max-w-[1320px] flex-col items-start px-4 pt-8 pb-8 text-left sm:px-6 lg:px-8 lg:py-20">
        <p className="mb-5 text-sm font-medium text-white/80">
          {hero.kicker[0]} <span aria-hidden="true">·</span> <span className="whitespace-nowrap">{hero.kicker[1]}</span>
        </p>

        <h1 className="mb-6 max-w-4xl font-display text-4xl leading-[1.04] font-semibold tracking-[-0.02em] text-balance text-white sm:text-6xl md:text-7xl lg:text-[84px]">
          {hero.title.lead} <span className="text-sun">{hero.title.accent}</span>
        </h1>

        <p className="mb-8 max-w-2xl text-base leading-relaxed font-normal text-pretty text-white/90 sm:text-lg md:mb-10 md:text-xl">{hero.sub}</p>

        <div className="w-full max-w-4xl rounded-2xl border border-white/16 bg-abyss/80 p-3 backdrop-blur-xl md:rounded-full md:p-2.5">
          <form action={adresseLangue(search.action, langue)} method="get" role="search" aria-label={search.label} className="flex flex-col items-center gap-3 md:flex-row">
            {search.fields.map((f, i) => (
              <div key={f.name} className={`flex w-full items-center gap-3 px-4 py-2 md:flex-1 ${i < search.fields.length - 1 ? "border-b border-white/15 md:border-r md:border-b-0" : ""}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white md:max-lg:hidden"><Objet3D nom={f.objet} taille={26} /></span>
                <div className="flex w-full flex-col text-left">
                  <label htmlFor={`hero-${f.name}`} className="text-xs font-medium text-white/70">
                    {f.label}
                  </label>
                  <select
                    id={`hero-${f.name}`}
                    name={f.name}
                    defaultValue=""
                    className="min-h-8 w-full cursor-pointer bg-transparent text-base font-medium text-white md:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun [&>option]:text-abyss"
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <button
              type="submit"
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-sun px-8 py-4 text-sm font-semibold text-abyss transition-colors duration-150 hover:bg-sun-deep focus-visible:outline-sun md:w-auto md:rounded-full md:max-lg:px-4"
            >
              <Icon name="search" className="size-4" />
              <span className="md:max-lg:sr-only">{search.submit}</span>
            </button>
          </form>
        </div>

        <Link href={hero.secondary.href} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline-sun">
          <span>{hero.secondary.label}</span>
          <Icon name="arrow-right" className="size-4" />
        </Link>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1320px] border-t border-white/12 px-4 pt-6 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-4 text-left md:grid-cols-4">
          {hero.facts.map((f) => (
            <li key={f.value}>
              <p className="font-display text-2xl font-semibold text-white tabular-nums lg:text-3xl">{f.value}</p>
              <p className="mt-1 text-xs text-white/75">{f.label}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
