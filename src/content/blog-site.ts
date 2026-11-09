// Blog public (/blog et /blog/<article>), construit sans maquette à la demande de Kevin (05/11/2026) dans le langage des
// fiches et de la page Histoire. Textes de l'interface dans les 7 langues du site ; les articles eux-mêmes viennent de la
// base (lib/serveur/blog/public.ts), écrits par l'équipe dans l'espace. Aucun article, chiffre ni avis inventé ici.
// HT et GCF : écrits sur le vocabulaire des autres textes du site, à faire relire par un locuteur avant la mise en ligne.
// Dates : les noms de mois HT et GCF viennent du dictionnaire de suivi éditable.

export const LANGUES_BLOG_SITE = ["FR", "EN", "ES", "DE", "PT", "HT", "GCF"] as const;
export type LangueBlogSite = (typeof LANGUES_BLOG_SITE)[number];

/** Attribut lang de la page et locale des dates (Intl.DateTimeFormat) par langue. */
export const LOCALES_BLOG: Record<LangueBlogSite, { lang: string; date: string; og: string }> = {
  FR: { lang: "fr", date: "fr-FR", og: "fr_FR" },
  EN: { lang: "en", date: "en-GB", og: "en_GB" },
  ES: { lang: "es", date: "es-ES", og: "es_ES" },
  DE: { lang: "de", date: "de-DE", og: "de_DE" },
  PT: { lang: "pt", date: "pt-PT", og: "pt_PT" },
  HT: { lang: "ht", date: "fr-HT", og: "ht_HT" },
  GCF: { lang: "gcf", date: "fr-GP", og: "fr_GP" },
};

/** Nom de chaque langue dans sa propre langue (mêmes libellés que le sélecteur du site). */
export const NOMS_LANGUES_BLOG: Record<LangueBlogSite, string> = {
  FR: "Français",
  EN: "English",
  ES: "Español",
  DE: "Deutsch",
  PT: "Português",
  HT: "Kreyòl ayisyen",
  GCF: "Kréyòl",
};

export type TexteBlog = {
  meta: { titre: string; description: string; titreCategorie: (c: string) => string; titreArticle: (t: string) => string };
  titre: string;
  phrase: string;
  filtres: { aria: string; tous: string };
  une: string;
  liste: { tous: string; categorie: (c: string) => string };
  lire: string;
  minutes: (n: number) => string;
  par: (nom: string) => string;
  publieLe: string;
  pages: { aria: string; recents: string; anciens: string; page: (n: number, total: number) => string };
  vide: { titre: string; texte: string; horsPages: string; categorie: (c: string) => string; texteCategorie: string; tous: string; histoire: string; voyage: string };
  langue: { proposition: string; aria: string };
  article: {
    retour: string;
    lireEn: string;
    lies: string;
    cta: { titre: string; texte: string; bouton: string };
  };
};

const FR: TexteBlog = {
  meta: {
    titre: "Le journal de Ouidah — Ouidah Heritage Tour",
    description: "Récits, lieux et gens de Ouidah, écrits par l’équipe de Ouidah Heritage Tour.",
    titreCategorie: (c) => `${c} — Le journal de Ouidah`,
    titreArticle: (t) => `${t} — Ouidah Heritage Tour`,
  },
  titre: "Le journal de Ouidah",
  phrase: "Récits, lieux et gens de Ouidah, écrits par l’équipe de Ouidah Heritage Tour.",
  filtres: { aria: "Catégories du journal", tous: "Tout lire" },
  une: "Article à la une",
  liste: { tous: "Tous les articles", categorie: (c) => c },
  lire: "Lire l’article",
  minutes: (n) => `${n} min de lecture`,
  par: (nom) => `Par ${nom}`,
  publieLe: "Publié le",
  pages: { aria: "Pages du journal", recents: "Articles plus récents", anciens: "Articles plus anciens", page: (n, t) => `Page ${n} sur ${t}` },
  vide: {
    titre: "Aucun article publié pour l’instant.",
    texte: "L’équipe écrit les premiers récits. En attendant, l’histoire de la ville se lit déjà ici.",
    horsPages: "Cette page du journal n’existe pas.",
    categorie: (c) => `Aucun article dans « ${c} » pour l’instant.`,
    texteCategorie: "Les autres récits du journal restent à lire.",
    tous: "Voir tous les articles",
    histoire: "L’histoire de Ouidah",
    voyage: "Créer mon voyage",
  },
  langue: { proposition: "Lire le journal en français", aria: "Langue du journal" },
  article: {
    retour: "Tous les articles",
    lireEn: "Lire en",
    lies: "Dans la même catégorie",
    cta: {
      titre: "Ouidah se raconte encore mieux sur place.",
      texte: "Dites-nous ce qui vous attire, nous composons le voyage à votre rythme.",
      bouton: "Créer mon voyage",
    },
  },
};

