import {
  adresseDAutorisation,
  corpsDEchange,
  corpsDeRafraichissement,
  doitRafraichir,
  entetesDEchange,
  rangerJetons,
} from '../../noyau/oauth.js'
import { descripteurDe } from '../../noyau/oauth-reseaux.js'
import { motAMot } from '../../noyau/lecture-reponse.js'
import { identifiantsDe } from '../config.js'
import { consommer, deposer, nouveauCouplePkce, nouvelEtat } from './attente.js'

/**
 * Le flux OAuth, côté serveur : les trois moments où l'on parle à la plateforme.
 *
 *   ouvrir()     — fabriquer l'adresse et retenir de quoi vérifier le retour
 *   terminer()   — vérifier le retour, échanger le code contre des jetons
 *   rafraichir() — renouveler avant l'échéance
 *
 * ── CE QUI N'EST PAS ICI, ET C'EST VOLONTAIRE ────────────────────────────────
 *
 * Aucun `if (reseau === 'tiktok')`. Les différences entre plateformes vivent
 * dans `noyau/oauth-reseaux.js`, en données. La première version de ce fichier
 * ailleurs — six branches cousues à la main — est exactement ce qui produit les
 * cinq réseaux « bientôt » d'une itération précédente.
 *
 * ── ⚠ CE QUI NE SORT JAMAIS D'ICI ────────────────────────────────────────────
 *
 * Les jetons ne sont JAMAIS journalisés, ni en clair dans un message d'erreur.
 * `console.warn` ne reçoit que le réseau et le code d'erreur de la plateforme.
 * Un journal d'hébergeur se consulte depuis un navigateur, se copie, et se
 * garde bien plus longtemps qu'on ne croit.
 */

/** Le délai au-delà duquel on cesse d'attendre une plateforme. */
const DELAI_MS = 20_000

/** Où la plateforme nous rappelle. Une seule forme, pour tous les réseaux. */
export function redirectionDe(reseau, base) {
  if (!base) {
    const e = new Error(
      'L’adresse publique de Momentum est inconnue : impossible de fabriquer l’adresse de retour.',
    )
    e.status = 500
    throw e
  }
  return `${base}/api/connexions/retour/${reseau}`
}

/**
 * Lit la réponse d'un point de jeton.
 *
 * ⚠ Toutes les plateformes ne rendent pas du JSON. Meta a longtemps rendu du
 * `application/x-www-form-urlencoded`, et le fait encore sur certaines versions
 * d'API. Supposer JSON ferait échouer l'échange sur une réponse pourtant
 * correcte — et l'erreur parlerait de syntaxe, pas d'OAuth.
 */
async function lireCorps(reponse) {
  const texte = await reponse.text()
  if (!texte) return {}
  try {
    return JSON.parse(texte)
  } catch {
    return Object.fromEntries(new URLSearchParams(texte))
  }
}

/**
 * Une demande de jeton — échange ou rafraîchissement, c'est la même mécanique.
 *
 * @returns {Promise<object>} le corps brut de la plateforme.
 */
async function demanderJetons(reseau, descripteur, corps, { clientId, clientSecret, appel = fetch }) {
  const reponse = await appel(descripteur.jeton, {
    method: 'POST',
    headers: entetesDEchange(descripteur, { clientId, clientSecret }),
    body: corps.toString(),
    signal: AbortSignal.timeout(DELAI_MS),
  })

  const brut = await lireCorps(reponse)

  if (!reponse.ok || brut.error) {
    /**
     * ⚠ EXG-TEC-013 : notre phrase, et le mot à mot de la plateforme À CÔTÉ.
     *
     * Le mot à mot compte ici plus qu'ailleurs : « invalid_grant » et
     * « redirect_uri_mismatch » demandent deux réparations opposées, et seul le
     * second est de notre faute.
     */
    /**
     * ⚠ COUPÉ, PAS RÉÉCRIT.
     *
     * Vérifié en vrai sur un refus Google : 280 caractères, trois retours à la
     * ligne, des apostrophes en `&#39;`. Ça voyage ensuite dans une adresse de
     * retour et s'affiche tel quel — donc personne ne le lit, donc l'exigence
     * est tenue sur le papier et perdue en pratique. Le journal, lui, garde le
     * message entier.
     */
    const mot = motAMot(brut.error_description ?? brut.error) ?? `HTTP ${reponse.status}`
    const e = new Error(`Ce réseau a refusé l’autorisation. ${mot}`)
    e.codePlateforme = brut.error ?? null
    e.status = 502
    // Le journal reçoit le code, jamais le corps : il contiendrait le jeton.
    console.warn(`[oauth] ${reseau} — refus ${brut.error ?? reponse.status}`)
    throw e
  }

  return brut
}

/** Les identifiants du réseau, ou une erreur qui dit quoi faire — sans les nommer. */
function exigerIdentifiants(reseau) {
  const ids = identifiantsDe(reseau)
  if (!ids) {
    /**
     * ⚠ EXG-CNX-004 : le message ne nomme AUCUNE variable d'environnement, y
     * compris ici. Le créateur qui verrait « GOOGLE_CLIENT_SECRET est absente »
     * apprendrait notre plomberie et n'y pourrait rien.
     */
    const e = new Error('Ce réseau n’est pas encore ouvert à la connexion directe.')
    e.status = 501
    throw e
  }
  return ids
}

