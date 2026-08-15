import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { doitRafraichir, lireEchec, rangerJetons } from './oauth.js'
import { DESCRIPTEURS } from './oauth-reseaux.js'

/**
 * La seconde moitié des tests d'`oauth.js` : ce qui arrive APRÈS l'échange —
 * ranger les jetons, décider quand les rafraîchir, lire un refus. Plus la
 * cohérence des descripteurs.
 *
 * La première moitié est dans `oauth.test.js`. Deux fichiers parce qu'un seul
 * dépasserait 300 lignes.
 */

describe('⚠ le rangement des jetons', () => {
  const t0 = '2026-08-13T10:00:00.000Z'

  test('expires_in est une DURÉE : elle devient une date', () => {
    /**
     * La ranger telle quelle donnerait « expire en 1970 » : le jeton serait
     * rafraîchi à chaque appel — ou jamais, selon le sens de la comparaison.
     */
    const j = rangerJetons({ access_token: 'a', expires_in: 3600 }, t0)
    assert.equal(j.expireLe, '2026-08-13T11:00:00.000Z')
  })

  test('⚠ un rafraîchissement SANS nouveau refresh_token garde l’ancien', () => {
    /**
     * C'est LE piège de Google : il ne rend le jeton de rafraîchissement qu'à la
     * première autorisation. Écraser l'ancien par `undefined` déconnecterait le
     * créateur au premier rafraîchissement — silencieusement, et sans qu'il ait
     * rien fait.
     */
    const j = rangerJetons({ access_token: 'a2', expires_in: 3600 }, t0, 'ancien-refresh')
    assert.equal(j.refresh, 'ancien-refresh')
  })

  test('un nouveau refresh_token remplace bien l’ancien', () => {
    const j = rangerJetons({ access_token: 'a2', refresh_token: 'neuf' }, t0, 'ancien')
    assert.equal(j.refresh, 'neuf')
  })

  test('⚠ sans jeton d’accès, on rend null — pas un objet à moitié vide', () => {
    // Un objet à moitié vide serait enregistré, et le compte s'afficherait
    // « Connecté » alors qu'aucune publication ne peut partir.
    assert.equal(rangerJetons({ error: 'invalid_grant' }, t0), null)
    assert.equal(rangerJetons(null, t0), null)
  })

  test('sans expires_in, la date reste inconnue — pas inventée', () => {
    /**
     * Trois états, jamais deux : « pas mesuré » n'est pas « expiré ». Une date
     * inventée ferait rafraîchir un jeton valable, ou déclarer périmé un jeton
     * qui marche.
     */
    const j = rangerJetons({ access_token: 'a' }, t0)
    assert.equal(j.expireLe, null)
  })

  test('l’échéance du jeton de rafraîchissement est gardée quand elle existe', () => {
    // TikTok : un an. Le savoir permet de prévenir AVANT la rupture.
    const j = rangerJetons(
      { access_token: 'a', expires_in: 86_400, refresh_expires_in: 31_536_000 },
      t0,
    )
    assert.equal(j.refreshExpireLe, '2027-08-13T10:00:00.000Z')
  })

  test('l’identifiant de compte arrive avec le jeton quand le réseau le donne', () => {
    const j = rangerJetons({ access_token: 'a', open_id: 'tt-42' }, t0)
    assert.equal(j.externeId, 'tt-42')
  })
})

describe('⚠ quand rafraîchir', () => {
  const t0 = '2026-08-13T10:00:00.000Z'

  test('on rafraîchit AVANT l’échéance, pas à la seconde près', () => {
    /**
     * Sans marge, un appel parti juste avant l'échéance arrive juste après — et
     * échoue pour une raison qu'aucun journal n'expliquera.
     */
    assert.equal(doitRafraichir('2026-08-13T10:02:00.000Z', t0), true)
    assert.equal(doitRafraichir('2026-08-13T11:00:00.000Z', t0), false)
  })

  test('un jeton déjà expiré est à rafraîchir', () => {
    assert.equal(doitRafraichir('2026-08-13T09:00:00.000Z', t0), true)
  })

  test('⚠ sans échéance connue, on NE rafraîchit PAS', () => {
    /**
     * Le faire à chaque appel brûlerait le quota du fournisseur et finirait par
     * faire révoquer l'application — pour tous les créateurs à la fois.
     */
    assert.equal(doitRafraichir(null, t0), false)
    assert.equal(doitRafraichir('n’importe quoi', t0), false)
  })
})

describe('⚠ un refus du créateur n’est pas une panne', () => {
  test('fermer la fenêtre ne produit pas d’erreur rouge', () => {
    /**
     * Rien n'est cassé, il n'y a rien à réparer. Afficher une erreur enverrait
     * le créateur recommencer un geste qu'il vient volontairement d'annuler.
     */
    const r = lireEchec({ error: 'access_denied' })
    assert.equal(r.refus, true)
    assert.match(r.phrase, /pas confirmé/)
  })

  test('une configuration fausse, elle, est bien une panne', () => {
    const r = lireEchec({ error: 'redirect_uri_mismatch' })
    assert.equal(r.refus, false)
    assert.equal(r.code, 'redirect_uri_mismatch')
  })

  test('⚠ la phrase rendue ne nomme aucune variable d’environnement', () => {
    for (const p of [{ error: 'access_denied' }, { error: 'invalid_client' }, {}]) {
      assert.doesNotMatch(lireEchec(p).phrase, /[A-Z]{3,}_[A-Z_]+/)
    }
  })
})

describe('⚠ les descripteurs de réseaux', () => {
  test('chacun a de quoi ouvrir ET de quoi échanger', () => {
    for (const [id, d] of Object.entries(DESCRIPTEURS)) {
      assert.ok(d.autorisation?.startsWith('https://'), id)
      assert.ok(d.jeton?.startsWith('https://'), id)
      assert.ok(d.portees?.length > 0, id)
    }
  })

  test('⚠ chacun dit ce qu’il faut obtenir avant que ça marche', () => {
    /**
     * Un descripteur sans dossier laisserait croire qu'il suffit de brancher des
     * identifiants. C'est faux pour cinq réseaux sur six, et c'est exactement le
     * malentendu qui a coûté une soirée à ce produit.
     */
    for (const [id, d] of Object.entries(DESCRIPTEURS)) {
      assert.ok(d.dossier && d.dossier.length > 20, id)
    }
  })

  test('⚠ YouTube ne demande QUE la portée que le chantier appelle', () => {
    /**
     * Le chantier 1 identifie la chaîne et lit l'état du jeton : `youtube.readonly`
     * suffit. `youtube.upload` (chantier 2) et `yt-analytics.readonly`
     * (chantier 4) reviendront avec le code qui s'en sert, dans le même commit.
     *
     * Ce n'est pas de la prudence de principe : une portée sensible demandée
     * sans usage est une case de plus à défendre à la vérification Google, pour
     * une fonction que le produit n'a pas encore. Ce test tombera le jour du
     * chantier 2 — c'est voulu.
     */
    assert.deepEqual(DESCRIPTEURS.youtube.portees, [
      'https://www.googleapis.com/auth/youtube.readonly',
    ])
  })

  test('⚠ aucun secret n’a été écrit dans le fichier', () => {
    // Un descripteur ne contient que ce que la plateforme publie déjà.
    const texte = JSON.stringify(DESCRIPTEURS)
    assert.doesNotMatch(texte, /secret["']?\s*:\s*["'][^"']{8,}/i)
  })
})
