# Momentum

Outil de publication et d'analyse multi-réseaux pour créateurs de contenu.

**Statut : dépôt neuf, outil personnel, un seul utilisateur (le fondateur).**
Pas de clients, pas de paiements, pas d'inscription, pas de compte à créer.
Objectif de cette phase : un outil que le fondateur utilise vraiment, tous les
jours, sur ses propres comptes. L'ouverture à d'autres utilisateurs viendra
après, et seulement après.

Tu réponds et tu écris l'interface en **français**.

---

## Les six chantiers, dans l'ordre

Un chantier = une session = un déploiement. On ne commence pas le suivant tant
que le précédent n'est pas vérifié par le fondateur sur ses vrais comptes.

1. **Connexion YouTube.** OAuth sur le seul compte YouTube, en mode
   développement. Un écran Réglages qui montre : connecté ou non, date
   d'expiration du jeton, dernière erreur reçue. Plus un verrou d'accès à
   l'entrée de l'application — un mot de passe unique en variable
   d'environnement, le plus simple qui tienne. Un seul chemin OAuth à faire
   marcher avant d'en dupliquer trois.
2. **Publier sur YouTube.** Une vidéo part de l'application et arrive sur la
   vraie chaîne.
3. **Connecter puis publier sur les trois autres** (Instagram, Facebook,
   TikTok) — un réseau par session, jamais deux.
4. **Lire les statistiques d'un seul réseau**, avec une fenêtre honnête.
5. **Lire les trois autres**, un à la fois.
6. **Écran d'ensemble.** Audience globale et répartition par réseau.

**Chantier en cours : le n°1.** Les cinq autres ne se préparent pas, ne
s'anticipent pas, ne se « rendent pas plus faciles pour plus tard ».

**Critère de fin, à chaque fois :** pas « c'est déployé », mais « le fondateur
ouvre l'écran et voit son vrai chiffre dedans ».

### Hors périmètre — ne pas coder, ne pas préparer, ne pas suggérer

Programmation / publication différée (chantier à part entière : exécuteur de
tâches, reprises sur erreur, état par publication) · jardin, ville, terrain ·
XP, ligues, classements · mascotte Baro · le Brain et l'analyse IA · recyclage
de catalogue · analyse de commentaires · mode calme · paiements · comptes
multi-utilisateurs · agrégateur tiers (Upload.post, Ayrshare) · soin du design

`IDEAS.md` contient ces idées. Elles sont différées, pas abandonnées. Si une
tâche semble en avoir besoin, **arrête-toi et demande**.

---

## Connaissance déjà payée — à ne pas redécouvrir

Reprise de la version précédente. À copier plutôt qu'à réécrire :

- le code des providers (particularités de chaque API plateforme)
- le test qui vérifie que tout `var(--x)` correspond à un jeton déclaré

Les sondes de diagnostic de l'ancien dépôt — **quatre et non trois** (jeton,
Pages, vues, historique) — **ne se copient pas** : elles sont toutes Meta, elles
tronquent leur sortie à 300 caractères au lieu de montrer la réponse brute, et
aucun test ne les couvre. Ce qu'on en reprend est une idée, pas du code :
**accordé / refusé / jamais demandé** — trois états, jamais deux.

Pièges de plateforme déjà rencontrés, à traiter comme acquis :

- Meta : la période `days_28` est incompatible avec la mesure `views`. C'est la
  période le problème, pas le nom de la mesure.
- Meta : une Page peut renvoyer une liste vide avec un statut 200 et aucune
  erreur, parce qu'elle a été déplacée dans un portefeuille — invisible sans la
  permission `business_management`.
- Meta : sans intervalle explicite, `follower_count` ne renvoie que 2 jours.
- TikTok : l'audit est requis avant toute publication publique ; sans lui, les
  publications sortent en visibilité restreinte.
- Snapchat : aucune API de publication publique. Ne pas chercher.

---

## Stack et commandes

- Framework : **Vite** (interface React) + un **serveur Node/Express séparé**,
  base reprise de l'ancien dépôt. Pas de Next.js. — Hébergement : Render
- Base de données : **PostgreSQL dès maintenant**, jamais SQLite. Sur Render le
  disque est effacé à chaque redéploiement : des jetons stockés en local
  seraient perdus, et il faudrait reconnecter les réseaux à chaque mise en
  ligne.
- `CLE_CHIFFREMENT` : générée une seule fois, conservée dans le gestionnaire de
  mots de passe du fondateur, **identique partout** — local et production. Une
  clé qui change oblige à tout reconnecter.
- Gestionnaire de paquets : **npm** (Node ≥ 22.11).

