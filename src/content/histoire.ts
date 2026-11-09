// Page « L'histoire de Ouidah » (/ouidah/histoire) : texte v3 du 28/10/2026 (TEXTE-HISTOIRE-v3.md), faits vérifiés,
// la tradition dite comme telle, aucune source à l'écran. Images : /public/histoire (crédits dans credits-photos.ts).
// Tout le contenu de la page est ici : le composant n'écrit aucun texte lui-même.
import { DEVIS, adresseCircuit } from "./fr";

export type MediaHistoire = { src: string; largeur: number; hauteur: number; legende: string };
// document d'époque (hier) et/ou photo d'aujourd'hui ; temps = paragraphe illustré (sinon réparti dans l'ordre)
export type PieceHistoire = { hier: MediaHistoire | null; auj: MediaHistoire | null; temps?: number };
export type ChapitreHistoire = {
  id: string;
  repere: string; // période affichée dans le repère du haut
  court: string; // date de l'intertitre (4 à 6 caractères), dans l'ordre chronologique
  titre: string;
  ville: boolean; // plan de la ville (1926) ou carte du royaume (1747)
  temps: string[][]; // blocs de 1 ou 2 paragraphes
  chiffre?: { valeur: string; legende: string };
  legende?: { lettre: string; nom: string }[]; // lettres de la planche gravée (chapitre de la mer)
  etapes?: string[]; // stations de la Route des Esclaves
  pieces: PieceHistoire[];
};

export const histoireOuverture = {
  titre: "De Glexwé à Ouidah",
  texte:
    "En fon, la ville se nomme Glexwé, qu'on traduit souvent par « la maison des champs ». Les Européens ont noté de plusieurs façons le nom du royaume houéda dont elle dépendait : Whydah en anglais, Juda en français, Fida en néerlandais, Ajudá en portugais. Ouidah en vient. En 1681 déjà, un Anglais date une lettre « Agriffie in Whidaw » : Glexwé, au pays houéda.",
  noms: ["Glexwé", "Whydah", "Juda", "Fida", "Ajudá", "Ouidah"],
};

