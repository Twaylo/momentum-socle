import { createHash, randomBytes } from 'node:crypto'

import { etatValide } from '../../noyau/oauth.js'
import { chiffrer, dechiffrer } from '../chiffrement.js'
import { executer, un } from '../db/index.js'

/**
 * Les autorisations EN COURS — la moitié invisible du flux OAuth.
 *
 * ── CE QUE CE FICHIER EMPÊCHE ────────────────────────────────────────────────
 *
 * Un créateur part autoriser Momentum chez TikTok. Il quitte le produit. Au
 * retour, la plateforme nous rend un `code` et un `state`, et rien d'autre.
 *
 * Sans ce qui est gardé ici, on ne saurait pas si ce retour est le NÔTRE. Un
 * lien de retour forgé — envoyé par message, cliqué une fois — rattacherait le
 * compte d'un inconnu à l'espace du créateur, qui publierait ensuite sur une
 * chaîne qui n'est pas la sienne. La faille est silencieuse : rien à l'écran ne
 * la signale, et le premier symptôme est une vidéo qui part chez quelqu'un
 * d'autre.
 *
 * ── ⚠ TROIS PROPRIÉTÉS, TROIS RAISONS ────────────────────────────────────────
 *
 * L'ÉTAT EST À USAGE UNIQUE. Il est effacé à la lecture. Un état rejouable est
 * un état réutilisable, donc une autorisation qu'on peut faire aboutir deux
 * fois — dont une fois par quelqu'un d'autre.
 *
 * L'ÉTAT PÉRIME. Une autorisation abandonnée hier ne doit pas pouvoir être
 * terminée aujourd'hui : le créateur ne s'en souvient plus, donc il ne peut
 * plus juger de ce qu'il autorise.
 *
 * LE VÉRIFIEUR PKCE EST CHIFFRÉ. Avec lui et un code intercepté, on obtient le
 * jeton. C'est un secret court, mais c'en est un (EXG-TEC-040).
 */

/**
 * Durée de vie d'une autorisation en cours.
 *
 * Dix minutes : le temps de lire un écran de consentement, de se connecter à la
 * plateforme si on ne l'était pas, et de choisir une page. Assez court pour
 * qu'un lien oublié dans un historique ne serve plus à rien.
 */
export const DUREE_ATTENTE_MS = 10 * 60_000

/** Encodage base64 « URL » — celui qu'exige PKCE, sans `=`, `+` ni `/`. */
const base64url = (tampon) =>
  tampon.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

/**
 * Un état imprévisible.
 *
 * ⚠ `randomBytes`, jamais `Math.random()`. Le second est prévisible à partir de
 * quelques tirages : un attaquant qui observe un état devine les suivants, et
 * la protection tombe entièrement.
 */
export const nouvelEtat = () => base64url(randomBytes(32))

/**
 * Un couple PKCE : le vérifieur qu'on garde, le défi qu'on publie.
 *
 * Le défi est le SHA-256 du vérifieur. La plateforme ne voit que le défi à
 * l'ouverture ; au moment de l'échange on présente le vérifieur, ce qui prouve
 * que c'est bien nous qui avons ouvert l'autorisation — et pas quelqu'un qui
 * aurait intercepté le code au retour.
 */
export function nouveauCouplePkce() {
  const verifieur = base64url(randomBytes(48))
  return { verifieur, defi: base64url(createHash('sha256').update(verifieur).digest()) }
}

/** Range une autorisation en cours. Rend l'état à mettre dans l'adresse. */
export async function deposer({ etat, espaceId, reseau, verifieur, redirection, retour }, maintenantIso) {
  const expire = new Date(Date.parse(maintenantIso) + DUREE_ATTENTE_MS).toISOString()
  await executer(
    `INSERT INTO oauth_attente (etat, espace_id, reseau, verifieur_chiffre, redirection, retour, cree_le, expire_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [etat, espaceId, reseau, chiffrer(verifieur ?? null), redirection, retour ?? null, maintenantIso, expire],
  )
  return etat
}

/**
 * Consomme une autorisation en cours.
 *
 * ── ⚠ POURQUOI CETTE FONCTION EFFACE AVANT DE VALIDER ────────────────────────
 *
 * On efface la ligne dès qu'on l'a lue, y compris quand elle est périmée ou que
 * l'espace ne correspond pas. Un état qui survit à une tentative ratée peut être
 * retenté — et une protection qu'on peut retenter à volonté n'en est plus une.
 *
 * @returns {Promise<{ok: true, ...}|{ok: false, raison: string}>}
 */
export async function consommer({ etat, espaceId }, maintenantIso) {
  if (!etat) return { ok: false, raison: 'etat_absent' }

  const ligne = await un('SELECT * FROM oauth_attente WHERE etat = ?', [etat])
  if (!ligne) return { ok: false, raison: 'etat_inconnu' }

  await executer('DELETE FROM oauth_attente WHERE etat = ?', [etat])

  /**
   * ⚠ La comparaison passe par `etatValide` (temps constant) alors qu'on vient
   * de retrouver la ligne PAR l'état. C'est volontaire : le jour où cette
   * lecture deviendra une recherche par espace, la comparaison sera déjà au bon
   * endroit — et elle ne coûte rien.
   */
  if (!etatValide(ligne.etat, etat)) return { ok: false, raison: 'etat_invalide' }

  /**
   * ⚠ L'ESPACE DOIT CORRESPONDRE.
   *
   * Sans ce contrôle, un état volé à un créateur pourrait être terminé depuis la
   * session d'un AUTRE — qui récupérerait alors le compte connecté. C'est
   * exactement l'attaque que l'état sert à empêcher, retournée d'un cran.
   */
  if (espaceId && ligne.espace_id !== espaceId) return { ok: false, raison: 'espace_different' }

  if (Date.parse(ligne.expire_le) <= Date.parse(maintenantIso)) {
    return { ok: false, raison: 'expire' }
  }

  return {
    ok: true,
    espaceId: ligne.espace_id,
    reseau: ligne.reseau,
    verifieur: dechiffrer(ligne.verifieur_chiffre),
    redirection: ligne.redirection,
    retour: ligne.retour,
  }
}

/**
 * Efface les autorisations abandonnées.
 *
 * Appelée par l'entretien périodique. Sans elle, la table grossit d'une ligne
 * par clic sur « Connecter » qui n'aboutit pas — et ces lignes portent des
 * secrets, même courts.
 */
export async function purgerLesAttentes(maintenantIso) {
  const avant = await un('SELECT COUNT(*) AS n FROM oauth_attente WHERE expire_le <= ?', [maintenantIso])
  await executer('DELETE FROM oauth_attente WHERE expire_le <= ?', [maintenantIso])
  return Number(avant?.n ?? 0)
}