const EN: TexteBlog = {
  meta: {
    titre: "The Ouidah journal — Ouidah Heritage Tour",
    description: "Stories, places and people of Ouidah, written by the Ouidah Heritage Tour team.",
    titreCategorie: (c) => `${c} — The Ouidah journal`,
    titreArticle: (t) => `${t} — Ouidah Heritage Tour`,
  },
  titre: "The Ouidah journal",
  phrase: "Stories, places and people of Ouidah, written by the Ouidah Heritage Tour team.",
  filtres: { aria: "Journal categories", tous: "Read everything" },
  une: "Featured article",
  liste: { tous: "All articles", categorie: (c) => c },
  lire: "Read the article",
  minutes: (n) => `${n} min read`,
  par: (nom) => `By ${nom}`,
  publieLe: "Published on",
  pages: { aria: "Journal pages", recents: "Newer articles", anciens: "Older articles", page: (n, t) => `Page ${n} of ${t}` },
  vide: {
    titre: "No articles published yet.",
    texte: "The team is writing the first stories. Meanwhile, the history of the town is already here to read.",
    horsPages: "This page of the journal does not exist.",
    categorie: (c) => `No articles in “${c}” yet.`,
    texteCategorie: "The other stories of the journal are waiting for you.",
    tous: "See all articles",
    histoire: "The history of Ouidah",
    voyage: "Create my trip",
  },
  langue: { proposition: "Read the journal in English", aria: "Journal language" },
  article: {
    retour: "All articles",
    lireEn: "Read in",
    lies: "In the same category",
    cta: {
      titre: "Ouidah tells its story even better in person.",
      texte: "Tell us what draws you, and we will shape the trip at your own pace.",
      bouton: "Create my trip",
    },
  },
};

const ES: TexteBlog = {
  meta: {
    titre: "El diario de Ouidah — Ouidah Heritage Tour",
    description: "Relatos, lugares y gente de Ouidah, escritos por el equipo de Ouidah Heritage Tour.",
    titreCategorie: (c) => `${c} — El diario de Ouidah`,
    titreArticle: (t) => `${t} — Ouidah Heritage Tour`,
  },
  titre: "El diario de Ouidah",
  phrase: "Relatos, lugares y gente de Ouidah, escritos por el equipo de Ouidah Heritage Tour.",
  filtres: { aria: "Categorías del diario", tous: "Leerlo todo" },
  une: "Artículo destacado",
  liste: { tous: "Todos los artículos", categorie: (c) => c },
  lire: "Leer el artículo",
  minutes: (n) => `${n} min de lectura`,
  par: (nom) => `Por ${nom}`,
  publieLe: "Publicado el",
  pages: { aria: "Páginas del diario", recents: "Artículos más recientes", anciens: "Artículos más antiguos", page: (n, t) => `Página ${n} de ${t}` },
  vide: {
    titre: "Todavía no hay artículos publicados.",
    texte: "El equipo está escribiendo los primeros relatos. Mientras tanto, la historia de la ciudad ya se puede leer aquí.",
    horsPages: "Esta página del diario no existe.",
    categorie: (c) => `Todavía no hay artículos en «${c}».`,
    texteCategorie: "Los demás relatos del diario siguen aquí.",
    tous: "Ver todos los artículos",
    histoire: "La historia de Ouidah",
    voyage: "Crear mi viaje",
  },
  langue: { proposition: "Leer el diario en español", aria: "Idioma del diario" },
  article: {
    retour: "Todos los artículos",
    lireEn: "Leer en",
    lies: "En la misma categoría",
    cta: {
      titre: "Ouidah se cuenta aún mejor en persona.",
      texte: "Cuéntenos lo que le atrae y prepararemos el viaje a su ritmo.",
      bouton: "Crear mi viaje",
    },
  },
};

