import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { comparerLesPortees, sonderYoutube } from './sonde-youtube.js'
import { DESCRIPTEURS } from '../noyau/oauth-reseaux.js'

/**
 * ⚠ CE FICHIER EXISTE À CAUSE D'UN DÉFAUT VÉCU, PAS PAR PRINCIPE.
 *
 * L'ancien dépôt avait quatre sondes de diagnostic. Aucune n'était testée, et
 * elles avaient toutes la même faille : elles refaisaient leurs propres appels
 * au lieu de passer par le moteur, avec les paramètres recopiés à la main des
 * deux côtés. La sonde « historique » écrivait son intervalle de 29 jours à
 * deux endroits différents, qui pouvaient diverger sans que rien ne le signale.
 *
 * Et surtout : elles n'affichaient jamais le corps brut, seulement un résumé
 * tronqué à 300 caractères — alors que la panne cherchée est presque toujours
 * dans la partie coupée.
 */

const T0 = '2026-08-15T10:00:00.000Z'

function reponse(corps, statut = 200) {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps)
  return {
    status: statut,
    clone: () => ({ text: async () => texte }),
    json: async () => JSON.parse(texte),
    text: async () => texte,
  }
}

const compte = {
  ligne: { id: 1, expire_le: new Date(Date.parse(T0) + 3600_000) },
  acces: 'jeton-acces-secret',
  refresh: 'jeton-refresh-secret',
}

describe('⚠ les portées : trois états, jamais deux', () => {
  test('une portée demandée et accordée est accordée', () => {
    const r = comparerLesPortees(['a', 'b'], 'a b')
    assert.deepEqual(r.accordees, ['a', 'b'])
    assert.deepEqual(r.refusees, [])
  })

  test('⚠ une portée demandée et absente est REFUSÉE, pas « peut-être »', () => {
    /**
     * C'est la leçon de la sonde « jeton » de Meta : distinguer accordé, refusé
     * et jamais demandé. Une portée absente de la réponse explique un appel qui
     * échouera plus tard — la traiter comme incertaine reporte la découverte au
     * moment où le produit casse.
     */
    const r = comparerLesPortees(['a', 'b'], 'a')
    assert.deepEqual(r.accordees, ['a'])
    assert.deepEqual(r.refusees, ['b'])
  })

  test('une portée accordée sans avoir été demandée est signalée à part', () => {
    // `include_granted_scopes=true` fait remonter des portées accordées lors
    // d'une autorisation précédente. Les fondre dans « accordées » masquerait
    // qu'on détient plus que ce que ce chantier demande.
    const r = comparerLesPortees(['a'], 'a z')
    assert.deepEqual(r.enPlus, ['z'])
  })

  test('aucune portée accordée ne rend pas une liste fantôme', () => {
    const r = comparerLesPortees(['a'], null)
    assert.deepEqual(r.accordees, [])
    assert.deepEqual(r.refusees, ['a'])
    assert.deepEqual(r.enPlus, [])
  })
})

describe('⚠ la sonde emprunte le chemin du moteur', () => {
  test('⚠ elle appelle les MÊMES fonctions que le produit, pas des copies', async () => {
    /**
     * Le défaut de l'ancien dépôt : la sonde « Pages » demandait une liste de
     * champs DIFFÉRENTE de celle du moteur. Elle mesurait donc autre chose que
     * ce que le produit faisait, et son verdict ne prouvait rien.
     *
     * Ici on vérifie que ce sont bien `jetonFrais` et `identiteDe` — les
     * fonctions du produit — qui sont appelées, et pas une reconstruction.
     */
    const appelees = []
    const rapport = await sonderYoutube(compte, T0, {
      appel: async (url) => {
        appelees.push(String(url))
        return reponse({ scope: DESCRIPTEURS.youtube.portees.join(' '), expires_in: 3599 })
      },
      jetonFrais: async () => {
        appelees.push('jetonFrais')
        return { acces: 'a2', refresh: 'r2', expireLe: null, renouvele: true }
      },
      identiteDe: async () => {
        appelees.push('identiteDe')
        return { externeId: 'UC42', nomAffiche: 'Twaylo', abonnes: null }
      },
    })

    assert.ok(appelees.includes('jetonFrais'), 'le jeton passe par le moteur')
    assert.ok(appelees.includes('identiteDe'), 'l’identité passe par le moteur')
    assert.equal(rapport.identite.nomAffiche, 'Twaylo')
  })

  test('⚠ elle dit quand elle a renouvelé le jeton', () => {
    // Emprunter le vrai chemin peut renouveler le jeton et écrire en base. Le
    // taire ferait de la sonde un menteur d'un autre genre.
    return sonderYoutube(compte, T0, {
      appel: async () => reponse({ scope: '', expires_in: 10 }),
      jetonFrais: async () => ({ acces: 'a2', renouvele: true }),
      identiteDe: async () => ({ externeId: 'UC42' }),
    }).then((r) => assert.equal(r.renouvele, true))
  })

  test('⚠ le corps brut n’est PAS tronqué', async () => {
    /**
     * Les quatre sondes de l'ancien dépôt coupaient à 300 caractères. La panne
     * cherchée est presque toujours dans la partie coupée : ici, le message
     * d'erreur de Google est au-delà du 300ᵉ caractère.
     */
    const long = 'x'.repeat(400)
    const rapport = await sonderYoutube(compte, T0, {
      appel: async () => reponse({ bourrage: long, message: 'la vraie cause' }),
      jetonFrais: async () => ({ acces: 'a2', renouvele: false }),
      identiteDe: async () => ({ externeId: 'UC42' }),
    })

    const brut = rapport.appels.map((a) => a.brut).join('')
    assert.ok(brut.length > 300, 'le corps a été tronqué')
    assert.match(brut, /la vraie cause/)
  })

  test('⚠ aucun jeton n’apparaît dans le rapport', async () => {
    /**
     * L'adresse de `tokeninfo` porte le jeton d'accès en clair. Un rapport de
     * diagnostic qui l'affiche est un jeton fuité — dans une capture d'écran,
     * dans un copier-coller de dépannage, dans un journal.
     */
    const rapport = await sonderYoutube(compte, T0, {
      appel: async (url) => reponse({ vu: String(url) }),
      jetonFrais: async () => ({ acces: 'jeton-acces-secret', renouvele: false }),
      identiteDe: async () => ({ externeId: 'UC42' }),
    })

    const texte = JSON.stringify({ ...rapport, appels: rapport.appels.map((a) => a.adresse) })
    assert.doesNotMatch(texte, /jeton-acces-secret/)
    assert.doesNotMatch(texte, /jeton-refresh-secret/)
  })

  test('⚠ une panne du jeton est rendue, pas avalée', async () => {
    const rapport = await sonderYoutube(compte, T0, {
      appel: async () => reponse({}),
      jetonFrais: async () => {
        throw new Error('invalid_grant')
      },
    })
    assert.match(rapport.erreur, /invalid_grant/)
  })
})
