/**
 * OAuth 2.0 — la mécanique commune à TOUTES les intégrations directes.
 *
 * ── POURQUOI UNE SEULE PIÈCE, ET PAS UNE PAR RÉSEAU ──────────────────────────
 *
 * Internaliser veut dire : YouTube, TikTok, Instagram, Facebook, LinkedIn, X.
 * Six réseaux, six dossiers de validation — mais UNE seule mécanique. Tous
 * parlent OAuth 2.0 avec code d'autorisation : on envoie l'utilisateur chez
 * eux, ils renvoient un code, on l'échange contre un jeton, et on rafraîchit
 * ce jeton avant qu'il n'expire.
 *
 * Écrire ça six fois, c'est six occasions de se tromper sur la partie sensible.
 * Écrit une fois, chaque réseau n'apporte plus qu'un descripteur : ses adresses,
 * ses portées, et comment il nomme ses champs.
 *
 * ── ⚠ CE QUE CE MODULE PROTÈGE ───────────────────────────────────────────────
 *
 * L'ÉTAT (`state`) EST UNE PROTECTION, PAS UNE FORMALITÉ. Sans lui, n'importe
 * qui peut faire cliquer un créateur sur un lien de retour forgé et RATTACHER
 * SON PROPRE COMPTE au sien. Le créateur publierait alors, sans le savoir, sur
 * la chaîne d'un inconnu. C'est la faille classique de ce flux, et elle est
 * silencieuse.
 *
 * UN JETON N'EST JAMAIS JOURNALISÉ. Ni dans un message d'erreur, ni dans une
 * trace. Ce module ne rend que des formes ; c'est l'appelant qui chiffre.
 *
 * Module PUR (EXG-TEC-001) : il fabrique et vérifie des chaînes. Aucun appel
 * réseau, aucune horloge — l'instant est toujours reçu en argument.
 */

/** Marge avant expiration : on rafraîchit AVANT que ça casse. */
export const MARGE_EXPIRATION_MS = 5 * 60_000

/** Le nom du paramètre d'identifiant client, qui n'est pas le même partout. */
const nomClient = (descripteur) => descripteur?.nomClient ?? 'client_id'

/**
 * L'adresse chez le fournisseur, où l'on envoie le créateur.
 *
 * ⚠ `state` est obligatoire, et il n'a pas de valeur par défaut : un défaut
 * serait le même pour tout le monde, donc devinable, donc inutile.
 *
 * ⚠ `defi` (le `code_challenge` de PKCE) est obligatoire dès que le descripteur
 * l'annonce. TikTok et X REFUSENT l'échange sans lui, et le refus arrive à
 * l'étape d'après — au retour du créateur, avec un message que personne ne
 * rattache à l'adresse construite ici. Mieux vaut refuser tout de suite.
 */
export function adresseDAutorisation(descripteur, { clientId, redirection, state, defi = null, extra = {} }) {
  if (!descripteur?.autorisation) throw new Error('Descripteur sans adresse d’autorisation.')
  if (!clientId) throw new Error('Identifiant client absent.')
  if (!state) throw new Error('Un état est obligatoire : sans lui, le retour n’est pas vérifiable.')
  if (descripteur.pkce && !defi) {
    throw new Error('Ce réseau exige PKCE : un défi est obligatoire.')
  }

  const params = new URLSearchParams({
    response_type: 'code',
    [nomClient(descripteur)]: clientId,
    redirect_uri: redirection,
    scope: (descripteur.portees ?? []).join(descripteur.separateurPortees ?? ' '),
    state,
    ...(descripteur.pkce ? { code_challenge: defi, code_challenge_method: descripteur.pkce } : {}),
    ...descripteur.extraAutorisation,
    ...extra,
  })

  return `${descripteur.autorisation}?${params}`
}

/**
 * Vérifie l'état renvoyé par le fournisseur.
 *
 * ⚠ COMPARAISON À TEMPS CONSTANT. Comparer deux chaînes avec `===` s'arrête au
 * premier caractère différent : le temps de réponse révèle alors combien de
 * caractères sont justes, et l'état devient devinable en quelques milliers
 * d'essais. C'est une attaque réelle sur ce flux précis.
 */
export function etatValide(attendu, recu) {
  const a = String(attendu ?? '')
  const b = String(recu ?? '')
  if (!a || !b || a.length !== b.length) return false

  let differences = 0
  for (let i = 0; i < a.length; i += 1) differences |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return differences === 0
}

/**
 * Le corps de la demande d'échange « code → jeton ».
 *
 * Rendu en `URLSearchParams` : c'est ce que la quasi-totalité des fournisseurs
 * attend, et l'appelant reste libre de l'encoder autrement.
 *
 * ⚠ `verifieur` (le `code_verifier` de PKCE) accompagne le code. Il prouve que
 * c'est bien NOUS qui avons ouvert l'autorisation, et pas quelqu'un qui aurait
 * intercepté le code au retour.
 */
export function corpsDEchange(descripteur, { code, clientId, clientSecret, redirection, verifieur = null }) {
  const corps = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    [nomClient(descripteur)]: clientId,
    redirect_uri: redirection,
    ...descripteur?.extraEchange,
  })

  /**
   * ⚠ Quand le fournisseur veut le secret en en-tête (`Basic`), l'envoyer AUSSI
   * dans le corps est refusé par certains — X notamment. Un seul endroit.
   */
  if (!descripteur?.secretEnEntete && clientSecret) corps.set('client_secret', clientSecret)
  if (descripteur?.pkce && verifieur) corps.set('code_verifier', verifieur)

  return corps
}