const DE: TexteBlog = {
  meta: {
    titre: "Das Ouidah-Journal — Ouidah Heritage Tour",
    description: "Geschichten, Orte und Menschen aus Ouidah, geschrieben vom Team von Ouidah Heritage Tour.",
    titreCategorie: (c) => `${c} — Das Ouidah-Journal`,
    titreArticle: (t) => `${t} — Ouidah Heritage Tour`,
  },
  titre: "Das Ouidah-Journal",
  phrase: "Geschichten, Orte und Menschen aus Ouidah, geschrieben vom Team von Ouidah Heritage Tour.",
  filtres: { aria: "Kategorien des Journals", tous: "Alles lesen" },
  une: "Titelartikel",
  liste: { tous: "Alle Artikel", categorie: (c) => c },
  lire: "Artikel lesen",
  minutes: (n) => `${n} Min. Lesezeit`,
  par: (nom) => `Von ${nom}`,
  publieLe: "Veröffentlicht am",
  pages: { aria: "Seiten des Journals", recents: "Neuere Artikel", anciens: "Ältere Artikel", page: (n, t) => `Seite ${n} von ${t}` },
  vide: {
    titre: "Noch keine Artikel veröffentlicht.",
    texte: "Das Team schreibt die ersten Geschichten. Die Geschichte der Stadt können Sie schon hier lesen.",
    horsPages: "Diese Seite des Journals gibt es nicht.",
    categorie: (c) => `Noch keine Artikel in „${c}“.`,
    texteCategorie: "Die anderen Geschichten des Journals warten auf Sie.",
    tous: "Alle Artikel ansehen",
    histoire: "Die Geschichte von Ouidah",
    voyage: "Meine Reise gestalten",
  },
  langue: { proposition: "Das Journal auf Deutsch lesen", aria: "Sprache des Journals" },
  article: {
    retour: "Alle Artikel",
    lireEn: "Lesen auf",
    lies: "In derselben Kategorie",
    cta: {
      titre: "Vor Ort erzählt Ouidah seine Geschichte noch besser.",
      texte: "Sagen Sie uns, was Sie anzieht, und wir gestalten die Reise in Ihrem Tempo.",
      bouton: "Meine Reise gestalten",
    },
  },
};

const PT: TexteBlog = {
  meta: {
    titre: "O diário de Ouidah — Ouidah Heritage Tour",
    description: "Histórias, lugares e gente de Ouidah, escritos pela equipa da Ouidah Heritage Tour.",
    titreCategorie: (c) => `${c} — O diário de Ouidah`,
    titreArticle: (t) => `${t} — Ouidah Heritage Tour`,
  },
  titre: "O diário de Ouidah",
  phrase: "Histórias, lugares e gente de Ouidah, escritos pela equipa da Ouidah Heritage Tour.",
  filtres: { aria: "Categorias do diário", tous: "Ler tudo" },
  une: "Artigo em destaque",
  liste: { tous: "Todos os artigos", categorie: (c) => c },
  lire: "Ler o artigo",
  minutes: (n) => `${n} min de leitura`,
  par: (nom) => `Por ${nom}`,
  publieLe: "Publicado a",
  pages: { aria: "Páginas do diário", recents: "Artigos mais recentes", anciens: "Artigos mais antigos", page: (n, t) => `Página ${n} de ${t}` },
  vide: {
    titre: "Ainda não há artigos publicados.",
    texte: "A equipa está a escrever as primeiras histórias. Entretanto, a história da cidade já se pode ler aqui.",
    horsPages: "Esta página do diário não existe.",
    categorie: (c) => `Ainda não há artigos em «${c}».`,
    texteCategorie: "As outras histórias do diário continuam aqui.",
    tous: "Ver todos os artigos",
    histoire: "A história de Ouidah",
    voyage: "Criar a minha viagem",
  },
  langue: { proposition: "Ler o diário em português", aria: "Língua do diário" },
  article: {
    retour: "Todos os artigos",
    lireEn: "Ler em",
    lies: "Na mesma categoria",
    cta: {
      titre: "Ouidah conta-se ainda melhor no local.",
      texte: "Diga-nos o que o atrai e compomos a viagem ao seu ritmo.",
      bouton: "Criar a minha viagem",
    },
  },
};

