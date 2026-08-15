import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { etatDe, instantDe, versVue } from './etat-jeton.js'

/**
 * Chaque test fige un défaut réellement vécu, avec son symptôme.
 */

const T0 = Date.parse('2026-08-15T10:00:00.000Z')
const HEURE = 3600_000
const JOUR = 24 * HEURE

/** Une chaîne YouTube fraîchement connectée : jeton d'une heure + refresh. */
const fraiche = {
  id: 1,
  reseau: 'youtube',
  nom: 'Twaylo',
  jeton_acces_chiffre: 'xxx',
  jeton_rafraichissement_chiffre: 'yyy',
  expire_le: new Date(T0 + HEURE),
  etat: 'actif',
  derniere_erreur: null,
}

describe('⚠ l’état d’un compte connecté', () => {
  test('⚠ un jeton Google d’une heure ne s’affiche PAS « à renouveler »', () => {
    /**
     * ⚠ LE DÉFAUT QUE CE TEST EMPÊCHE DE REVENIR.
     *
     * Google délivre des jetons d'accès qui durent UNE HEURE. Avec un préavis de
     * trois jours, une chaîne venait d'être autorisée et s'affichait déjà
     * « À renouveler — l'autorisation expire dans 1 jour ». Une heure plus tard
     * elle passait en rupture et disparaissait des réseaux publiables, pour un
     * compte parfaitement valide.
     *
     * Tant qu'un jeton de rafraîchissement existe, l'échéance de l'accès ne
     * regarde pas le fondateur : elle se règle seule avant chaque appel.
     */
    assert.equal(etatDe(fraiche, T0).cle, 'actif')
    assert.equal(etatDe(fraiche, T0).mot, 'Connecté')
  })

  test('⚠ le même jeton, une heure plus tard, reste « connecté »', () => {
    // C'est la seconde moitié du même défaut : l'accès a expiré, mais il se
    // renouvelle tout seul. Rien à annoncer.
    assert.equal(etatDe(fraiche, T0 + 2 * HEURE).cle, 'actif')
  })

  test('sans rafraîchissement, un accès expiré est bien une rupture', () => {
    const sansRefresh = { ...fraiche, jeton_rafraichissement_chiffre: null }
    const e = etatDe(sansRefresh, T0 + 2 * HEURE)
    assert.equal(e.cle, 'expire')
    assert.equal(e.gravite, 'rupture')
  })

  test('sans rafraîchissement, une échéance proche est annoncée en jours', () => {
    const sansRefresh = {
      ...fraiche,
      jeton_rafraichissement_chiffre: null,
      expire_le: new Date(T0 + 2 * JOUR),
    }
    const e = etatDe(sansRefresh, T0)
    assert.equal(e.cle, 'bientot')
    assert.match(e.phrase, /2 jours/)
  })

  test('⚠ une erreur enregistrée est montrée telle quelle, pas résumée', () => {
    /**
     * Un refus d'API avalé produit un chiffre faux au lieu d'une absence. Le
     * message de la plateforme est gardé mot pour mot jusqu'à l'écran : c'est
     * lui qui permet de comprendre, pas une phrase générique.
     */
    const cassee = {
      ...fraiche,
      etat: 'a_reconnecter',
      derniere_erreur: 'invalid_grant : Token has been expired or revoked.',
    }
    const e = etatDe(cassee, T0)
    assert.equal(e.cle, 'erreur')
    assert.equal(e.gravite, 'rupture')
    assert.match(e.phrase, /Token has been expired or revoked/)
  })

  test('un compte en erreur sans message ne reste pas muet', () => {
    const cassee = { ...fraiche, etat: 'a_reconnecter', derniere_erreur: null }
    assert.ok(etatDe(cassee, T0).phrase.length > 0)
  })
})

describe('⚠ trois états, jamais deux', () => {
  test('⚠ une échéance inconnue n’est ni « expiré » ni une date inventée', () => {
    /**
     * `expire_le` à `null` veut dire « la plateforme ne l'a pas dit ». Le
     * transformer en date, ou en « expiré », serait un mensonge à l'endroit
     * exact où l'écran doit dire la vérité.
     */
    const sansEcheance = { ...fraiche, expire_le: null }
    assert.equal(etatDe(sansEcheance, T0).cle, 'actif')

    const v = versVue(sansEcheance, T0)
    assert.equal(v.expireLe, null)
    assert.equal(v.expirationConnue, false)
  })

  test('une échéance connue est rendue avec son drapeau', () => {
    const v = versVue(fraiche, T0)
    assert.equal(v.expirationConnue, true)
    assert.equal(v.expireLe, '2026-08-15T11:00:00.000Z')
  })

  test('⚠ instantDe accepte une Date comme une chaîne', () => {
    /**
     * PostgreSQL rend un `timestamptz` sous forme d'objet `Date`. Le passer à
     * `Date.parse` donnerait `NaN`, donc « pas d’échéance » sur un compte qui en
     * a une — et le préavis ne se déclencherait jamais.
     */
    assert.equal(instantDe(new Date(T0)), T0)
    assert.equal(instantDe('2026-08-15T10:00:00.000Z'), T0)
    assert.equal(instantDe(null), null)
    assert.equal(instantDe(''), null)
    assert.equal(instantDe('n’importe quoi'), null)
  })
})

describe('⚠ ce qui sort vers l’écran', () => {
  test('⚠ AUCUN jeton ne traverse versVue', () => {
    /**
     * Ni l'accès, ni le rafraîchissement, ni leur forme chiffrée. Un `...ligne`
     * ferait sortir en clair toute colonne ajoutée plus tard, sans que personne
     * le voie : la fonction recopie champ par champ, et ce test le vérifie sur
     * le texte rendu.
     */
    const texte = JSON.stringify(versVue(fraiche, T0))
    assert.doesNotMatch(texte, /xxx|yyy/)
    assert.doesNotMatch(texte, /chiffre/)
    assert.equal(Object.hasOwn(versVue(fraiche, T0), 'jeton_acces_chiffre'), false)
  })

  test('la vue porte le nom de la chaîne et son état', () => {
    const v = versVue(fraiche, T0)
    assert.equal(v.nom, 'Twaylo')
    assert.equal(v.reseau, 'youtube')
    assert.equal(v.etat.cle, 'actif')
  })
})
