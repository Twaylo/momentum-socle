/**
 * Lecture de l'environnement, en un seul endroit.
 *
 * EXG-TEC-041 : aucun secret dans le dépôt, et « une variable non documentée est
 * une fonctionnalité que personne ne peut activer » — chaque clé lue ici figure
 * donc dans `.env.example`.
 */

const PROD = process.env.NODE_ENV === 'production'

/**
 * Bac à sable (EXG-TEC-012) : le produit se déroule en entier sans rien publier.
 *
 * Actif par DÉFAUT partout sauf en production (ch. 35). Le défaut sûr est
 * l'inverse de celui qu'on choisirait par confort : une variable oubliée doit
 * empêcher une publication réelle, jamais l'autoriser par accident.
 */
export function bacASable() {
  if (process.env.PUBLISHER_SANDBOX === 'true') return true
  if (process.env.PUBLISHER_SANDBOX === 'false') return false
  return !PROD
}

/**
 * Backend de publication d'un réseau (DEC-003, EXG-TEC-010/011).
 *
 * Une variable PAR RÉSEAU, jamais un drapeau global : les validations
 * plateformes tombent une par une, et un drapeau global obligerait à attendre la
 * dernière pour bénéficier de la première.
 *
 * @returns {'aggregator' | 'direct'}
 */
export function backendDe(idReseau) {
  const brut = process.env[`PUBLISHER_${idReseau.toUpperCase()}`]
  // Valeur absente ou inconnue → agrégateur : c'est le chemin qui fonctionne
  // toujours. L'annexe B documente le coût de l'erreur inverse.
  return brut === 'direct' ? 'direct' : 'aggregator'
}

/** L'agrégateur est-il souscrit et configuré ? */
export function agregateurConfigure() {
  return Boolean(process.env.AGREGATEUR_CLE)
}

/** Les identifiants développeur d'un réseau sont-ils présents ? */
const CLES_DIRECTES = {
  youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  instagram: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  x: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  bluesky: [], // Rien à obtenir : publiable nativement (§6.1).
}

export function directConfigure(idReseau) {
  const cles = CLES_DIRECTES[idReseau]
  if (!cles) return false
  return cles.every((c) => Boolean(process.env[c]))
}

/**
 * Les identifiants développeur d'un réseau, lus une seule fois ici.
 *
 * ── POURQUOI ILS SE LISENT ICI ET NULLE PART AILLEURS ────────────────────────
 *
 * Le flux OAuth a besoin des mêmes valeurs que `directConfigure()`. Les relire
 * ailleurs par leur nom ferait deux tables de noms de variables, et la première
 * faute de frappe donnerait un réseau annoncé « configuré » qui refuse ensuite
 * l'échange — avec un message de plateforme qui ne nomme jamais la variable en
 * cause.
 *
 * ⚠ Rend `null` plutôt qu'un objet à moitié vide : un `clientSecret` absent
 * partirait sinon en chaîne vide, et la plateforme répondrait « client
 * invalide » au lieu de « secret manquant ».
 *
 * ⚠ Ces valeurs ne traversent JAMAIS une réponse HTTP (EXG-TEC-041).
 *
 * @returns {{clientId: string, clientSecret: string}|null}
 */
export function identifiantsDe(idReseau) {
  const cles = CLES_DIRECTES[idReseau]
  if (!cles || cles.length < 2) return null

  const clientId = process.env[cles[0]]
  const clientSecret = process.env[cles[1]]
  if (!clientId || !clientSecret) return null

  return { clientId, clientSecret }
}

export const port = Number(
  (PROD ? process.env.PORT : undefined) ?? process.env.API_PORT ?? 8787,
)

export const enProduction = PROD