const HT: TexteBlog = {
  meta: {
    titre: "Jounal Ouidah — Ouidah Heritage Tour",
    description: "Istwa, kote ak moun Ouidah, ekip Ouidah Heritage Tour ekri yo.",
    titreCategorie: (c) => `${c} — Jounal Ouidah`,
    titreArticle: (t) => `${t} — Ouidah Heritage Tour`,
  },
  titre: "Jounal Ouidah",
  phrase: "Istwa, kote ak moun Ouidah, ekip Ouidah Heritage Tour ekri yo.",
  filtres: { aria: "Kategori jounal la", tous: "Li tout" },
  une: "Atik devan an",
  liste: { tous: "Tout atik yo", categorie: (c) => c },
  lire: "Li atik la",
  minutes: (n) => `${n} min lekti`,
  par: (nom) => `Pa ${nom}`,
  publieLe: "Pibliye le",
  pages: { aria: "Paj jounal la", recents: "Atik ki pi resan", anciens: "Atik ki pi ansyen", page: (n, t) => `Paj ${n} sou ${t}` },
  vide: {
    titre: "Poko gen atik ki pibliye.",
    texte: "Ekip la ap ekri premye istwa yo. Pandan tan sa a, istwa vil la deja la pou ou li.",
    horsPages: "Paj jounal sa a pa egziste.",
    categorie: (c) => `Poko gen atik nan « ${c} ».`,
    texteCategorie: "Lòt istwa jounal la toujou la pou ou li.",
    tous: "Wè tout atik yo",
    histoire: "Istwa Ouidah",
    voyage: "Kreye vwayaj mwen",
  },
  langue: { proposition: "Li jounal la an kreyòl ayisyen", aria: "Lang jounal la" },
  article: {
    retour: "Tout atik yo",
    lireEn: "Li an",
    lies: "Nan menm kategori a",
    cta: {
      titre: "Ouidah rakonte tèt li pi byen sou plas.",
      texte: "Di nou sa ki atire w, n ap konpoze vwayaj la nan ritm pa w.",
      bouton: "Kreye vwayaj mwen",
    },
  },
};

const GCF: TexteBlog = {
  meta: {
    titre: "Jounal a Ouidah — Ouidah Heritage Tour",
    description: "Listwa, koté é moun a Ouidah, ékip a Ouidah Heritage Tour ékri yo.",
    titreCategorie: (c) => `${c} — Jounal a Ouidah`,
    titreArticle: (t) => `${t} — Ouidah Heritage Tour`,
  },
  titre: "Jounal a Ouidah",
  phrase: "Listwa, koté é moun a Ouidah, ékip a Ouidah Heritage Tour ékri yo.",
  filtres: { aria: "Kalité a jounal-la", tous: "Li tout" },
  une: "Awtik douvan-la",
  liste: { tous: "Tout awtik-la", categorie: (c) => c },
  lire: "Li awtik-la",
  minutes: (n) => `${n} min lekti`,
  par: (nom) => `Pa ${nom}`,
  publieLe: "Pibliyé lè",
  pages: { aria: "Paj a jounal-la", recents: "Awtik pli nèf", anciens: "Awtik pli ansyen", page: (n, t) => `Paj ${n} asi ${t}` },
  vide: {
    titre: "Pòkò ni awtik pibliyé.",
    texte: "Ékip-la ka ékri prèmyé listwa-la. Pannan tan-lasa, listwa a lavil-la ja la pou li.",
    horsPages: "Paj-lasa a jounal-la pa ka égzisté.",
    categorie: (c) => `Pòkò ni awtik adan « ${c} ».`,
    texteCategorie: "Dòt listwa a jounal-la toujou la pou li.",
    tous: "Vwè tout awtik-la",
    histoire: "Listwa a Ouidah",
    voyage: "Kréyé vwayaj an mwen",
  },
  langue: { proposition: "Li jounal-la an kréyòl", aria: "Lang a jounal-la" },
  article: {
    retour: "Tout awtik-la",
    lireEn: "Li an",
    lies: "Adan menm kalité-la",
    cta: {
      titre: "Ouidah ka rakonté kò a-y pli bien asi plas.",
      texte: "Di nou sa ki ka atiré-w, nou ké konpozé vwayaj-la an rit a-w.",
      bouton: "Kréyé vwayaj an mwen",
    },
  },
};

