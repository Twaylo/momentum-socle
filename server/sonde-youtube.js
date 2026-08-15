/**
 * La sonde Google.
 *
 * ── CE QU'ELLE DOIT TENIR, ET QUE LES ANCIENNES NE TENAIENT PAS ──────────────
 *
 * L'ancien dépôt avait quatre sondes. Toutes Meta, aucune testée, et surtout :
 * elles n'affichaient JAMAIS le corps brut. Le mécanisme existait dans le
 * fichier, mais elles étaient appelées sans lui — elles rendaient un résumé
 * fabriqué à la main, tronqué à 300 caractères. Trois d'entre elles refaisaient
 * leurs propres appels au lieu de passer par le moteur, avec les paramètres
 * recopiés à la main de part et d'autre.
 *
 * Celle-ci fait l'inverse, et c'est tout son intérêt :
 *
 * 1. Elle appelle EXACTEMENT les fonctions du moteur — `jetonFrais` puis
 *    `identiteDe` — au lieu d'en refaire une copie. Un instrument qui ne mesure
 *    pas la même chose que le produit ment.
 * 2. Elle leur injecte un capteur qui enregistre la réponse BRUTE au passage,
 *    non tronquée.
 * 3. Elle dit si le jeton a été renouvelé pendant la mesure : emprunter le vrai
 *    chemin a cet effet de bord, et le taire ferait de la sonde un menteur d'un
 *    autre genre.
 */
import { jetonFrais } from './connecteurs/oauth.js'
import { identiteDe } from './oauth/identite.js'
import { caviarder } from '../noyau/lecture-reponse.js'
import { DESCRIPTEURS } from '../noyau/oauth-reseaux.js'

const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo'

/** L'adresse, jeton retiré. Un jeton dans un écran de diagnostic est un jeton fuité. */
function adresseMontrable(url) {
  return String(url).replace(/(access_token|key)=[^&]*/g, '$1=…')
}

/**
 * Enveloppe un appel réseau pour garder ce qui est passé.
 *
 * ⚠ LE CORPS N'EST PAS TRONQUÉ. C'est la raison d'être de la sonde : la panne
 * qu'on cherche est presque toujours dans la partie qu'un résumé coupe.
 */
function capteur(appel, journal) {
  return async (url, options) => {
    const reponse = await appel(url, options)
    const texte = await reponse.clone().text()
    journal.push({
      adresse: adresseMontrable(url),
      statut: reponse.status,
      brut: caviarder(texte),
    })
    return reponse
  }
}

/**
 * Compare ce qu'on a demandé à ce que Google a réellement accordé.
 *
 * Trois états, jamais deux : accordée, refusée, accordée en plus. Une portée
 * demandée et absente de la réponse n'est pas « peut-être là » — elle est
 * refusée, et c'est ce qui explique un appel qui échoue plus tard.
 */
export function comparerLesPortees(demandees, accordeesBrutes) {
  const accordees = String(accordeesBrutes ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const jeu = new Set(accordees)

  return {
    accordees: demandees.filter((p) => jeu.has(p)),
    refusees: demandees.filter((p) => !jeu.has(p)),
    enPlus: accordees.filter((p) => !demandees.includes(p)),
  }
}

/**
 * @param {{ligne: object, acces: string, refresh: string|null}} compte
 * @returns {Promise<object>} le rapport, tel qu'il part à l'écran.
 */
export async function sonderYoutube(compte, maintenantIso, deps = {}) {
  const appel = deps.appel ?? fetch
  const obtenirJeton = deps.jetonFrais ?? jetonFrais
  const lireIdentite = deps.identiteDe ?? identiteDe

  const journal = []
  const espion = capteur(appel, journal)
  const rapport = {
    mesureLe: maintenantIso,
    renouvele: false,
    portees: null,
    identite: null,
    appels: journal,
    erreur: null,
  }

  // 1. Le jeton, par le chemin du moteur — celui qui renouvelle si besoin.
  let frais = null
  try {
    frais = await obtenirJeton(
      { reseau: 'youtube', jeton: compte.acces, refresh: compte.refresh, expireLe: compte.ligne.expire_le },
      maintenantIso,
      { appel: espion },
    )
    rapport.renouvele = Boolean(frais?.renouvele)
  } catch (e) {
    rapport.erreur = `jeton : ${e?.message ?? String(e)}`
    return rapport
  }

  const acces = frais?.acces ?? compte.acces

  // 2. Ce que le jeton porte vraiment. C'est l'équivalent Google de la sonde
  //    « jeton » de Meta — qui n'existait que pour Meta.
  try {
    const r = await espion(`${TOKENINFO}?access_token=${encodeURIComponent(acces)}`)
    const corps = await r.json().catch(() => ({}))
    rapport.portees = {
      ...comparerLesPortees(DESCRIPTEURS.youtube.portees, corps.scope),
      expireDansSecondes: Number.isFinite(Number(corps.expires_in))
        ? Number(corps.expires_in)
        : null,
    }
  } catch (e) {
    rapport.erreur = `portées : ${e?.message ?? String(e)}`
  }

  // 3. La lecture de chaîne que le moteur fait pour identifier le compte,
  //    avec les mêmes paramètres — parce que c'est la même fonction.
  try {
    rapport.identite = await lireIdentite('youtube', acces, { appel: espion })
  } catch (e) {
    rapport.erreur = rapport.erreur ?? `identité : ${e?.message ?? String(e)}`
  }

  return rapport
}