export const histoireChapitres: ChapitreHistoire[] = [
  {
    id: "avant",
    repere: "XVIIe siècle",
    court: "XVIIe",
    titre: "Avant les forts",
    ville: false,
    temps: [
      [
        "Au XVIIe siècle, Glexwé est la ville basse du royaume houéda, au nord d'une lagune. Le roi vit à Savi, une dizaine de kilomètres plus au nord. Longtemps dominé par son voisin Allada, le petit royaume s'en affranchit dans la seconde moitié du siècle.",
        "Quand les Européens s'installent, à la fin du siècle, l'essentiel des affaires se traite à Savi, près du palais. Les fouilles menées sur le site depuis 1991 n'ont trouvé briques hollandaises et porcelaine chinoise que dans l'enceinte royale, signe que le roi contrôlait le commerce.",
      ],
      [
        "Selon la tradition, les Houéda seraient venus de Tado, et leur premier roi, Haholo, aurait fondé Savi. La tradition donne à Glexwé un autre fondateur, Kpassè. Elle raconte qu'il ne serait pas mort comme un homme : il se serait changé en iroko. On vénère cet arbre dans la forêt sacrée de Kpassè, au quartier Tové, là où l'on situe le village d'avant les Européens.",
        "Un autre nom revient dans les récits : Kpate, qui aurait accueilli les premiers Européens. Il a toujours un culte à Ouidah.",
      ],
    ],
    pieces: [
      {
        hier: {
          src: "/histoire/plan-palais-savi-1747.webp",
          largeur: 1173,
          hauteur: 1313,
          legende: "Le palais du roi à Savi et les comptoirs européens, plan gravé en 1747",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/couronnement-roi-juida-1723.webp",
          largeur: 1100,
          hauteur: 847,
          legende: "Le couronnement du roi houéda, gravure du XVIIIe siècle",
        },
        auj: null,
      },
      {
        hier: null,
        auj: {
          src: "/histoire/raison-foret-kpasse.webp",
          largeur: 1200,
          hauteur: 674,
          legende: "La forêt sacrée de Kpassè, au quartier Tové",
        },
      },
    ],
  },
  {
    id: "forts",
    repere: "1671 – 1721",
    court: "1671",
    titre: "Les forts",
    ville: true,
    temps: [
      [
        "En 1671, la Compagnie française des Indes occidentales ouvre un comptoir dans le royaume houéda. C'est le premier établissement européen permanent. Les Anglais arrivent dans les années 1680. Le comptoir français est détruit pendant la guerre de 1692. Il revient en 1704 sous la forme d'un fort, que le corsaire Jean Doublet bâtit en quelques semaines, en terre et en chaume.",
        "José de Torres, négociant venu de Bahia, fonde en 1721 le fort portugais São João Baptista de Ajudá.",
      ],
      [
        "Au XVIIIe siècle, les forts anglais, français et portugais voisinent, à plusieurs kilomètres de la plage. Les Hollandais n'ont jamais eu de fort à Ouidah, les Danois non plus.",
        "Les Anglais abandonnent le leur en 1812. Le fort français est démoli en 1908. À sa place s'étend une esplanade où dansent, pendant les Vodun Days, les Zangbéto, gardiens de la nuit. Aujourd'hui, seul le fort portugais est encore debout.",
      ],
    ],
    pieces: [
      {
        hier: {
          src: "/histoire/fort-anglais-1727.webp",
          largeur: 1226,
          hauteur: 410,
          legende: "Le fort anglais, dit William's Fort, gravé en 1727",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/fort-francais-plan-1747.webp",
          largeur: 1330,
          hauteur: 1400,
          legende: "Plan du fort français, gravé en 1747",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/fort-portugais-gravure-1886.webp",
          largeur: 960,
          hauteur: 628,
          legende: "Le fort portugais, gravure de 1886",
        },
        auj: {
          src: "/histoire/eng-2-musee.webp",
          largeur: 1200,
          hauteur: 900,
          legende: "L'entrée du fort portugais, devenu musée d'histoire",
        },
      },
    ],
  },
  {
    id: "dahomey",
    repere: "1727",
    court: "1727",
    titre: "Le Dahomey",
    ville: false,
    temps: [
      [
        "En 1724, Agaja, roi du Dahomey, s'empare d'Allada. Début mars 1727, son armée prend Savi et la détruit, avec les comptoirs européens qui s'y trouvent. Hufon, dernier roi houéda, s'enfuit vers l'ouest avec une partie de son peuple, d'abord sur une île près de Grand-Popo. D'autres Houéda s'établissent à Porto-Novo et à Badagry.",
      ],
      [
        "Glexwé change de maître et de rôle. Le commerce avec les Européens s'y concentre, et la ville devient la principale place de traite du Dahomey. Un gouverneur s'y installe en 1733. Les Européens l'appellent le vice-roi.",
        "Plus tard, il portera le titre fon de yovogan, « chef des Blancs », que le royaume houéda employait déjà. Le poste revient toujours à un homme du pays. Les forts passent sous l'autorité du Dahomey : en juillet 1743, son armée attaque le fort portugais.",
      ],
    ],
    pieces: [
      {
        hier: {
          src: "/histoire/comptoirs-savi-1747.webp",
          largeur: 1400,
          hauteur: 948,
          legende: "Les comptoirs européens de Savi, gravés d'après des relevés de 1725, deux ans avant la chute de la ville",
        },
        auj: null,
      },
    ],
  },
  {
    id: "chacha",
    repere: "1800 – 1849",
    court: "1800",
    titre: "Le Chacha",
    ville: true,
    temps: [
      [
        "Francisco Félix de Souza, négrier venu du Brésil, vient une première fois sur la côte au début des années 1790 et s'y établit vers 1800. Il commence comme écrivain-comptable au fort portugais, le commande par intérim vers 1806, puis fait commerce à son compte.",
        "Brouillé avec le roi Adandozan, il est emprisonné à Abomey et s'évade vers Petit-Popo. De là, il soutient le coup d'État qui porte Ghézo au trône du Dahomey, probablement en 1818. Le nouveau roi fait de lui son agent commercial à Ouidah, où il revient vers 1820.",
      ],
      [
        "On le surnomme Chacha. L'origine du mot reste inconnue : une tradition la rattache au portugais « já, já », « tout de suite », qu'il aurait souvent dit. Il fonde au sud-ouest de la ville un quartier qui prendra plus tard le nom de Brésil, Blézin en fon. Sa famille, ses esclaves et ses clients y vivent.",
        "Un roman en a fait le « vice-roi de Ouidah ». Il ne l'a jamais été : la charge de yovogan revenait à un Dahoméen.",
      ],
      [
        "Il meurt à Ouidah le 8 mai 1849, lourdement endetté : il devait 80 000 dollars au roi Ghézo. Le roi choisit pour lui succéder son fils aîné, Isidoro. Le surnom devient alors un titre héréditaire, porté depuis par le chef de la famille de Souza.",
        "Sa tombe se trouve dans la concession familiale de Singbomey, derrière la place Chacha. Depuis 1999, une plaque donne ce nom à la place. Les textes officiels récents l'appellent aussi place aux Enchères.",
      ],
    ],
    pieces: [
      {
        hier: {
          src: "/histoire/portrait-de-souza.webp",
          largeur: 1164,
          hauteur: 1400,
          legende: "Portrait attribué à Francisco Félix de Souza, peint avant 1849",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/place-chacha-stele-2017.webp",
          largeur: 1400,
          hauteur: 933,
          legende: "La stèle « Place Chacha », en 2017",
        },
        auj: null,
        temps: 2,
      },
    ],
  },
  {
    id: "agudas",
    repere: "1835 – 1922",
    court: "1835",
    titre: "Les Agudas",
    ville: true,
    temps: [
      [
        "À partir de 1835, après la révolte des Malês à Bahia, des affranchis africains sont expulsés du Brésil ou poussés à partir. Beaucoup sont yoruba. À Ouidah, ils s'installent notamment au quartier Maro, à l'ouest du quartier Brésil, sous la protection de De Souza.",
        "Avec les familles de négociants portugais et brésiliens, et des familles africaines qui leur sont liées, ils forment les Agudas. Au XIXe siècle, le mot désigne les Portugais, Brésiliens compris ; il viendrait d'Ajudá. Certains Agudas, comme la famille de Souza, vivaient de la traite.",
      ],
      [
        "Leurs descendants portent des noms comme de Souza, da Silva, d'Almeida, Martins, Olympio ou Paraïso. Au Bénin, ils fêtent Nosso Senhor do Bonfim en janvier et dansent la bourian, une mascarade venue de Bahia.",
      ],
      [
        "Sur toute la côte, leurs maisons à étage, avec galeries, balustrades, persiennes et frontons ornés, rappellent les sobrados de Salvador. Au début du XXe siècle, ce style devient un signe de réussite. Des notables qui ne sont pas agudas l'adoptent aussi.",
        "La villa Ajavon en est un exemple. Son fronton porte l'inscription « VILLA AJAVON 1922 ». Elle a été bâtie pour Ajavon, un riche négociant venu du Togo voisin. Depuis le 11 novembre 2013, elle abrite le musée d'art contemporain de la Fondation Zinsou.",
      ],
    ],
    pieces: [
      {
        hier: null,
        auj: {
          src: "/histoire/maison-du-bresil.webp",
          largeur: 1120,
          hauteur: 1400,
          legende: "La Maison du Brésil, en 2024",
        },
        temps: 2,
      },
      {
        hier: null,
        auj: {
          src: "/histoire/villa-ajavon-1922.webp",
          largeur: 1400,
          hauteur: 1050,
          legende: "La villa Ajavon, datée de 1922, devenue musée de la Fondation Zinsou",
        },
        temps: 2,
      },
    ],
  },
  {
    id: "mer",
    repere: "Fin du XVIIe siècle – 1863",
    court: "1863",
    titre: "Jusqu'à la mer",
    ville: false,
    temps: [
      ["Selon les estimations des historiens, plus d'un million de personnes ont été déportées depuis Ouidah, de la fin du XVIIe siècle aux années 1860."],
      [
        "La ville est à environ quatre kilomètres de la mer, derrière une lagune. Les captifs étaient conduits à pied jusqu'à la plage. Des pirogues leur faisaient franchir la barre, ces rouleaux qui ferment la côte, jusqu'aux navires ancrés au large.",
      ],
      [
        "Ils partaient surtout pour le Brésil, Bahia en particulier, et pour les Antilles, notamment Saint-Domingue, l'actuelle Haïti. À la fin de la traite, ils partaient pour Cuba.",
        "Dans les années 1840, le commerce de l'huile de palme prend son essor, mais la traite continue. En janvier 1852, sous blocus britannique, le roi Ghézo signe un traité qui l'abolit. Il reste sans effet durable.",
      ],
      [
        "En mai 1860, la goélette Clotilda quitte Ouidah avec 110 captifs à bord. En juillet, elle accoste en secret près de Mobile, en Alabama. C'est le dernier navire négrier connu à avoir atteint les États-Unis.",
        "Le 10 octobre 1863, à Godomey, le vapeur Cicerón embarque pour Cuba environ 960 personnes, menées à pied depuis Ouidah. C'est le dernier embarquement transatlantique connu lié à Ouidah.",
      ],
    ],
    chiffre: {
      valeur: "Plus d’un million",
      legende: "de personnes déportées depuis Ouidah, de la fin du XVIIe siècle aux années 1860, selon les estimations des historiens",
    },
    legende: [
      {
        lettre: "A",
        nom: "Tentes des Européens",
      },
      {
        lettre: "B",
        nom: "Le rivage",
      },
      {
        lettre: "C",
        nom: "Navires en rade",
      },
    ],
    pieces: [
      {
        hier: null,
        auj: {
          src: "/histoire/bienvenue-3-plage-cocotiers.webp",
          largeur: 1200,
          hauteur: 795,
          legende: "La plage de Ouidah",
        },
      },
    ],
  },
  {
    id: "basilique",
    repere: "1903 – 2011",
    court: "1903",
    titre: "Le python et la basilique",
    ville: true,
    temps: [
      [
        "Dangbé, le python royal, est la divinité du royaume houéda. Il s'incarne dans des serpents vivants, gardés dans ses sanctuaires. Vers 1700, un marchand hollandais note que les serpents sont les premières divinités du royaume.",
      ],
      [
        "À Ouidah, son temple fait face à la basilique de l'Immaculée-Conception. L'église occupe le terrain de l'ancienne résidence du yovogan, cédé en 1901 à la mission catholique, arrivée à Ouidah en 1861.",
        "La première pierre est posée le 30 août 1903. Pour la bâtir, tous les quartiers de la ville portent du sable depuis la plage, adeptes du vodun compris. La cathédrale est consacrée le 9 mai 1909, devant quelque 4 000 personnes.",
      ],
      ["Elle devient basilique en 1989. Le 19 novembre 2011, Benoît XVI y signe Africae munus, son exhortation sur l'Église en Afrique."],
    ],
    pieces: [
      {
        hier: {
          src: "/histoire/procession-serpent-1725.webp",
          largeur: 1400,
          hauteur: 674,
          legende: "Procession au grand serpent pour le couronnement du roi, gravure publiée en 1730",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/temple-serpent-1930.webp",
          largeur: 1400,
          hauteur: 666,
          legende: "Le temple du serpent, vers 1930",
        },
        auj: {
          src: "/histoire/bienvenue-2-temple-pythons.webp",
          largeur: 1200,
          hauteur: 900,
          legende: "L'entrée du temple des Pythons",
        },
      },
      {
        hier: {
          src: "/histoire/basilique-1930.webp",
          largeur: 1003,
          hauteur: 1400,
          legende: "La cathédrale, vers 1930",
        },
        auj: {
          src: "/histoire/visite-basilique.webp",
          largeur: 800,
          hauteur: 1200,
          legende: "La basilique de l'Immaculée-Conception",
        },
      },
    ],
  },
  {
    id: "fort",
    repere: "1892 – 1990",
    court: "1961",
    titre: "Le fort qui brûle",
    ville: true,
    temps: [
      [
        "En 1892, Ouidah passe sous occupation française. Les Français fixent le chef-lieu à Porto-Novo, et le commerce se déplace vers le wharf de Cotonou. La ville décline peu à peu. Le fort portugais, lui, reste aux mains de Lisbonne.",
      ],
      [
        "Le Dahomey devient indépendant le 1er août 1960. Un an jour pour jour plus tard, il prend possession du fort, resté enclave portugaise. Avant de partir, les deux derniers fonctionnaires portugais y mettent le feu.",
        "En 1967, le fort accueille le Musée d'histoire de Ouidah. En 1975, le Dahomey prend le nom de Bénin. Restauré avec l'aide de la fondation portugaise Gulbenkian, le fort rouvre en août 1990. Sa réhabilitation, commencée en 2020, doit en faire le futur Musée international de la mémoire et de l'esclavage.",
      ],
    ],
    pieces: [
      {
        hier: {
          src: "/histoire/rue-1892.webp",
          largeur: 1216,
          hauteur: 665,
          legende: "Une rue de Ouidah, gravure de 1892",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/marche-1930.webp",
          largeur: 1400,
          hauteur: 1290,
          legende: "Le marché de Ouidah, vers 1930",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/fort-portugais-entree-1917.webp",
          largeur: 600,
          hauteur: 440,
          legende: "L'entrée du fort portugais, en 1917",
        },
        auj: {
          src: "/histoire/lieu-musee.webp",
          largeur: 1200,
          hauteur: 675,
          legende: "Les murs du fort portugais",
        },
      },
    ],
  },
  {
    id: "souvenir",
    repere: "1993 – 1998",
    court: "1993",
    titre: "Se souvenir",
    ville: true,
    temps: [
      [
        "Du 8 au 18 février 1993, la ville accueille le festival Ouidah 92, consacré aux arts et cultures vodun. Prévu pour 1992, il a gardé ce nom. Le président Nicéphore Soglo l'a voulu. Des prêtres et des visiteurs viennent notamment du Brésil, d'Haïti et de Trinité-et-Tobago.",
        "Pour l'occasion, la forêt de Kpassè reçoit des statues de divinités vodun et s'ouvre aux visiteurs non initiés.",
      ],
      [
        "Le parcours de la Route des Esclaves naît pendant ce festival. Six étapes, ponctuées de sculptures pour la plupart de Cyprien Tokoudagba, mènent de la place Chacha à la plage, sur environ trois à quatre kilomètres. En septembre 1994, l'UNESCO lance à Ouidah son programme « La Route de l'esclave », proposé par Haïti et des pays africains. Le 30 novembre 1995, la Porte du Non-Retour est inaugurée sur la plage, au bout du chemin.",
        "En 1998 naît une marche du repentir, à l'initiative du sociologue Honorat Aguessy. Le troisième dimanche de janvier, elle va de la place Chacha au mémorial Zomachi, pour demander pardon aux descendants des déportés.",
      ],
    ],
    pieces: [
      {
        hier: {
          src: "/histoire/plaque-ouidah92.webp",
          largeur: 933,
          hauteur: 1400,
          legende: "La plaque posée pour Ouidah 92 sur la place des Enchères, en 2017",
        },
        auj: null,
      },
      {
        hier: {
          src: "/histoire/memorial-zomachi-2017.webp",
          largeur: 1400,
          hauteur: 933,
          legende: "Le mémorial Zomachi, en 2017",
        },
        auj: null,
      },
    ],
  },
  {
    id: "fete",
    repere: "1996 – 2026",
    court: "2024",
    titre: "La fête de janvier",
    ville: true,
    temps: [
      [
        "En fon, vodun veut dire « divinité, esprit ». Le mot a donné vodou, en Haïti. Le 10 janvier 1996, le gouvernement de Nicéphore Soglo fait de cette journée une fête chômée et payée, en hommage au vodun et aux religions traditionnelles. Une loi d'août 1997 en fait une fête annuelle.",
        "Pendant des années, la cérémonie officielle du 10 janvier se tient sur la plage de Ouidah, près de la Porte du Non-Retour.",
      ],
      [
        "En octobre 2023, le gouvernement crée les Vodun Days, pour ouvrir la fête à un public venu du monde entier. La première édition a lieu à Ouidah les 9 et 10 janvier 2024, sur cinq sites : la place Maro, l'esplanade du Fort français, la place du temple des Pythons, un couvent éphémère de Mami et la forêt de Kpassè. On compte près de 100 000 personnes sur les deux grandes soirées.",
        "Depuis la loi du 2 septembre 2024, la fête tombe le deuxième vendredi de janvier. Les éditions 2025 et 2026 durent trois jours.",
      ],
    ],
    pieces: [
      {
        hier: null,
        auj: {
          src: "/histoire/collage-vodun-days-2024.webp",
          largeur: 1200,
          hauteur: 675,
          legende: "Danseuses devant le public des Vodun Days 2024, à Ouidah",
        },
        temps: 1,
      },
      {
        hier: null,
        auj: {
          src: "/histoire/collage-zangbeto-meko.webp",
          largeur: 1200,
          hauteur: 801,
          legende: "Des Zangbéto aux Vodun Days 2026, au village de Mèkô, commune de Ouidah",
        },
        temps: 1,
      },
    ],
  },
  {
    id: "route",
    repere: "1993 – 2025",
    court: "2025",
    titre: "La Route, étape par étape",
    ville: true,
    temps: [
      [
        "Les récits contés aux étapes relèvent de la tradition. Le trajet des captifs jusqu'à la mer, lui, est un fait établi.",
        "La Route part de la place Chacha, aussi appelée place aux Enchères. Une plaque posée en 1993 affirme que les captifs y étaient vendus aux enchères, sous un grand arbre. Les témoignages de l'époque décrivent autre chose : le prix des captifs était fixé par le roi, et les ventes passaient par ses agents et par les maisons des négociants, comme celle des de Souza, qui borde la place. Réaménagée récemment, la place est aujourd'hui une esplanade pavée.",
      ],
      [
        "Vient ensuite l'Arbre de l'oubli. Selon la tradition racontée aux visiteurs, les hommes devaient en faire neuf fois le tour, les femmes sept fois, pour oublier leur pays. Ce récit n'apparaît dans aucun écrit avant les années 1990. Les textes anciens appellent ce lieu l'Arbre des capitaines : les chefs de Ouidah y recevaient les Européens et en faisaient trois fois le tour. L'arbre d'origine a disparu.",
      ],
      [
        "La case Zomaï porte un nom qui signifierait « là où le feu, ou la lumière, n'entre pas ». La tradition y place des captifs enfermés dans le noir. Des écrits plus anciens rattachent ce nom aux réserves de poudre de De Souza.",
      ],
      ["À Zoungbodji se dresse un mémorial. Selon la tradition, les captifs morts avant le départ auraient été enterrés à cet endroit."],
      [
        "Plus loin, l'Arbre du retour. La tradition dit que les captifs en faisaient trois fois le tour, pour que leur âme revienne en Afrique après leur mort. Aucune source d'époque ne mentionne ce rite. Sa statue est de Cyprien Tokoudagba.",
      ],
      [
        "Le chemin finit sur la plage, à la Porte du Non-Retour. C'est un monument : les captifs ne partaient pas d'un point précis, mais de la plage, en pirogue. L'arche de 1995 a été remplacée. Dévoilée en décembre 2025, la nouvelle Porte s'élève à plus de seize mètres et porte plus de deux cents sculptures.",
        "Depuis 2021, la place, le fort portugais, les sites de Zoungbodji et la plage de la Porte figurent sur la liste indicative du Bénin à l'UNESCO, préalable à une éventuelle inscription au patrimoine mondial.",
      ],
    ],
    etapes: ["Place Chacha", "Arbre de l'oubli", "Case Zomaï", "Zoungbodji", "Arbre du retour", "Porte du Non-Retour"],
    pieces: [
      {
        hier: {
          src: "/histoire/place-chacha-2017.webp",
          largeur: 1400,
          hauteur: 933,
          legende: "La place en 2017, avec son grand arbre et la stèle « Place Chacha »",
        },
        auj: {
          src: "/histoire/place-chacha-2025.webp",
          largeur: 1400,
          hauteur: 787,
          legende: "La place réaménagée, en janvier 2025",
        },
      },
      {
        hier: {
          src: "/histoire/arbre-oubli-2015.webp",
          largeur: 768,
          hauteur: 1024,
          legende: "La sculpture de l'Arbre de l'oubli, posée pour Ouidah 92, en 2015",
        },
        auj: null,
      },
      {
        hier: null,
        auj: {
          src: "/histoire/case-zomai-2019.webp",
          largeur: 809,
          hauteur: 1400,
          legende: "La stèle de la case Zomaï, inaugurée en février 1993 (photo de 2019)",
        },
      },
      {
        hier: null,
        auj: {
          src: "/histoire/visite-zoungbodji.webp",
          largeur: 1200,
          hauteur: 1200,
          legende: "Le mémorial de Zoungbodji",
        },
      },
      {
        hier: null,
        auj: {
          src: "/histoire/raison-arbre-du-retour.webp",
          largeur: 800,
          hauteur: 1200,
          legende: "L'Arbre du retour et sa statue (photo de 2017)",
        },
      },
      {
        hier: {
          src: "/histoire/porte-1995.webp",
          largeur: 1280,
          hauteur: 866,
          legende: "L'arche de 1995, photographiée en 2019",
        },
        auj: {
          src: "/histoire/eng-5-porte-jour.webp",
          largeur: 675,
          hauteur: 1200,
          legende: "La nouvelle Porte du Non-Retour, dévoilée en décembre 2025",
        },
      },
    ],
  },
  {
    id: "aujourdhui",
    repere: "Aujourd'hui",
    court: "2027",
    titre: "Revenir",
    ville: true,
    temps: [
      [
        "Depuis la loi du 2 septembre 2024, un Afro-descendant dont un ancêtre a été déporté pendant la traite peut demander la nationalité béninoise. La preuve peut passer par l'état civil, des documents officiels, des témoignages ou un test ADN, qui n'est pas obligatoire. La nationalité est accordée par décret, sous conditions, et se transmet aux descendants.",
      ],
      ["En 2027, les Vodun Days se tiennent du 2 au 9 janvier. La fête des religions traditionnelles tombe le vendredi 8."],
    ],
    pieces: [
      {
        hier: null,
        auj: {
          src: "/histoire/collage-egungun-vodun-days.webp",
          largeur: 800,
          hauteur: 1200,
          legende: "Un Egungun pendant les Vodun Days",
        },
        temps: 1,
      },
      {
        hier: null,
        auj: {
          src: "/histoire/visite-cite-historique.webp",
          largeur: 1200,
          hauteur: 675,
          legende: "L'entrée de la cité historique de Ouidah",
        },
        temps: 0,
      },
    ],
  },
];