export const blogSite: Record<LangueBlogSite, TexteBlog> = { FR, EN, ES, DE, PT, HT, GCF };

type CopieBlog = Omit<TexteBlog, "meta" | "liste" | "minutes" | "par" | "pages" | "vide"> & {
  meta: { titre: string; description: string; titreCategorie: string; titreArticle: string };
  liste: { tous: string; categorie: string };
  minutes: string;
  par: string;
  pages: Omit<TexteBlog["pages"], "page"> & { page: string };
  vide: Omit<TexteBlog["vide"], "categorie"> & { categorie: string };
};

/** Copies déjà traduites, y compris les messages variables : éditables sans code exécutable. */
export const copiesBlog = Object.fromEntries(LANGUES_BLOG_SITE.map((langue) => {
  const t = blogSite[langue];
  return [langue, {
    ...t,
    meta: { ...t.meta, titreCategorie: t.meta.titreCategorie("{categorie}"), titreArticle: t.meta.titreArticle("{titre}") },
    liste: { ...t.liste, categorie: "{categorie}" },
    minutes: t.minutes(987654321).replace("987654321", "{n}"),
    par: t.par("{nom}"),
    pages: { ...t.pages, page: t.pages.page(987654321, 987654322).replace("987654321", "{n}").replace("987654322", "{total}") },
    vide: { ...t.vide, categorie: t.vide.categorie("{categorie}") },
  }];
})) as Record<LangueBlogSite, CopieBlog>;

const remplir = (modele: string, valeurs: Record<string, string | number>) => modele.replace(/\{([a-z]+)\}/g, (repere, nom: string) => Object.hasOwn(valeurs, nom) ? String(valeurs[nom]) : repere);
export function texteBlog(copies: typeof copiesBlog, langue: LangueBlogSite): TexteBlog {
  const t = copies[langue];
  return {
    ...t,
    meta: { ...t.meta, titreCategorie: (categorie) => remplir(t.meta.titreCategorie, { categorie }), titreArticle: (titre) => remplir(t.meta.titreArticle, { titre }) },
    liste: { ...t.liste, categorie: (categorie) => remplir(t.liste.categorie, { categorie }) },
    minutes: (n) => remplir(t.minutes, { n }), par: (nom) => remplir(t.par, { nom }),
    pages: { ...t.pages, page: (n, total) => remplir(t.pages.page, { n, total }) },
    vide: { ...t.vide, categorie: (categorie) => remplir(t.vide.categorie, { categorie }) },
  };
}

/** Pages et liens fixes du blog. */
export const LIENS_BLOG = { liste: "/blog", histoire: "/ouidah/histoire", devis: "/devis" } as const;

const PREFIXE = /^(en|es|de|pt|ht|gcf)--(.+)$/;

/** Adresse d’un article : /blog/<slug> en français, /blog/<langue>--<slug> sinon. Un slug ne contient jamais « -- »
 * (règle de la base), le préfixe ne peut donc pas se confondre avec un slug. */
export const adresseArticle = (langue: LangueBlogSite, slug: string) => `${langue === "FR" ? "" : `/${langue.toLowerCase()}`}${LIENS_BLOG.liste}/${slug}`;

/** Segment d’adresse → langue et slug de l’article (l’inverse d’adresseArticle). */
export function lireSegment(segment: string): { langue: LangueBlogSite; slug: string } {
  const m = PREFIXE.exec(segment);
  return m ? { langue: m[1].toUpperCase() as LangueBlogSite, slug: m[2] } : { langue: "FR", slug: segment };
}

/** Adresse de la liste avec ses filtres (langue hors français, catégorie, page au-delà de la première). */
export function adresseListe(o: { langue?: LangueBlogSite; categorie?: string | null; page?: number }) {
  const q = new URLSearchParams();
  if (o.categorie) q.set("categorie", o.categorie);
  if (o.page && o.page > 1) q.set("page", String(o.page));
  const s = q.toString();
  const adresse = `${o.langue && o.langue !== "FR" ? `/${o.langue.toLowerCase()}` : ""}${LIENS_BLOG.liste}`;
  return s ? `${adresse}?${s}` : adresse;
}

export const estLangueBlogSite = (v: unknown): v is LangueBlogSite => typeof v === "string" && (LANGUES_BLOG_SITE as readonly string[]).includes(v);
