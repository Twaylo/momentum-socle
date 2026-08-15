/**
 * Lecture de l'environnement, en un seul endroit.
 *
 * Aucun secret dans le dépôt. Les variables lues ici sont documentées dans
 * `CLAUDE.md` — `.env.example` est un document hérité de la version précédente,
 * qui décrit un produit plus large et n'est pas modifié.
 */

const PROD = process.env.NODE_ENV === 'production'

/**
 * Les identifiants développeur d'un réseau, lus une seule fois ici.
 *
 * ── POURQUOI ILS SE LISENT ICI ET NULLE PART AILLEURS ────────────────────────
 *
 * Les relire ailleurs par leur nom ferait deux tables de noms de variables, et
 * la première faute de frappe donnerait un réseau annoncé « configuré » qui
 * refuse ensuite l'échange — avec un message de plateforme qui ne nomme jamais
 * la variable en cause.
 *
 * ⚠ Rend `null` plutôt qu'un objet à moitié vide : un `clientSecret` absent
 * partirait sinon en chaîne vide, et la plateforme répondrait « client
 * invalide » au lieu de « secret manquant ».
 *
 * ⚠ Ces valeurs ne traversent JAMAIS une réponse HTTP.
 */
const CLES_DIRECTES = {
  youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
}

/** Les identifiants développeur d'un réseau sont-ils présents ? */
export function directConfigure(idReseau) {
  const cles = CLES_DIRECTES[idReseau]
  if (!cles) return false
  return cles.every((c) => Boolean(process.env[c]))
}

/** @returns {{clientId: string, clientSecret: string}|null} */
export function identifiantsDe(idReseau) {
  const cles = CLES_DIRECTES[idReseau]
  if (!cles || cles.length < 2) return null

  const clientId = process.env[cles[0]]
  const clientSecret = process.env[cles[1]]
  if (!clientId || !clientSecret) return null

  return { clientId, clientSecret }
}

/**
 * Le mot de passe du verrou d'accès.
 *
 * ⚠ La variable EST le mot de passe : pas de compte, pas d'inscription, pas de
 * hachage en base. C'est le plus simple qui tienne pour un outil à un seul
 * utilisateur — et `server/index.js` refuse de démarrer si elle est absente,
 * parce qu'une application déployée sans verrou laisserait n'importe qui
 * atteindre les comptes du fondateur.
 */
export function motDePasse() {
  return process.env.MOT_DE_PASSE || ''
}

export const port = Number(
  (PROD ? process.env.PORT : undefined) ?? process.env.API_PORT ?? 8787,
)

export const enProduction = PROD
