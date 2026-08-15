/**
 * Les descripteurs OAuth de chaque réseau — ce qui les DIFFÉRENCIE, et rien de plus.
 *
 * ── CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ─────────────────────────────
 *
 * La mécanique est dans `oauth.js`, écrite une fois. Ici il n'y a que les
 * différences : des adresses, des portées, et les quelques endroits où une
 * plateforme s'écarte de la norme. Chaque écart est commenté avec sa
 * conséquence, parce qu'un écart non documenté se redécouvre en production.
 *
 * ⚠ CES VALEURS SONT CELLES PUBLIÉES AU 13 AOÛT 2026. Elles changent. Le
 * chapitre 6.1 impose de les revérifier avant CHAQUE dépôt de dossier — c'est
 * précisément le moment où on relit la documentation de la plateforme.
 *
 * ⚠ AUCUN SECRET ICI. Les identifiants client vivent dans l'environnement
 * (EXG-TEC-041). Ce fichier est public par nature : il ne contient que ce que
 * la plateforme documente déjà.
 *
 * Module PUR : de la donnée, aucune exécution.
 */

/**
 * @typedef {object} Descripteur
 * @property {string} autorisation        Où l'on envoie le créateur.
 * @property {string} jeton               Où l'on échange le code.
 * @property {string[]} portees           Ce qu'on demande — le minimum utile.
 * @property {string} [separateurPortees] ' ' par défaut ; ',' chez certains.
 * @property {string} [nomClient]         'client_id' par défaut.
 * @property {'S256'} [pkce]              Présent = PKCE obligatoire.
 * @property {boolean} [secretEnEntete]   Le secret va en `Basic`, pas dans le corps.
 * @property {object} [extraAutorisation] Paramètres propres à la plateforme.
 * @property {string} [dossier]           Ce qu'il faut obtenir avant que ça marche.
 */