```
npm run dev      # lancer en local (interface + serveur ensemble)
npm test         # lancer les tests
npm run lint
npm run build
```

## Architecture

- La logique métier ne vit jamais dans un composant d'affichage.
- Toute plateforme passe par une **interface commune de providers**. Aucun appel
  direct à une API plateforme depuis une page ou un composant. C'est ce qui rend
  l'ajout d'un réseau indolore.
- Les secrets sont en variables d'environnement, jamais dans le code.

---

## Règles de code — issues de défauts réellement vécus

1. **Trois états, jamais deux :** *mesuré* / *mesuré à zéro* / *pas mesuré*.
   Aucune fonction ne transforme le troisième en deuxième. Attention à
   `Number(null)` qui vaut `0` et passe `Number.isFinite`. Une valeur non
   mesurée affichée « 0 » est un mensonge, pas un affichage.
2. **Ne jamais mentir sur la fenêtre.** Si un compte n'a que 4 jours
   d'historique, l'écran affiche « 4 jours mesurés », jamais « 0 sur 30 jours »
   et jamais un remplissage inventé. On n'invente pas des jours qui n'existent
   pas.
3. **Toute grandeur porte sa fenêtre**, écrite à côté d'elle — pas dans un titre
   trois blocs plus haut.
4. **Stock et flux ne se croisent jamais.** Un stock (abonnés, nombre de vidéos)
   se lit à une date. Un flux (vues, j'aime, commentaires) n'existe que rapporté
   à une période. Ils ne se somment pas, ne se comparent pas, ne partagent pas
   une colonne. Une répartition d'audience en part d'abonnés et une répartition
   en part de vues sont **deux graphiques différents**.
5. **Aucun `catch` vide.** Un refus d'API avalé produit un chiffre faux au lieu
   d'une absence. Toute erreur atterrit dans un état lisible depuis les Réglages.
6. **Une erreur partielle reste une erreur.** Si un réseau sur quatre répond, les
   trois silences restent visibles.
7. **Un test pour chaque défaut réparé**, citant le symptôme vécu.
8. **Aucun fichier ne dépasse 300 lignes.**
9. **Aucune nouvelle dépendance sans demander.**
10. **Aucun refactor spontané, aucune suppression de fichier** sans me le dire
    explicitement avant.
11. **Ne pas répéter le même chiffre sur un écran.**

---

## Protocole de travail

**Une session = un chantier.** Pas une session par journée. Chantier déployé =
session neuve. L'état se transmet par un fichier du dépôt, jamais par la mémoire
de la conversation. Quand le contexte approche du compactage, tu t'arrêtes et tu
écris l'état — tu ne continues pas à modifier des fichiers que tu ne peux plus
relire entièrement.

**Fin de chantier = `ETAT.md`.** À la racine, réécrit à la fin de chaque
chantier : ce qui est fait, ce qui reste, les pièges rencontrés. C'est ce
fichier que lit la session suivante — elle ne lit pas la conversation.

**La donnée avant l'écran.** Aucun bloc d'interface construit tant qu'un chiffre
réel n'y est pas passé.

**L'instrument avant l'hypothèse.** Dès qu'un système extérieur répond « rien »
sans erreur, tu construis la sonde qui montre sa réponse brute. Aucune hypothèse
avant. La sonde envoie **exactement les mêmes paramètres que le moteur** — un
instrument qui ne mesure pas la même chose que le produit ment.

**Un correctif, un déploiement.** Jamais un lot.

**Ne jamais faire tester une hypothèse au fondateur.** Une seule action à la
fois, et seulement quand elle est décisive.

**Plan mode avant de coder.** Fichiers touchés, modèle de données, questions
ouvertes. Tu attends validation. Aucune ligne avant.

**Vérification.** Tu ne dis jamais « c'est bon » ni « ça devrait marcher ». Tu
lances la commande et tu **colles la sortie réelle**. Si tu n'as pas exécuté,
ce n'est pas fait.

**Explorer sans saturer.** Pour lire du code ou une documentation, utilise un
sous-agent. Ne charge pas ces recherches dans le contexte principal.

**Le fondateur ne sait pas coder.** Explique en français, en une ou deux
phrases, ce que fait le code non évident et pourquoi. Quand il demande une
explication, tu t'arrêtes et tu expliques avant d'avancer. Une relation de
travail saine, pas une démonstration.

**Corriger ne veut pas dire vider.** Une courbe fausse rendue vide n'est pas
réparée.

**Quand ça bloque.** Deux tours en rond sur le même problème : tu t'arrêtes et
tu dis ce que tu ne comprends pas. Tu ne sèmes pas de sondes au hasard dans le
code.
