# État — fin de la session de socle

Dernière mise à jour : chantier 1 **non commencé**. Aucune ligne de code écrite,
aucun fichier recopié depuis l'ancien dépôt. Cette session a servi à poser les
fichiers de cadrage et à faire l'inventaire de ce qui est réutilisable.

---

## 1. Où en est le dépôt

Fait :

- `CLAUDE.md`, `IDEAS.md`, `.env.example` posés à la racine.
- Décisions inscrites dans `CLAUDE.md` : chantier 1 réduit à **YouTube seul**,
  PostgreSQL dès maintenant, `CLE_CHIFFREMENT` stable partout, verrou d'accès
  par mot de passe unique, npm, Vite + serveur séparé.

Pas fait : tout le reste. Pas de projet, pas de `package.json`, pas de code.

---

## 2. L'ancien dépôt

`Twaylo/momentum`, branche `main`, commit `860a4b9`. Version 2.0.0, en
production. **Vite + React + un serveur Express séparé**, npm, Node ≥ 22.11.
C'est cette base qu'on garde — le nouveau dépôt n'est pas en Next.js.

Pour y accéder depuis une session neuve : demander le rattachement du dépôt,
puis le cloner. Ne pas le réécrire de mémoire.

Trois morceaux ont été lus, et trois seulement : les providers/OAuth, les sondes
de diagnostic, le test des jetons de style. Plus `docs/retour-v2.md`. Le reste de
l'ancien dépôt n'a pas été ouvert.

---

## 3. Ce qu'on a trouvé — le chemin OAuth

**La bonne idée à garder :** ce qui diffère d'une plateforme à l'autre est écrit
en **données**, pas en code. Un seul objet `oauthConnecteur` sert six réseaux ;
leurs particularités vivent dans une table (`noyau/oauth-reseaux.js`). C'est ce
qui rendra l'ajout d'Instagram, Facebook et TikTok indolore plus tard.

**Le piège :** le fichier d'aiguillage `server/connecteurs/index.js` importe
l'agrégateur tiers (1 900 lignes) et le module d'analytique. Le prendre ferait
entrer tout le produit dans un dépôt neuf. Le connecteur OAuth lui-même, lui, ne
dépend de rien de tout ça.

**Le meilleur fichier du lot :** `noyau/oauth.js` (251 lignes, zéro import).
Mécanique pure : construction de l'URL d'autorisation, échange du code contre un
jeton, rafraîchissement, comparaison d'état en temps constant.

**La fonction la plus précieuse :** `etatDe()` dans `server/comptes-sociaux.js`
(lignes 62-139). Elle traduit un jeton rangé en état affichable, et elle porte
déjà un correctif payé : un jeton Google, qui dure une heure, s'affichait
« à renouveler » dès la seconde de la connexion. Elle est pure et testée.

---

## 4. Ce qu'on a trouvé — les sondes

**Il y en a quatre, pas trois.** `docs/retour-v2.md` écrit « trois sondes
(jeton, Pages, vues, historique) » — le mot dit trois, la parenthèse en nomme
quatre. `CLAUDE.md` répète l'erreur. La sonde oubliée est « vues Instagram ».

Les quatre vivent dans un seul fichier, `server/routes-diagnostic.js`
(586 lignes), exposées par une route `GET /api/diagnostic/moteur`.

**Elles ne tiennent pas la promesse du projet.** La règle dit : la sonde montre
la réponse brute, et envoie exactement les mêmes paramètres que le moteur. Or :

- Les quatre sondes Meta n'affichent **jamais** le corps brut. Le mécanisme
  existe dans le fichier, mais elles sont appelées sans lui : elles ne rendent
  qu'un résumé fabriqué à la main, **tronqué à 300 caractères**.
- Trois des quatre **refont leurs propres appels** au lieu de passer par le
  moteur. La sonde « historique » recopie l'intervalle de 29 jours à la main, à
  deux endroits différents. Les deux peuvent diverger sans que rien ne le dise —
  exactement la panne que la règle voulait empêcher.
