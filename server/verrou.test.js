import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import {
  egalEnTempsConstant,
  jetonDeVerrou,
  jetonValide,
  motDePasseJuste,
} from './verrou.js'

/**
 * Le verrou est la seule chose entre l'adresse publique et les comptes du
 * fondateur. Chaque test ci-dessous fige une façon de le contourner.
 */

const CLE = 'a'.repeat(64)
let avant

beforeEach(() => {
  avant = { cle: process.env.CLE_CHIFFREMENT, mdp: process.env.MOT_DE_PASSE }
  process.env.CLE_CHIFFREMENT = CLE
  process.env.MOT_DE_PASSE = 'ouvre-toi'
})

afterEach(() => {
  process.env.CLE_CHIFFREMENT = avant.cle
  process.env.MOT_DE_PASSE = avant.mdp
})

describe('⚠ le mot de passe', () => {
  test('le bon mot de passe passe, un autre ne passe pas', () => {
    assert.equal(motDePasseJuste('ouvre-toi'), true)
    assert.equal(motDePasseJuste('ouvre-toj'), false)
  })

  test('⚠ un mot de passe VIDE ne passe jamais', () => {
    /**
     * Le piège : `'' === ''` est vrai. Si `MOT_DE_PASSE` n'était pas renseignée
     * et qu'on envoyait un champ vide, le verrou s'ouvrirait pour tout le monde
     * — c'est-à-dire qu'il n'existerait pas.
     */
    assert.equal(motDePasseJuste(''), false)

    process.env.MOT_DE_PASSE = ''
    assert.equal(motDePasseJuste(''), false)
    assert.equal(motDePasseJuste('quoi que ce soit'), false)
  })

  test('un préfixe juste ne suffit pas', () => {
    assert.equal(motDePasseJuste('ouvre'), false)
    assert.equal(motDePasseJuste('ouvre-toi-et-plus'), false)
  })

  test('⚠ la comparaison ne s’arrête pas au premier caractère différent', () => {
    // On ne mesure pas un temps dans un test, ce serait instable. On vérifie que
    // deux longueurs égales rendent le même verdict par le même chemin.
    assert.equal(egalEnTempsConstant('abc', 'abd'), false)
    assert.equal(egalEnTempsConstant('abc', 'zzz'), false)
    assert.equal(egalEnTempsConstant('abc', 'abc'), true)
    assert.equal(egalEnTempsConstant('', ''), false)
    assert.equal(egalEnTempsConstant(null, null), false)
  })
})

describe('⚠ le cookie du verrou', () => {
  test('un jeton fraîchement émis est valable', () => {
    assert.equal(jetonValide(jetonDeVerrou()), true)
  })

  test('un jeton forgé ou tronqué ne passe pas', () => {
    assert.equal(jetonValide('n’importe quoi'), false)
    assert.equal(jetonValide(''), false)
    assert.equal(jetonValide(undefined), false)

    const vrai = jetonDeVerrou()
    assert.equal(jetonValide(vrai.slice(0, -3)), false, 'signature tronquée')
    assert.equal(jetonValide(`${vrai}x`), false, 'signature rallongée')
  })

  test('⚠ repousser l’échéance à la main ne marche pas', () => {
    /**
     * L'échéance est DANS la charge signée. La changer invalide la signature —
     * sinon il suffirait d'éditer le cookie dans le navigateur pour se donner
     * dix ans d'accès.
     */
    const vrai = jetonDeVerrou()
    const [, empreinte, signature] = vrai.split('.')
    const trafique = `${Date.now() + 10 * 365 * 24 * 3600_000}.${empreinte}.${signature}`
    assert.equal(jetonValide(trafique), false)
  })

  test('un jeton périmé ne passe plus', () => {
    const t0 = Date.now()
    const jeton = jetonDeVerrou(t0)
    assert.equal(jetonValide(jeton, t0 + 31 * 24 * 3600_000), false)
  })

  test('⚠ changer MOT_DE_PASSE invalide les cookies déjà émis', () => {
    /**
     * ⚠ CE TEST EXISTE POUR UNE RAISON PRÉCISE.
     *
     * Sans l'empreinte du mot de passe dans le cookie, changer `MOT_DE_PASSE` ne
     * déconnecterait personne : les cookies signés resteraient valables trente
     * jours. Or on change un mot de passe précisément quand on veut couper un
     * accès — le verrou aurait alors l'air de fonctionner tout en ne coupant
     * rien.
     */
    const jeton = jetonDeVerrou()
    assert.equal(jetonValide(jeton), true)

    process.env.MOT_DE_PASSE = 'un-autre'
    assert.equal(jetonValide(jeton), false)
  })

  test('⚠ changer CLE_CHIFFREMENT invalide aussi les cookies', () => {
    const jeton = jetonDeVerrou()
    process.env.CLE_CHIFFREMENT = 'b'.repeat(64)
    assert.equal(jetonValide(jeton), false)
  })
})
