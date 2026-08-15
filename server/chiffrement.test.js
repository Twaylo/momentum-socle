import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { chiffrer, dechiffrer, estChiffre, oublierLaCle, verifierLaCle } from './chiffrement.js'

const CLE = 'a'.repeat(64)
let avant

beforeEach(() => {
  avant = process.env.CLE_CHIFFREMENT
  process.env.CLE_CHIFFREMENT = CLE
  oublierLaCle()
})

afterEach(() => {
  process.env.CLE_CHIFFREMENT = avant
  oublierLaCle()
})

describe('⚠ la clé de chiffrement', () => {
  test('⚠ sans CLE_CHIFFREMENT, le serveur DOIT refuser de démarrer', () => {
    /**
     * ⚠ CE TEST EXISTE À CAUSE D'UN DÉFAUT TROUVÉ EN LANÇANT LE SERVEUR.
     *
     * La version d'origine de ce fichier avait un repli : hors production, elle
     * générait une clé et l'écrivait dans `.donnees/.cle-chiffrement`. Le
     * garde-fou ne se déclenchait donc que si `NODE_ENV` valait exactement
     * `production`.
     *
     * Symptôme observé : `node server/index.js` sans aucune variable démarrait
     * la vérification de la clé sans broncher et passait à l'étape suivante.
     *
     * Conséquence si on l'avait laissé : sur un hébergeur dont le disque est
     * effacé à chaque redéploiement, la clé écrite sur ce disque disparaît à la
     * mise en ligne suivante. Les jetons rangés deviennent illisibles, et il
     * faut reconnecter YouTube — sans qu'aucune erreur ne dise pourquoi. Il
     * suffisait d'oublier `NODE_ENV=production`.
     */
    delete process.env.CLE_CHIFFREMENT
    oublierLaCle()
    assert.throws(() => verifierLaCle(), /CLE_CHIFFREMENT est absente/)
  })

  test('⚠ le repli qui écrivait une clé sur le disque n’existe plus', () => {
    // Même hors production : une variable manquante arrête le serveur, elle ne
    // fabrique pas un secret jetable à sa place.
    const memeEnDev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    delete process.env.CLE_CHIFFREMENT
    oublierLaCle()
    assert.throws(() => verifierLaCle(), /CLE_CHIFFREMENT est absente/)
    process.env.NODE_ENV = memeEnDev
  })

  test('une clé mal formée est refusée, pas rabotée', () => {
    process.env.CLE_CHIFFREMENT = 'trop-court'
    oublierLaCle()
    assert.throws(() => verifierLaCle(), /64 caractères hexadécimaux/)
  })
})

describe('⚠ chiffrer et déchiffrer', () => {
  test('un aller-retour rend exactement la valeur d’origine', () => {
    const secret = 'ya29.jeton-de-rafraichissement-google'
    assert.equal(dechiffrer(chiffrer(secret)), secret)
  })

  test('le chiffré ne laisse pas voir le clair', () => {
    const c = chiffrer('mon-jeton-secret')
    assert.doesNotMatch(c, /mon-jeton-secret/)
    assert.equal(estChiffre(c), true)
  })

  test('deux chiffrements de la même valeur diffèrent', () => {
    // Sinon deux comptes portant le même jeton seraient reconnaissables en base.
    assert.notEqual(chiffrer('x'), chiffrer('x'))
  })

  test('⚠ un chiffré modifié rend null, jamais un texte de travers', () => {
    /**
     * AES-256-GCM authentifie le message. Sans cette propriété, une valeur
     * altérée en base produirait un texte modifié qu'on enverrait ensuite à
     * Google — et le refus arriverait sans qu'on sache d'où il vient.
     *
     * `dechiffrer` rend `null` plutôt que de lever. C'est acceptable ICI, mais
     * ça déplace la responsabilité : `null` est indiscernable de « pas de
     * jeton ». C'est `compteAvecJetons` qui doit faire la différence, et un test
     * de `comptes-sociaux` s'en charge.
     */
    const c = chiffrer('jeton')
    const abime = `${c.slice(0, -4)}AAAA`
    assert.equal(dechiffrer(abime), null)
  })

  test('⚠ une clé changée rend null, elle ne rend pas l’ancien jeton', () => {
    const c = chiffrer('ya29.jeton')
    process.env.CLE_CHIFFREMENT = 'b'.repeat(64)
    oublierLaCle()
    assert.equal(dechiffrer(c), null)
  })
})