- **Aucun test ne couvre ces quatre sondes.**
- Elles ne sont pas purement lectrices : consulter un jeton peut déclencher un
  renouvellement et **écrire en base**.

**Pour le chantier 1, elles ne servent presque à rien.** Les sondes Pages, vues
et historique sont à 100 % Meta/Instagram. La sonde « jeton » est Meta elle
aussi : elle lit les autorisations accordées, **pas** la validité ni la date
d'expiration, et il n'existe **aucun équivalent Google** dans l'ancien dépôt.

Ce qu'il faut en retenir, ce n'est donc pas du code, c'est une idée : distinguer
*accordé* / *refusé* / *jamais demandé* — trois états, jamais deux.

**Décision du fondateur : aucune sonde n'est copiée.** Elles sont Meta
uniquement, tronquées à 300 caractères, sans test — non réutilisables telles
quelles. Le chantier 1 en écrit une neuve pour Google.

Une pièce reste bonne : `noyau/diagnostic.js` (195 lignes), pur, sans réseau ni
base. Bon modèle de « des faits entrent, un verdict sort ». Son contenu actuel
parle de l'agrégateur et ne sert pas tel quel.

---

## 5. Le test des jetons de style

`src/theme/jetons-utilises.test.js`, 72 lignes. Il vérifie que chaque
`var(--x)` employé dans le CSS correspond à un jeton réellement déclaré. Il
n'utilise que Node — pas de navigateur, pas de Playwright, aucun import du
produit. **Exécuté pour vérifier : 1 test passé, 186 ms.**

Il est recopiable tel quel. Deux précautions, de placement seulement : il balaie
le dossier **au-dessus de lui** (le poser dans `src/theme/`, pas à la racine), et
il n'exclut pas `node_modules`. Sur un dépôt sans CSS, il passe sans rien dire.

Origine du test : un jeton `--t-titre` employé quatre fois et jamais déclaré. Un
jeton inconnu ne casse rien et n'apparaît dans aucun outil — la propriété est
simplement ignorée. Résultat : les chiffres avaient la taille de leurs libellés.

---

## 6. `docs/retour-v2.md` — ce qu'il contient, et ce qu'il ne contient pas

Post-mortem de 209 lignes écrit après une session de douze heures. C'est la
source de la plupart des règles de code de `CLAUDE.md` : trois états, fenêtres
honnêtes, stock et flux séparés, aucun `catch` vide, un test par défaut réparé.

**Il ne parle pas d'OAuth.** Ni des jetons de connexion, ni de leur expiration,
ni de la reconnexion, ni de Render, ni de la base de données. Zéro occurrence. Le
document porte sur l'**affichage des statistiques** — donc sur le chantier 4, pas
sur le chantier 1.

Sa phrase la plus utile : « À chaque fois où une sonde existait, la cause a été
trouvée en une lecture. À chaque fois où j'ai supposé, ça a coûté quatre
allers-retours. »

La connaissance sur les dossiers de validation des plateformes est probablement
dans `docs/dossiers-plateformes.md`, qui n'a pas été ouvert.

---

## 7. Ce qu'on reprend — validé par le fondateur

On reprend **le chemin OAuth** et **le test des jetons de style**. On laisse
l'aiguilleur des connecteurs et les routes. Aucune sonde n'est copiée.

Ordre de grandeur : **environ 1 100 lignes**, réparties en 9 à 10 fichiers, tous
sous 300 lignes. Environ 700 lignes se recopient presque telles quelles.

Presque tel quel :

| Fichier de l'ancien dépôt | Lignes | Adaptation |
|---|---|---|
| `noyau/oauth.js` | 251 | aucune |
| `server/chiffrement.js` | 124 | aucune (AES-256-GCM) |
| `noyau/oauth-reseaux.js` | 273 | **ne garder que YouTube** → ~50 |
| `server/oauth/identite.js` | 206 | ne garder que YouTube → ~70 |
| `server/connecteurs/oauth.js` | 189 | retirer les branches Meta → ~170 |
| `server/oauth/flux.js` | 314 | retirer Meta → ~255, repasse sous 300 |
| `server/oauth/attente.js` | 143 | adapter à PostgreSQL |
| `server/config.js` | 96 | ne garder que YouTube → ~25 |
| `noyau/oauth.test.js` | 415 | **à couper en deux** (règle des 300) |
| `src/theme/jetons-utilises.test.js` | 72 | aucune |

