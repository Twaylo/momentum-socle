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
 * ⚠ UN SEUL RÉSEAU ICI, ET C'EST VOULU. Le chantier en cours est la connexion
 * YouTube. Les descripteurs de TikTok, Instagram, Facebook, LinkedIn et X
 * existent dans l'ancien dépôt et seront repris un réseau par session, avec le
 * code qui s'en sert dans le même commit. Les ajouter d'avance donnerait des
 * portées demandées que rien n'appelle — et une plateforme refuse le
 * consentement ENTIER dès qu'une portée n'est pas ouverte sur l'application.
 *
 * ⚠ CES VALEURS SONT CELLES PUBLIÉES AU 13 AOÛT 2026. Elles changent, et le
 * moment de les revérifier est le dépôt du dossier.
 *
 * ⚠ AUCUN SECRET ICI. Les identifiants client vivent dans l'environnement. Ce
 * fichier est public par nature : il ne contient que ce que Google documente.
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
    /**
     * ⚠ ON NE DEMANDE QUE CE QUE LE CHANTIER APPELLE VRAIMENT.
     *
     * `youtube.readonly` suffit à identifier la chaîne et à lire son état, ce
     * qui est tout l'objet du chantier 1. `yt-analytics.readonly` (chantier 4)
     * et `youtube.upload` (chantier 2) reviendront avec le code qui s'en sert,
     * dans le même commit : une portée demandée sans usage est une case de plus
     * à défendre en vérification, pour une fonction qu'on n'a pas.
     */
    portees: ['https://www.googleapis.com/auth/youtube.readonly'],
    /**
     * ⚠ LES DEUX PARAMÈTRES SANS LESQUELS IL N'Y A PAS DE RAFRAÎCHISSEMENT.
     *
     * Sans `access_type=offline`, Google ne rend AUCUN jeton de
     * rafraîchissement : l'accès meurt au bout d'une heure et le créateur doit
     * se reconnecter à chaque fois.
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