/**
 * Ouvre une autorisation : rend l'adresse où envoyer le créateur.
 *
 * @returns {Promise<{url: string}>}
 */
export async function ouvrir({ espaceId, reseau, base, retour }, maintenantIso, deps = {}) {
  const descripteur = descripteurDe(reseau)
  if (!descripteur) {
    const e = new Error('Ce réseau ne se connecte pas par autorisation.')
    e.status = 400
    throw e
  }

  const { clientId } = exigerIdentifiants(reseau)
  const redirection = deps.redirection ?? redirectionDe(reseau, base)
  const etat = deps.etat ?? nouvelEtat()

  // PKCE seulement quand le réseau l'exige : un `code_verifier` envoyé à un
  // réseau qui n'en attend pas est un paramètre inconnu, et certains refusent.
  const { verifieur, defi } = descripteur.pkce
    ? (deps.couple ?? nouveauCouplePkce())
    : { verifieur: null, defi: null }

  await (deps.deposer ?? deposer)(
    { etat, espaceId, reseau, verifieur, redirection, retour },
    maintenantIso,
  )

  return { url: adresseDAutorisation(descripteur, { clientId, redirection, state: etat, defi }) }
}

/**
 * Termine une autorisation : vérifie le retour, échange le code.
 *
 * @returns {Promise<{reseau, espaceId, retour, jetons}>}
 */
export async function terminer({ espaceId, code, etat }, maintenantIso, deps = {}) {
  const attente = await (deps.consommer ?? consommer)({ etat, espaceId }, maintenantIso)

  if (!attente.ok) {
    /**
     * ⚠ UNE SEULE PHRASE POUR TOUTES LES RAISONS DE REJET.
     *
     * « État inconnu », « état expiré » et « espace différent » ne se
     * distinguent pas côté créateur : dans les trois cas il recommence, et le
     * geste est le même. Les distinguer à l'écran renseignerait en revanche
     * quelqu'un qui teste des états forgés sur ce qui est passé et ce qui n'est
     * pas passé. La raison précise part au journal.
     */
    console.warn(`[oauth] retour rejeté — ${attente.raison}`)
    const e = new Error(
      'Cette autorisation n’est plus valable. Relance la connexion depuis l’écran Connexions.',
    )
    e.status = 400
    e.raison = attente.raison
    throw e
  }

  const descripteur = descripteurDe(attente.reseau)
  const { clientId, clientSecret } = exigerIdentifiants(attente.reseau)

  const brut = await demanderJetons(
    attente.reseau,
    descripteur,
    corpsDEchange(descripteur, {
      code,
      clientId,
      clientSecret,
      redirection: attente.redirection,
      verifieur: attente.verifieur,
    }),
    { clientId, clientSecret, appel: deps.appel },
  )

  const jetons = rangerJetons(brut, maintenantIso)
  if (!jetons) {
    const e = new Error('Ce réseau n’a pas rendu d’autorisation utilisable.')
    e.status = 502
    throw e
  }

  return { reseau: attente.reseau, espaceId: attente.espaceId, retour: attente.retour, jetons }
}

/**
 * Renouvelle un jeton.
 *
 * ⚠ Rend `null` quand il n'y a rien à renouveler, au lieu de lever : un compte
 * sans jeton de rafraîchissement n'est pas une panne, c'est un compte à
 * reconnecter — et l'écran Connexions sait déjà le dire (EXG-CNX-002).
 */
export async function rafraichir({ reseau, refresh }, maintenantIso, deps = {}) {
  if (!refresh) return null

  const descripteur = descripteurDe(reseau)
  if (!descripteur) return null

  const { clientId, clientSecret } = exigerIdentifiants(reseau)
  const brut = await demanderJetons(
    reseau,
    descripteur,
    corpsDeRafraichissement(descripteur, { refresh, clientId, clientSecret }),
    { clientId, clientSecret, appel: deps.appel },
  )

  // ⚠ L'ancien refresh est passé en repli : Google ne le renvoie qu'à la
  // première autorisation, et l'écraser déconnecterait le créateur en silence.
  return rangerJetons(brut, maintenantIso, refresh)
}

/**
 * Retire l'autorisation CHEZ LA PLATEFORME (EXG-CNX-005).
 *
 * ⚠ Rend `false` — et ne lève pas — quand le réseau ne sait pas révoquer par
 * API. Une déconnexion qui ne déconnecte pas doit s'avouer, pas planter :
 * l'écran dira que l'autorisation reste à retirer côté plateforme.
 */
export async function revoquer({ reseau, jeton }, deps = {}) {
  const descripteur = descripteurDe(reseau)
  if (!descripteur?.revocation || !jeton) return false

  const { clientId, clientSecret } = identifiantsDe(reseau) ?? {}
  const appel = deps.appel ?? fetch

  try {
    const reponse = await appel(descripteur.revocation, {
      method: 'POST',
      headers: entetesDEchange(descripteur, { clientId, clientSecret }),
      body: new URLSearchParams({ token: jeton }).toString(),
      signal: AbortSignal.timeout(DELAI_MS),
    })
    return reponse.ok
  } catch {
    // Une révocation qui échoue ne doit pas empêcher le créateur de retirer le
    // compte de SON écran. On rend `false` : la ligne part, et l'écran dit que
    // l'autorisation reste à retirer sur la plateforme.
    return false
  }
}

export { doitRafraichir }