À réécrire en s'inspirant, pas à copier :

- `etatDe()` et `versVue()` de `server/comptes-sociaux.js` (lignes 62-182) —
  ~150 lignes utiles sur 747. `versVue()` garantit qu'aucun jeton ne sort dans
  une réponse HTTP.
- Les deux routes `demarrer` et `retour` de `server/routes-connexions.js`
  (~80 lignes sur 717).
- Les migrations `004-comptes-sociaux.sql` et `017-oauth-attente.sql`.

**À ne pas reprendre :** `server/connecteurs/index.js` et
`server/routes-connexions.js` en entier (ils tirent tout le produit), tout
`server/publisher/`, tout `server/insights/`, `server/catalogue-direct/`,
`server/agregateur/`, `noyau/youtube.js` (c'est de la publication, pas de la
connexion), et les quatre sondes Meta.

**À écrire de neuf : une sonde Google.** Aucune sonde de l'ancien dépôt ne sert
(voir §4). Le chantier 1 en demande une, et elle doit tenir la règle que les
anciennes ne tenaient pas : montrer la **réponse brute** de la plateforme, pas un
résumé, et envoyer **exactement les mêmes paramètres que le moteur**.

---

## 8. Pièges déjà payés, à ne pas redécouvrir

- **Google ne rend un jeton de rafraîchissement que si la demande porte
  `access_type=offline` et `prompt=consent`.** Sans eux, la connexion se coupe
  au bout d'une heure sans explication. Les deux sont présents dans le
  descripteur YouTube de l'ancien dépôt.
- **Un jeton Google dure une heure.** Un affichage naïf le déclare « à
  renouveler » immédiatement. C'est le bug que corrige `etatDe()`.
- **L'adresse de retour OAuth est comparée caractère par caractère** par les
  plateformes. Une barre finale en trop suffit, et le message d'erreur ne dit pas
  laquelle des deux versions est fausse.
- L'ancien dépôt gère **deux bases à la fois** (SQLite et PostgreSQL). Le
  nouveau est **PostgreSQL seulement** : tout code recopié qui touche la base est
  à simplifier, pas à transposer.

---

## 9. État des dossiers de validation, par plateforme

Source : `docs/dossiers-plateformes.md` (284 lignes, daté du 13 août 2026) et
`docs/decisions.md` (694 lignes). Rien d'autre n'a été lu sur ce sujet.

**Aucun dossier n'est déposé.** Les deux documents sont écrits au futur : chaque
section s'intitule « ce qu'il faut faire » et se termine par « ce qu'il me faut
de toi ». Aucune date de dépôt, aucun accusé de réception, aucun refus.
`decisions.md` conclut : « Le code attend ; c'est l'unique chose qu'il ne peut
pas faire à notre place. »

**Un écart à lever.** Le fondateur a indiqué que les applications développeur
existent (Google en mode test, Meta pour Facebook et Instagram). Les documents,
eux, les décrivent comme restant à créer. Ils datent du 13 août, soit deux jours
avant cette session : elles ont pu être créées depuis. Ce sont les consoles qui
tranchent, pas ces documents. Preuve pratique : si un `GOOGLE_CLIENT_ID` est en
main, l'application existe.

| Plateforme | Dossier | Délai annoncé | Verrou principal |
|---|---|---|---|
| YouTube | à déposer | 4 à 6 semaines | portées sensibles : vidéo de démonstration + politique de confidentialité en ligne |
| TikTok | à déposer | 2 à 4 semaines | audit Content Posting API |
| Meta (FB + IG) | à déposer, **un seul pour les deux** | 2 à 6 semaines | App Review |
| X | **pas de dossier** | immédiat | un abonnement à ~100 $/mois, à décider |
| LinkedIn | à déposer | long et variable | programme partenaire + Page d'entreprise obligatoire |
| Bluesky | aucun | — | rien, publie déjà en direct |