/** Le corps de la demande de rafraîchissement. */
export function corpsDeRafraichissement(descripteur, { refresh, clientId, clientSecret }) {
  const corps = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    [nomClient(descripteur)]: clientId,
    ...descripteur?.extraRafraichissement,
  })
  if (!descripteur?.secretEnEntete && clientSecret) corps.set('client_secret', clientSecret)
  return corps
}

/**
 * Les en-têtes de la demande de jeton.
 *
 * ⚠ Certains fournisseurs (X) exigent l'authentification du client en `Basic`
 * et REFUSENT le secret dans le corps. Le descripteur le dit, cette fonction
 * l'applique — l'appelant n'a pas à connaître la particularité.
 */
export function entetesDEchange(descripteur, { clientId, clientSecret } = {}) {
  const entetes = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (descripteur?.secretEnEntete && clientId && clientSecret) {
    entetes.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`
  }
  return entetes
}

/**
 * Range la réponse d'un fournisseur en une forme unique.
 *
 * ── ⚠ LES DEUX PIÈGES DE CETTE FONCTION ──────────────────────────────────────
 *
 * 1. `expires_in` est une DURÉE en secondes, pas une date. La stocker telle
 *    quelle donnerait un jeton qui « expire en 1970 », donc rafraîchi à chaque
 *    appel — ou jamais, selon le sens de la comparaison.
 *
 * 2. UN RAFRAÎCHISSEMENT NE REND PAS TOUJOURS UN NOUVEAU `refresh_token`.
 *    Google, notamment, ne le renvoie qu'à la première autorisation. Écraser
 *    l'ancien par `undefined` déconnecterait le créateur au premier
 *    rafraîchissement — silencieusement, et sans qu'il ait rien fait.
 *
 * @param {string} maintenantIso  passé en argument : ce module reste pur.
 */
export function rangerJetons(brut, maintenantIso, refreshPrecedent = null) {
  const acces = brut?.access_token ?? brut?.accessToken ?? null
  if (!acces) return null

  const base = Date.parse(maintenantIso)
  const dans = (secondes) => {
    const n = Number(secondes)
    return Number.isFinite(n) && Number.isFinite(base) ? new Date(base + n * 1000).toISOString() : null
  }

  return {
    acces,
    // ⚠ On GARDE l'ancien quand le fournisseur n'en renvoie pas.
    refresh: brut?.refresh_token ?? brut?.refreshToken ?? refreshPrecedent ?? null,
    expireLe: dans(brut?.expires_in ?? brut?.expiresIn),
    /**
     * Le jeton de rafraîchissement expire lui aussi chez certains (TikTok :
     * un an). Le savoir permet de prévenir le créateur AVANT la rupture, au
     * lieu de découvrir la déconnexion le jour d'une publication.
     */
    refreshExpireLe: dans(brut?.refresh_expires_in ?? brut?.refreshExpiresIn),
    portees: typeof brut?.scope === 'string' ? brut.scope.split(/[\s,]+/).filter(Boolean) : null,
    /**
     * L'identifiant du compte chez la plateforme, quand il vient avec le jeton
     * (TikTok le rend en `open_id`). Ça évite un appel de plus pour savoir à
     * qui on vient de se connecter.
     */
    externeId: brut?.open_id ?? brut?.openId ?? null,
  }
}

/**
 * Ce jeton doit-il être rafraîchi ?
 *
 * ⚠ Avec une MARGE. Rafraîchir à la seconde près garantit qu'un appel parti
 * juste avant l'échéance arrivera juste après — et échouera pour une raison
 * qu'aucun journal n'expliquera.
 *
 * ⚠ Sans date d'expiration connue, on ne rafraîchit PAS. Le faire à chaque
 * appel brûlerait le quota du fournisseur et finirait par faire révoquer
 * l'application.
 */
export function doitRafraichir(expireLe, maintenantIso, marge = MARGE_EXPIRATION_MS) {
  const fin = Date.parse(expireLe)
  const maintenant = Date.parse(maintenantIso)
  if (!Number.isFinite(fin) || !Number.isFinite(maintenant)) return false
  return fin - maintenant <= marge
}

/**
 * Ce que le fournisseur a répondu quand ça s'est mal passé.
 *
 * ── ⚠ POURQUOI CETTE FONCTION EXISTE ─────────────────────────────────────────
 *
 * Un échec OAuth a deux natures qu'il ne faut jamais confondre :
 *
 *   — le créateur a REFUSÉ (ou fermé l'onglet) : rien n'est cassé, il n'y a
 *     rien à réparer, et lui afficher une erreur rouge serait un mensonge ;
 *   — la configuration est FAUSSE (mauvaise redirection, portée non accordée) :
 *     là c'est notre problème, et aucune reconnexion du créateur n'y changera
 *     quoi que ce soit.
 *
 * Les traiter pareil, c'est envoyer le créateur recommencer en boucle un geste
 * qui ne peut pas aboutir.
 *
 * @returns {{refus: boolean, phrase: string, code: string|null}}
 */
export function lireEchec(parametres = {}) {
  const code = parametres.error ?? parametres.error_code ?? null

  const refusParLeCreateur =
    code === 'access_denied' || code === 'user_denied' || code === 'user_cancelled_login'

  if (refusParLeCreateur) {
    return {
      refus: true,
      code,
      phrase: 'Tu n’as pas confirmé l’autorisation. Ton compte n’a pas été connecté.',
    }
  }

  return {
    refus: false,
    code,
    /**
     * EXG-TEC-013 : notre phrase, et le mot à mot de la plateforme À CÔTÉ —
     * jamais à la place. C'est le détail qui permet de comprendre un refus
     * sans avoir accès aux journaux.
     */
    phrase: 'Ce réseau a refusé l’autorisation.',
  }
}