/** @type {Record<string, Descripteur>} */
export const DESCRIPTEURS = {
  youtube: {
    autorisation: 'https://accounts.google.com/o/oauth2/v2/auth',
    jeton: 'https://oauth2.googleapis.com/token',
    revocation: 'https://oauth2.googleapis.com/revoke',
    portees: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
    ],
    /**
     * ⚠ LES DEUX PARAMÈTRES SANS LESQUELS IL N'Y A PAS DE RAFRAÎCHISSEMENT.
     *
     * Sans `access_type=offline`, Google ne rend AUCUN jeton de
     * rafraîchissement : l'accès meurt au bout d'une heure et le créateur doit
     * se reconnecter à chaque publication.
     *
     * Sans `prompt=consent`, Google ne rend le jeton de rafraîchissement qu'à la
     * TOUTE PREMIÈRE autorisation. Un créateur qui reconnecte après avoir perdu
     * ses données repartirait donc sans rafraîchissement — et le défaut ne se
     * verrait qu'une heure plus tard.
     */
    extraAutorisation: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    dossier:
      'Écran de consentement Google publié + vérification des portées sensibles YouTube ' +
      '(démonstration vidéo exigée). Sans publication, seuls 100 comptes de test peuvent autoriser.',
  },

  tiktok: {
    autorisation: 'https://www.tiktok.com/v2/auth/authorize/',
    jeton: 'https://open.tiktokapis.com/v2/oauth/token/',
    revocation: 'https://open.tiktokapis.com/v2/oauth/revoke/',
    /**
     * ⚠ TikTok N'APPELLE PAS ÇA `client_id`, MAIS `client_key`. Envoyer
     * `client_id` donne une erreur qui ne nomme pas le champ manquant.
     */
    nomClient: 'client_key',
    // ⚠ Et ses portées se séparent par des VIRGULES, pas par des espaces.
    separateurPortees: ',',
    // ⚠ PKCE obligatoire depuis l'API v2 — y compris pour un serveur.
    pkce: 'S256',
    portees: [
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
      'video.list',
      'video.publish',
      'video.upload',
    ],
    dossier:
      'Audit de l’app TikTok pour Content Posting API. ⚠ Tant qu’elle n’est pas auditée, ' +
      'toute vidéo publiée reste PRIVÉE — c’est une conformité produit, pas une limite de quota.',
  },

  /**
   * Instagram et Facebook passent par la MÊME porte : la connexion Meta.
   * Deux réseaux, un seul consentement, un seul dossier — mais deux entrées ici,
   * parce que le créateur en connecte un sans l'autre et que l'écran doit le
   * refléter.
   */
  instagram: {
    autorisation: 'https://www.facebook.com/v21.0/dialog/oauth',
    jeton: 'https://graph.facebook.com/v21.0/oauth/access_token',
    separateurPortees: ',',
    /**
     * ⚠ ON NE DEMANDE QUE CE QUE LE MOTEUR APPELLE VRAIMENT.
     *
     * Trois portées ont été retirées ici : `instagram_content_publish`,
     * `business_management`, et côté Facebook `pages_manage_posts`. Aucune
     * n'était appelée : `server/insights/direct/meta.js` ne fait que deux
     * requêtes — `me/accounts` et `…/insights` — et la publication Meta passe
     * encore par l'agrégateur, pas par ce jeton.
     *
     * Ce n'était pas gratuit. Meta refuse TOUT le consentement dès qu'une seule
     * portée n'est pas ouverte sur l'app (« Invalid Scopes »), et chaque portée
     * en trop est une case de plus à ouvrir dans la console — puis un dossier de
     * plus à défendre en App Review. Demander un droit de publication qu'on
     * n'exerce pas, c'est se faire refuser pour une fonction qu'on n'a pas.
     *
     * Elles reviendront le jour où un éditeur Meta direct existera, avec le code
     * qui s'en sert dans le même commit.
     *
     * ── ⚠ SAUF `business_management`, QUI EST REVENUE. VOICI POURQUOI ────────
     *
     * Je l'avais retirée avec les autres, au motif qu'aucune ligne ne l'appelle.
     * C'est vrai — et c'était quand même une erreur : elle ne sert pas à appeler
     * un point d'entrée, elle sert à VOIR les Pages.
     *
     * Le jour où le créateur a relié son compte Instagram à sa Page depuis l'app
     * Instagram, Meta a déplacé la Page dans un portefeuille professionnel. À
     * partir de là, `me/accounts` a rendu une liste VIDE — sans erreur, sans
     * refus, avec un jeton portant `pages_show_list` accordée. La Page était
     * visible dix minutes plus tôt.
     *
     * Une liste vide sans erreur est indiscernable de « ce compte n'a aucune
     * Page ». Le produit a donc affiché « Aucune Page Facebook sur ce compte »
     * à quelqu'un qui en avait une, et il a fallu deux sondes
     * (`me/permissions` + `me/accounts`, écran Réglages) pour le voir.
     *
     * Leçon : « rien ne l'appelle » n'est pas la bonne question pour une portée
     * Meta. La bonne question est « qu'est-ce qui devient invisible sans elle ».
     */
    portees: [
      'instagram_basic',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ],
    /**
     * ⚠ META NE REND PAS DE `refresh_token`. Son jeton court dure une heure ; on
     * l'échange contre un jeton « longue durée » de 60 jours, qu'on ré-échange
     * ensuite contre lui-même avant l'échéance. Traiter Meta comme les autres
     * déconnecterait tous les comptes Instagram au bout d'une heure.
     */
    echangeLongueDuree: {
      adresse: 'https://graph.facebook.com/v21.0/oauth/access_token',
      grant: 'fb_exchange_token',
    },
    dossier:
      'Cas d’utilisation « Gérer les messages et les contenus sur Instagram » activé sur ' +
      'l’app, puis mode Live + App Review de instagram_manage_insights pour lire les ' +
      'comptes d’AUTRES créateurs. ⚠ Compte Professionnel ou Créateur relié à une Page, ' +
      'sans quoi l’API ne le voit pas du tout.',
  },

  facebook: {
    autorisation: 'https://www.facebook.com/v21.0/dialog/oauth',
    jeton: 'https://graph.facebook.com/v21.0/oauth/access_token',
    separateurPortees: ',',
    /**
     * ⚠ On lit une PAGE, jamais un profil personnel : Meta ne mesure pas un
     * profil. D'où `pages_show_list` (les Pages du créateur), et surtout le
     * jeton DE PAGE que `me/accounts` rend au passage — le jeton d'utilisateur
     * ne lit aucune statistique de Page, il rend une réponse vide.
     *
     * ⚠ `pages_manage_posts` est parti : rien ne l'appelle tant que la
     * publication Meta passe par l'agrégateur. `business_management`, elle, est
     * REVENUE — sans elle, une Page rangée dans un portefeuille professionnel
     * devient invisible à `me/accounts`, qui rend alors une liste vide SANS
     * erreur. Le raisonnement complet est côté Instagram.
     *
     * ── ET `read_insights` AUSSI, MAIS POUR UNE AUTRE RAISON ──────────────────
     *
     * Elle n'est pas ouvrable depuis le cas d'utilisation Instagram, et Meta
     * refuse le consentement ENTIER dès qu'une portée manque. Le choix était
     * donc : pas de Facebook du tout, ou Facebook sans les vues.
     *
     * Ce qu'on garde sans elle : le nombre d'abonnés de la Page, qui vient de
     * `me/accounts` et alimente déjà la courbe d'audience et le score.
     * Ce qu'on perd : `page_impressions` et `page_post_engagements` — donc les
     * vues et l'engagement de la Page, qui resteront à `null`.
     *
     * ⚠ Ce n'est PAS un trou silencieux : `statistiquesDePage` rend déjà `{}` en
     * cas de refus, et l'écran distingue « pas mesuré » de « zéro ». Le jour où
     * `read_insights` sera ajoutée à l'app (cas d'utilisation « Tout gérer sur
     * votre Page »), il suffira de la remettre ici et de reconnecter.
     */
    /**
     * ⚠ `read_insights` EST REVENUE. Elle était sortie une nuit, pour une raison
     * de circonstance : Meta refusait le consentement ENTIER parce qu'elle
     * n'était pas encore ouverte sur l'app, et il fallait que Facebook se
     * connecte. Le choix était « pas de Facebook » ou « Facebook sans les vues ».
     *
     * Elle est ouverte maintenant, et sans elle `page_impressions` et
     * `page_post_engagements` restent vides : la Page n'a que son compteur
     * d'abonnés, jamais sa portée.
     */
    portees: ['pages_show_list', 'pages_read_engagement', 'read_insights', 'business_management'],
    echangeLongueDuree: {
      adresse: 'https://graph.facebook.com/v21.0/oauth/access_token',
      grant: 'fb_exchange_token',
    },
    dossier:
      'read_insights et business_management ouvertes sur l’app, puis mode Live + App Review ' +
      'de read_insights pour lire les Pages d’AUTRES créateurs. ⚠ Une Page rangée dans un ' +
      'portefeuille professionnel n’est énumérée qu’avec business_management.',
  },

  linkedin: {
    autorisation: 'https://www.linkedin.com/oauth/v2/authorization',
    jeton: 'https://www.linkedin.com/oauth/v2/accessToken',
    portees: ['openid', 'profile', 'w_member_social'],
    /**
     * ⚠ LinkedIn ne rend un `refresh_token` qu'aux applications qui y ont été
     * habilitées ; sinon le jeton dure 60 jours et il faut une reconnexion.
     * `rangerJetons` garde l'ancien quand il n'y en a pas — donc rien ne casse,
     * mais l'écran Connexions doit annoncer l'échéance (EXG-CNX-002).
     */
    dossier:
      'Produit « Share on LinkedIn » + « Sign In with LinkedIn using OpenID Connect ». ' +
      '⚠ La LECTURE des statistiques d’un membre (r_member_social) est réservée aux ' +
      'partenaires — c’est le réseau où les chiffres resteront indisponibles le plus longtemps.',
  },

  x: {
    autorisation: 'https://x.com/i/oauth2/authorize',
    jeton: 'https://api.x.com/2/oauth2/token',
    revocation: 'https://api.x.com/2/oauth2/revoke',
    pkce: 'S256',
    /**
     * ⚠ X authentifie le client en `Basic` et REFUSE le secret dans le corps.
     * Les deux ensemble donnent un 401 qui n'explique rien.
     */
    secretEnEntete: true,
    /**
     * ⚠ `offline.access` N'EST PAS UNE OPTION : sans cette portée, X ne rend
     * aucun jeton de rafraîchissement et l'accès meurt en deux heures.
     */
    portees: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'],
    dossier:
      'Projet X sur un plan payant (Basic minimum) : le plan gratuit ne publie que 500 ' +
      'messages par mois et ne lit aucune statistique. ⚠ C’est un coût, pas un dossier.',
  },

  /**
   * ⚠ Bluesky N'EST PAS ABSENT PAR OUBLI.
   *
   * Il s'authentifie par mot de passe d'application, pas par OAuth : il n'y a ni
   * écran de consentement, ni dossier, ni validation à attendre. C'est pour ça
   * qu'il publie déjà en direct aujourd'hui (§6.1). Le noter ici évite qu'on
   * cherche un descripteur manquant.
   */
}

/** Le descripteur d'un réseau, ou `null` s'il ne parle pas OAuth. */
export function descripteurDe(idReseau) {
  return DESCRIPTEURS[idReseau] ?? null
}

/**
 * Les réseaux dont l'internalisation passe par OAuth.
 *
 * Sert aux écrans d'administration : ce sont exactement ceux qui ont un dossier
 * à déposer.
 */
export const RESEAUX_OAUTH = Object.keys(DESCRIPTEURS)
