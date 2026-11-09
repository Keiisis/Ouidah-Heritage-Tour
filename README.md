# Ouidah Heritage Tour

Site public et espaces équipe d’Ouidah Heritage Tour : circuits, événements,
boutique, demandes de devis, paiements, documents, suivi client et administration.
Le site gère sept langues et des contenus modifiables depuis l’administration.

## Installation

Node.js 24.x et npm sont requis.

```sh
npm ci
```

Le script `postinstall` prépare le worker MapLibre et le correctif de redirection
pour la version Next.js verrouillée. Le worker généré reste exclu de Git.
Copier `.env.example` vers `.env.local` et renseigner uniquement les services
nécessaires. Ne jamais ajouter `.env.local` au dépôt.

```sh
npm run dev
```

Le site démarre sur `http://localhost:3000`. Sans les identifiants de services,
les fonctions concernées restent indisponibles. Une compilation réussie ne prouve
pas que les comptes fournisseurs sont configurés.

## Organisation

- `src/app` : pages françaises, pages par langue et routes HTTP.
- `src/components` : interface publique, suivi client, espaces agents et administrateurs.
- `src/content` et `src/lib/contenu*` : contenus initiaux, schémas et lecture du contenu éditable.
- `src/lib/serveur` : accès aux données, sessions, paiements, documents, traductions et services.
- `supabase/migrations` : migrations ordonnées par `supabase/migrations.manifest.json`.
- `public` : ressources nécessaires au site ; licences des polices conservées à côté des fichiers.
- `scripts` : préparation technique, vérification et opérations explicites.
- `tests` : tests métier portables, exécutés sans identifiants réels dans des processus isolés.

## Vérifications

```sh
npm test
npm run test:livraison
npm run lint
npm run build
```

Les tests inclus couvrent les paiements, la fiscalité, le connecteur e-MECeF et le
contrôle de configuration. Les recettes navigateur, PDF et PostgreSQL complètes
sont conservées dans le dossier de validation privé de l’équipe ; elles ne sont
pas exécutées par `npm test`.

Le workflow GitHub lance ces contrôles et vérifie le contenu indexé. Il n’exécute
ni migration distante, ni émission fiscale, ni envoi de courriel, ni déploiement.

## Préparer un commit

Installer les gardes sur chaque clone :

```sh
npm run git:gardes
npm run livraison:verifier
```

Le second contrôle porte sur **tout l’index Git**, pas seulement sur le diff.
Il refuse les documents privés, les secrets détectés, les liens symboliques,
les sous-modules et les fichiers trop volumineux. Les messages masquent les
valeurs. Un scanner de secrets indépendant complète ce garde avant livraison.
Les cartes Floorplan/Graphify, notes d’agents, rapports et documents clients restent locaux.

## Production

Les variables attendues et leurs usages figurent dans `.env.example`.

```sh
npm run production:verifier -- --local
```

Cette commande vérifie les réglages sans contacter les fournisseurs et n’affiche
pas les valeurs sensibles. Elle échoue si une configuration obligatoire manque.
Appliquer les migrations selon le manifeste avec le protocole opérateur validé,
puis renseigner les variables dans l’environnement Vercel approprié et effectuer
la recette des services réels avant mise en service.

Le connecteur e-MECeF utilise un environnement de test par défaut. La production
exige l’approbation DGI et une autorisation explicite côté serveur. Le parcours
actuel couvre les factures sur devis et leurs avoirs intégraux.

`npm run boutique:graine` est un ancien outil opérateur dépendant du catalogue
privé de maquettes sur le poste d’origine. Il réécrit des articles d’exemple.
Il ne fait partie ni de l’installation, ni de la compilation, ni du déploiement.
