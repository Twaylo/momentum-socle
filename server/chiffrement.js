import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Chiffrement au repos des jetons OAuth (EXG-TEC-040).
 *
 * Repris de l'itération précédente, comme le chapitre 28.3 y autorise : c'est la
 * mise en œuvre directe d'une exigence bloquante, déjà éprouvée. Adapté à la
 * nomenclature V2 et à la configuration par `CLE_CHIFFREMENT`.
 *
 * Pourquoi c'est bloquant, concrètement : en clair sur le disque, un jeton de
 * rafraîchissement volé donne le contrôle de la chaîne YouTube du créateur. La
 * base n'est pas un endroit sûr, c'est un endroit pratique.
 *
 * AES-256-GCM plutôt que CBC : GCM authentifie le message. Un chiffré modifié en
 * base est REJETÉ au déchiffrement au lieu de produire un texte altéré qu'on
 * enverrait ensuite à une plateforme.
 */

let cleEnCache = null

/**
 * ⚠ LA CLÉ VIENT DE L'ENVIRONNEMENT, ET DE NULLE PART AILLEURS.
 *
 * ── UN REPLI RETIRÉ, ET POURQUOI ─────────────────────────────────────────────
 *
 * La version d'origine de ce fichier avait un repli : hors production, elle
 * générait une clé et l'écrivait dans `.donnees/.cle-chiffrement`. Le garde-fou
 * ne se déclenchait donc que si `NODE_ENV` valait exactement `production`.
 *
 * Ce repli a été retiré ici, parce qu'il transforme une variable oubliée en
 * panne silencieuse. Sur un hébergeur dont le disque est effacé à chaque
 * redéploiement, une clé écrite sur ce disque disparaît à la mise en ligne
 * suivante : les jetons rangés deviennent illisibles, et il faut reconnecter
 * YouTube — sans qu'aucune erreur ne dise pourquoi. Il aurait suffi d'oublier
 * `NODE_ENV=production` pour l'obtenir.
 *
 * Le défaut a été trouvé en LANÇANT le serveur sans la variable, pas en relisant
 * le code : le garde-fou du démarrage ne s'était pas déclenché.
 *
 * Une variable manquante doit arrêter le serveur, jamais fabriquer un secret
 * jetable à sa place.
 */
function chargerCle() {
  if (cleEnCache) return cleEnCache

  const depuisEnv = process.env.CLE_CHIFFREMENT
  if (!depuisEnv) {
    throw new Error(
      'CLE_CHIFFREMENT est absente. Sans clé STABLE, les jetons deviennent illisibles ' +
        'au prochain déploiement et il faut tout reconnecter.',
    )
  }
  if (!/^[0-9a-f]{64}$/i.test(depuisEnv)) {
    throw new Error('CLE_CHIFFREMENT doit faire 64 caractères hexadécimaux (32 octets).')
  }

  cleEnCache = Buffer.from(depuisEnv, 'hex')
  return cleEnCache
}

/** Vide le cache de clé. Utilisé par les tests. */
export function oublierLaCle() {
  cleEnCache = null
}

/**
 * Vérifie la clé AU DÉMARRAGE.
 *
 * Sans cet appel, le garde-fou de production ne se déclenche qu'au premier
 * compte connecté : le serveur démarre, sert des pages, et casse au moment
 * précis où un créateur confie ses identifiants. Un serveur qui refuse de
 * démarrer est franc ; un serveur qui démarre et tombe au premier geste est un
 * piège. Le défaut a été trouvé en vérifiant au navigateur, pas en compilant.
 */
export function verifierLaCle() {
  chargerCle()
}

const MARQUE = 'v1'

/**
 * Chiffre une valeur. Le résultat porte son format en préfixe, pour qu'une
 * rotation d'algorithme puisse un jour cohabiter avec l'ancien.
 * Forme : `v1:<iv>:<tag>:<chiffré>`, tout en base64url.
 */
export function chiffrer(clair) {
  if (clair === null || clair === undefined) return null
  const iv = randomBytes(12)
  const chiffreur = createCipheriv('aes-256-gcm', chargerCle(), iv)
  const corps = Buffer.concat([chiffreur.update(String(clair), 'utf8'), chiffreur.final()])
  const tag = chiffreur.getAuthTag()
  return [MARQUE, iv.toString('base64url'), tag.toString('base64url'), corps.toString('base64url')].join(':')
}

/**
 * Déchiffre. Rend `null` sur une valeur illisible plutôt que de lever : une
 * ligne corrompue doit forcer une reconnexion, pas faire tomber le serveur pour
 * tous les autres comptes.
 */
export function dechiffrer(chiffre) {
  if (!chiffre) return null
  const parts = String(chiffre).split(':')
  if (parts.length !== 4 || parts[0] !== MARQUE) return null
  try {
    const dechiffreur = createDecipheriv('aes-256-gcm', chargerCle(), Buffer.from(parts[1], 'base64url'))
    dechiffreur.setAuthTag(Buffer.from(parts[2], 'base64url'))
    return Buffer.concat([
      dechiffreur.update(Buffer.from(parts[3], 'base64url')),
      dechiffreur.final(),
    ]).toString('utf8')
  } catch {
    // Tag invalide : la valeur a été modifiée, ou la clé a changé.
    return null
  }
}

/** Vrai si la valeur porte notre format. Sert à repérer un reste en clair. */
export function estChiffre(valeur) {
  return typeof valeur === 'string' && valeur.startsWith(`${MARQUE}:`)
}