Ordre de dépôt prévu : YouTube d'abord (« le plus long, et le seul qui rend des
chiffres réels dès l'autorisation obtenue »), TikTok en parallèle, puis Meta, X,
LinkedIn.

**Ce que ça change pour le chantier 1 : rien ne bloque.** Tant que l'écran de
consentement Google n'est pas publié, « seuls 100 comptes de test peuvent
autoriser Momentum » — largement assez pour un seul utilisateur, à condition que
le compte du fondateur figure dans la liste des testeurs. Le dossier sert à
ouvrir à d'autres, pas à se connecter soi-même. Quota par défaut : 10 000 unités
par jour, une lecture de chaîne coûte 1 unité, un envoi de vidéo 1 600 — soit
environ six publications par jour, ce qui concernera le chantier 2.

**Le point le plus coûteux, à décider avant tout dépôt : le domaine de
production.** Il n'est arrêté nulle part. Chaque adresse de retour OAuth y est
déclarée, et « les plateformes la comparent caractère par caractère. Changer de
domaine après dépôt oblige à repasser dans chaque console. » Le document ajoute :
« il vaut mieux le décider avant de déposer le premier dossier qu'après le
quatrième ».

**Durées de vie des jetons, telles que documentées :**

- **Google : un rafraîchissement ne rend pas toujours un nouveau jeton de
  rafraîchissement.** Google ne le renvoie qu'à la première autorisation.
  Écraser l'ancien déconnecterait silencieusement. Le code repris gère déjà ce
  cas.
- **Sans date d'expiration connue, on ne rafraîchit pas.** Le faire à chaque
  appel brûlerait le quota et finirait par faire révoquer l'application.
- Meta ne délivre pas de jeton de rafraîchissement : jeton d'une heure, échangé
  contre un jeton de 60 jours à ré-échanger avant l'échéance. Seule exception au
  flux commun.
- X : sans la portée `offline.access`, l'accès meurt en deux heures.
- **La limite des 7 jours du mode test de Google n'est mentionnée dans aucun des
  deux documents** — seule la limite de 100 comptes l'est. Elle reste à vérifier
  sur le vrai compte, pas à supposer.

**Deux points où le nouveau dépôt s'écarte volontairement de l'ancien :**
`DEC-012` prévoyait SQLite en local et PostgreSQL en production — on prend
PostgreSQL partout. Et aucun des deux documents ne nomme d'hébergeur : Render est
une décision de cette phase, pas un héritage.

---

## 10. Ce qui reste à décider

1. **Les identifiants Google.** `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`
   sont-ils en main ? C'est la dernière chose qui empêche le chantier 1 de
   démarrer.
2. **Le domaine de production.** Non arrêté, et c'est le point le plus coûteux à
   rattraper : chaque adresse de retour OAuth y est déclarée, caractère par
   caractère, dans chaque console. À décider avant le premier dépôt de dossier,
   pas après. Pour le chantier 1, l'adresse du service Render suffit — encore
   faut-il savoir si ce service existe.
3. **Le mode test de Google.** Sa limite documentée est de 100 comptes de test,
   ce qui suffit à un utilisateur unique. La limite de 7 jours sur le jeton de
   rafraîchissement n'est écrite nulle part : à constater sur le vrai compte,
   pas à supposer.
4. **Le verrou d'accès.** L'ancien dépôt a un vrai système de comptes (mots de
   passe hachés, cookie de session, espaces séparés) — beaucoup plus lourd que
   le mot de passe unique voulu. À trancher : reprendre et simplifier, ou écrire
   le verrou minimal directement.
5. **L'abonnement X (~100 $/mois)** et l'offre multi-comptes de l'agrégateur :
   deux engagements d'argent qu'aucune décision de l'ancien dépôt ne tranche.
   Hors périmètre de cette phase, notés pour mémoire.

Réglé pendant cette session : la liste du §7 est validée, aucune sonde n'est
copiée, `CLAUDE.md` est corrigé sur les quatre sondes, et les documents de
dossiers ont été lus (§9). **Rien n'est encore recopié dans le dépôt.**
