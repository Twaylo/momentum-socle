/**
 * Le verrou d'entrée : un mot de passe unique, en variable d'environnement.
 *
 * ── POURQUOI SI PEU ──────────────────────────────────────────────────────────
 *
 * Momentum est un outil personnel, à un seul utilisateur. Il n'y a pas de compte
 * à créer, pas d'inscription, pas de mot de passe haché en base : la variable
 * `MOT_DE_PASSE` EST le mot de passe. L'ancien dépôt avait un vrai système de
 * comptes — sessions, espaces séparés, hachage argon2 — qui appartient à un
 * produit multi-utilisateurs, hors périmètre ici.
 *
 * Ce que ce verrou empêche, et c'est tout ce qu'on lui demande : que n'importe
 * qui tombant sur l'adresse publique puisse ouvrir l'écran Réglages, déclencher
 * une autorisation OAuth sur la chaîne du fondateur, ou lire l'état de ses
 * comptes.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { enProduction, motDePasse } from './config.js'

export const NOM_COOKIE = 'mm_verrou'

/** Trente jours : assez long pour ne pas redemander sans cesse, assez court pour tourner. */
const DUREE_MS = 30 * 24 * 3600_000

/**
 * ⚠ LA CLÉ DE SIGNATURE EST DÉRIVÉE DE `CLE_CHIFFREMENT`, PAS DU MOT DE PASSE.
 *
 * Dérivée, et non réutilisée telle quelle : une même clé qui signe ET chiffre
 * laisse une signature volée servir d'oracle sur le chiffrement. Le préfixe
 * sépare les deux usages.
 *
 * Elle n'est pas dérivée du mot de passe non plus : changer le mot de passe doit
 * invalider les cookies, ce que `empreinteDuMotDePasse` assure explicitement —
 * mais un mot de passe court donnerait une clé de signature faible, et celle-là
 * protège l'accès entier.
 */
function cleDeSignature() {
  const brute = process.env.CLE_CHIFFREMENT || ''
  if (!brute) throw new Error('CLE_CHIFFREMENT est absente : le verrou ne peut pas signer.')
  return createHmac('sha256', brute).update('verrou-v1').digest()
}

/**
 * Une empreinte du mot de passe courant, glissée dans le cookie.
 *
 * ⚠ POURQUOI. Sans elle, changer `MOT_DE_PASSE` ne déconnecterait personne : les
 * cookies déjà signés resteraient valables trente jours. Or on change un mot de
 * passe précisément parce qu'on veut couper un accès.
 */
function empreinteDuMotDePasse() {
  return createHmac('sha256', cleDeSignature()).update(motDePasse()).digest('hex').slice(0, 16)
}

function signer(charge) {
  return createHmac('sha256', cleDeSignature()).update(charge).digest('base64url')
}

/** La valeur à poser dans le cookie. */
export function jetonDeVerrou(maintenantMs = Date.now()) {
  const charge = `${maintenantMs + DUREE_MS}.${empreinteDuMotDePasse()}`
  return `${charge}.${signer(charge)}`
}

/**
 * Le cookie présenté est-il le nôtre, non périmé, et signé avec le mot de passe
 * courant ?
 */
export function jetonValide(valeur, maintenantMs = Date.now()) {
  if (typeof valeur !== 'string' || valeur.length === 0) return false

  const morceaux = valeur.split('.')
  if (morceaux.length !== 3) return false

  const [expire, empreinte, signature] = morceaux
  const attendue = signer(`${expire}.${empreinte}`)
  if (!egalEnTempsConstant(signature, attendue)) return false
  if (!egalEnTempsConstant(empreinte, empreinteDuMotDePasse())) return false

  const echeance = Number(expire)
  return Number.isFinite(echeance) && echeance > maintenantMs
}

/**
 * ⚠ COMPARAISON EN TEMPS CONSTANT.
 *
 * Avec `===`, le temps de réponse dépend du nombre de caractères justes au
 * début : on devine un mot de passe caractère par caractère, sans jamais le
 * connaître. `timingSafeEqual` exige deux tampons de MÊME longueur — d'où le
 * test de longueur d'abord, qui, lui, ne révèle que la longueur.
 */
export function egalEnTempsConstant(a, b) {
  const ta = Buffer.from(String(a ?? ''), 'utf8')
  const tb = Buffer.from(String(b ?? ''), 'utf8')
  if (ta.length === 0 || ta.length !== tb.length) return false
  return timingSafeEqual(ta, tb)
}

/** Le mot de passe fourni est-il le bon ? */
export function motDePasseJuste(fourni) {
  const attendu = motDePasse()
  if (!attendu) return false
  return egalEnTempsConstant(fourni, attendu)
}

/** Les options du cookie. `Secure` seulement en production, sinon il ne part pas en local. */
export function optionsCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: enProduction,
    maxAge: DUREE_MS,
    path: '/',
  }
}

/**
 * Le garde-barrière des routes.
 *
 * ⚠ Rend 401 sans jamais dire pourquoi le jeton est refusé : périmé, mal signé
 * ou forgé, c'est la même réponse. Distinguer renseignerait celui qui essaie.
 */
export function exigerVerrou(req, res, suite) {
  const cookie = req.cookies?.[NOM_COOKIE]
  if (!jetonValide(cookie)) {
    res.status(401).json({ erreur: 'verrou', message: 'Entre le mot de passe.' })
    return
  }
  suite()
}

/** Un mot de passe de dépannage, jamais utilisé automatiquement — pour les messages d'aide. */
export function suggestionDeMotDePasse() {
  return randomBytes(18).toString('base64url')
}