export const histoireFinale = {
  titre: "La Route des Esclaves se fait à pied, de la place Chacha jusqu'à la plage.",
  texte: "Six étapes, sur environ trois à quatre kilomètres.",
};

// libellés de l'interface de la page
export const histoirePage = {
  metaTitre: "L'histoire de Ouidah — Ouidah Heritage Tour",
  metaDescription:
    "De Glexwé à Ouidah : les forts, le Dahomey, le Chacha et les Agudas, la traite jusqu'à la mer, la basilique, la Route des Esclaves étape par étape, la nouvelle Porte du Non-Retour et les Vodun Days.",
  defiler: "Faites défiler",
  hier: "Hier",
  avant: "Avant",
  aujourdhui: "Aujourd'hui",
  etape: (n: number, total: number, nom: string) => `Étape ${n}/${total} · ${nom}`,
  chapitres: "Chapitres",
  cartes: {
    royaume: { src: "/histoire/carte-lune.webp", largeur: 3146, hauteur: 2421 },
    ville: { src: "/histoire/ville-1926-lune.webp", largeur: 2400, hauteur: 2118 },
  },
  photoFin: "/histoire/fin-porte-nuit.webp",
  // fond sonore (Kevin, 29/10) : chant enregistré dans une maison souterraine d'Agongointo, Bohicon (2016, domaine public),
  // boucle de 92 s calée à -20 LUFS ; volume de lecture 0,3 (environ -10 dB), montée en 4 s, départ dès que le navigateur l'autorise.
  // Opus (WebM) d'abord, AAC ensuite pour Safari : certains antivirus (Avast, constaté le 29/10) vident les réponses audio/*.
  son: { sources: ["/son/histoire-bohicon.webm", "/son/histoire-bohicon.m4a"], volume: 0.3, fondu: 4 },
  carteRoyaume: "Carte du royaume de Whidah, gravée au XVIIIe siècle",
  carteVille: "Plan de Ouidah en 1926",
  appel: {
    principal: { label: "Suivre la Route des Esclaves, à pied", href: adresseCircuit("route-des-esclaves") },
    secondaire: { label: "Composer mon voyage", href: DEVIS.voyage },
  },
};
