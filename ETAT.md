# État — chantier 1 : connexion YouTube

Chantier 1 **en cours**, plan en attente de validation. **Aucune ligne de code
écrite, aucun fichier recopié depuis l'ancien dépôt.**

Ce fichier a été réduit à ce qui sert au chantier en cours. L'inventaire complet
de l'ancien dépôt (sondes Meta, `retour-v2.md`, dossiers des autres plateformes)
a été retiré ; il se retrouve dans l'historique git si besoin.

---

## 1. Où en est le dépôt

Posé à la racine : `CLAUDE.md`, `IDEAS.md`, `.env.example`, ce fichier.
Rien d'autre. Pas de `package.json`, pas de projet, pas de code.

Décisions déjà inscrites dans `CLAUDE.md` : chantier 1 réduit à **YouTube seul**,
PostgreSQL dès maintenant, `CLE_CHIFFREMENT` stable partout, verrou d'accès par
mot de passe unique, npm, Vite + serveur Express séparé.

---

## 2. L'ancien dépôt

`Twaylo/momentum`, branche `main`, commit `860a4b9`. Version 2.0.0, en
production. Vite + React + serveur Express séparé, npm, Node ≥ 22.11.

Pour y accéder depuis une session neuve : demander le rattachement du dépôt, puis
le cloner. **Ne pas le réécrire de mémoire.**

Ce qui a été lu, et rien d'autre : le chemin OAuth et les providers, les sondes
de diagnostic, le test des jetons de style, `docs/retour-v2.md`,
`docs/dossiers-plateformes.md`, `docs/decisions.md`.

**La bonne idée à garder :** ce qui diffère d'une plateforme à l'autre est écrit
en **données**, pas en code — un seul objet `oauthConnecteur` sert six réseaux,
leurs particularités vivent dans une table. C'est ce qui rendra l'ajout des trois
autres réseaux indolore plus tard, sans qu'on ait à le préparer maintenant.

**Le piège :** `server/connecteurs/index.js` (l'aiguilleur) importe l'agrégateur
tiers et le module de statistiques — 1 900 lignes qui feraient entrer tout
l'ancien produit. Le connecteur OAuth lui-même n'en dépend pas. On prend le
connecteur, on jette l'aiguilleur.

---

## 3. Ce qu'on recopie — validé par le fondateur

Environ **1 100 lignes**, en 10 fichiers, tous sous 300 lignes après élagage.
Environ 700 lignes se recopient sans modification.

| Fichier de l'ancien dépôt | Lignes | Adaptation |
|---|---|---|
| `noyau/oauth.js` | 251 | aucune |
| `server/chiffrement.js` | 124 | aucune (AES-256-GCM) |
| `noyau/oauth-reseaux.js` | 273 | ne garder que YouTube → ~50 |
| `server/oauth/identite.js` | 206 | ne garder que YouTube → ~70 |
| `server/connecteurs/oauth.js` | 189 | retirer les branches Meta → ~170 |
| `server/oauth/flux.js` | 314 | retirer Meta → ~255, repasse sous 300 |
| `server/oauth/attente.js` | 143 | adapter à PostgreSQL |
| `server/config.js` | 96 | ne garder que YouTube → ~25 |
| `noyau/oauth.test.js` | 415 | couper en deux (règle des 300) |
| `src/theme/jetons-utilises.test.js` | 72 | aucune — à poser dans `src/theme/` |

À réécrire en s'inspirant, pas à copier :

- `etatDe()` et `versVue()` de `server/comptes-sociaux.js` (lignes 62-182) —
  ~150 lignes utiles sur 747. `etatDe()` porte un correctif déjà payé (voir §5).
  `versVue()` garantit qu'aucun jeton ne sort dans une réponse HTTP.
- Les deux routes `demarrer` et `retour` de `server/routes-connexions.js`
  (~80 lignes sur 717).
- Les migrations `004-comptes-sociaux.sql` et `017-oauth-attente.sql`.

---

## 4. Ce qu'on ne reprend pas, et ce qu'on écrit de neuf

**À ne pas reprendre :** `server/connecteurs/index.js`,
`server/routes-connexions.js` en entier, tout `server/publisher/`, tout
`server/insights/`, `server/catalogue-direct/`, `server/agregateur/`,
`noyau/youtube.js` (c'est de la publication, pas de la connexion).

**Aucune sonde n'est copiée.** Les quatre de l'ancien dépôt (jeton, Pages, vues,
historique — quatre et non trois, malgré ce qu'annonçait la documentation) sont
Meta uniquement, tronquent leur sortie à 300 caractères au lieu de montrer la
réponse brute, et aucun test ne les couvre. Ce qu'on en garde est une idée :
**accordé / refusé / jamais demandé** — trois états, jamais deux.

**À écrire de neuf pour le chantier 1 :** une sonde Google qui montre la
**réponse brute** de la plateforme, pas un résumé, avec **exactement les mêmes
paramètres que le moteur**. Plus le verrou d'accès et l'écran Réglages.

---

## 5. Pièges déjà payés, à ne pas redécouvrir

- **Google ne rend un jeton de rafraîchissement que si la demande porte
  `access_type=offline` et `prompt=consent`.** Sans eux, la connexion se coupe au
  bout d'une heure sans explication. Les deux sont dans le descripteur YouTube
  de l'ancien dépôt.
- **Un jeton Google dure une heure.** Un affichage naïf le déclare « à
  renouveler » dès la seconde de la connexion. C'est le bug que corrige
  `etatDe()`.
- **Google ne renvoie le jeton de rafraîchissement qu'à la première
  autorisation.** L'écraser par une valeur vide déconnecterait silencieusement.
  Le code repris gère déjà ce cas.
- **Sans date d'expiration connue, on ne rafraîchit pas.** Le faire à chaque
  appel brûlerait le quota et finirait par faire révoquer l'application.
- **L'adresse de retour OAuth est comparée caractère par caractère.** Une barre
  finale en trop suffit, et le message d'erreur ne dit pas laquelle des deux
  versions est fausse.
- L'ancien dépôt gère deux bases à la fois (SQLite et PostgreSQL). Le nouveau est
  **PostgreSQL seulement** : tout code recopié qui touche la base est à
  simplifier, pas à transposer.

---

## 6. Dossiers de validation — ce qui compte pour le chantier 1

**Aucun dossier n'est déposé, sur aucune plateforme.** Les documents de l'ancien
dépôt sont écrits au futur ; ils ne portent aucune date de dépôt.

**Rien ne bloque le chantier 1.** Tant que l'écran de consentement Google n'est
pas publié, seuls 100 comptes de test peuvent autoriser l'application — assez
pour un utilisateur unique, à condition que son compte soit dans la liste des
testeurs. C'est le cas : le fondateur l'a confirmé. Le dossier sert à ouvrir à
d'autres, pas à se connecter soi-même.

Pour YouTube, le dossier demandera plus tard : vidéo de démonstration du parcours
d'autorisation, politique de confidentialité en ligne, 4 à 6 semaines de délai.
Quota par défaut 10 000 unités/jour — une lecture de chaîne coûte 1 unité.

État des autres plateformes, gardé ici parce que le retrouver imposerait de
relire l'ancien dépôt : TikTok, dossier à déposer, audit requis, 2 à 4 semaines ·
Meta (Facebook + Instagram), un seul dossier pour les deux, 2 à 6 semaines · X,
pas de dossier mais un abonnement à ~100 $/mois · LinkedIn, programme partenaire,
long · Bluesky, aucun dossier.

**Le point le plus coûteux, non tranché : le domaine de production.** Chaque
adresse de retour OAuth le contient, déclarée caractère par caractère dans chaque
console. À décider avant le premier dépôt de dossier, pas après.

---

## 7. Ce qui reste à décider

1. **L'hébergeur.** `CLAUDE.md` annonce Render, mais aucun service Render
   n'existe : l'ancienne version tourne sur **Railway**. À trancher avant le
   déploiement, et `CLAUDE.md` est à corriger en conséquence. Le choix décide
   l'adresse de retour OAuth à déclarer chez Google.
2. **La base PostgreSQL** reste à provisionner, chez l'hébergeur retenu.
3. **Le mode test de Google.** Sa limite documentée est de 100 comptes, ce qui
   suffit. La limite de 7 jours sur le jeton de rafraîchissement n'est écrite
   dans aucun document de l'ancien dépôt : à constater sur le vrai compte, pas à
   supposer.
4. **Le verrou d'accès.** L'ancien dépôt a un vrai système de comptes (mots de
   passe hachés, cookie de session, espaces séparés), beaucoup plus lourd que le
   mot de passe unique voulu. Décision : écrire le verrou minimal directement,
   sans reprendre ce système.

Réglé : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont en main, le compte du
fondateur est dans la liste des testeurs Google.
