import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

process.env.CLE_CHIFFREMENT ??= 'a'.repeat(64)
process.env.MOT_DE_PASSE ??= 'ouvre-toi'

const { construireApp } = await import('./app.js')

let serveur
let base

before(async () => {
  serveur = construireApp().listen(0)
  await new Promise((ok) => serveur.once('listening', ok))
  base = `http://127.0.0.1:${serveur.address().port}`
})

after(() => serveur?.close())

describe('⚠ le verrou ferme ce qu’il faut, et rien de plus', () => {
  test('⚠ la page d’accueil N’EST PAS bloquée par le verrou', async () => {
    /**
     * ⚠ CE TEST EXISTE À CAUSE D'UN BUG TROUVÉ EN INTERROGEANT LE SERVEUR.
     *
     * Le verrou était posé par `routeur.use(exigerVerrou)`, sans chemin. Un
     * routeur Express applique alors le garde à CHAQUE requête qui le traverse,
     * pas seulement à ses propres routes. Symptôme observé : `GET /` rendait
     * 401 au lieu de l'interface. L'écran qui demande le mot de passe devenait
     * inatteignable — un verrou sans porte, et aucun moyen d'entrer.
     *
     * Le test n'exige pas un 200 : en développement `dist/` n'existe pas et 404
     * est correct. Ce qu'il interdit, c'est le 401.
     */
    const r = await fetch(`${base}/`)
    assert.notEqual(r.status, 401, 'la page d’accueil est derrière le verrou')
  })

  test('la route de santé répond sans mot de passe', async () => {
    const r = await fetch(`${base}/api/sante`)
    assert.equal(r.status, 200)
  })

  test('l’état du verrou est consultable sans mot de passe', async () => {
    // Sinon l'interface ne pourrait pas savoir quel écran afficher au chargement.
    const r = await fetch(`${base}/api/verrou`)
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ouvert: false })
  })

  test('⚠ les connexions et le diagnostic, eux, sont bien fermés', async () => {
    for (const chemin of [
      '/api/connexions',
      '/api/connexions/youtube/demarrer',
      '/api/diagnostic/youtube',
    ]) {
      const r = await fetch(`${base}${chemin}`, { redirect: 'manual' })
      assert.equal(r.status, 401, chemin)
    }
  })

  test('un mauvais mot de passe n’ouvre pas', async () => {
    const r = await fetch(`${base}/api/verrou`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motDePasse: 'faux' }),
    })
    assert.equal(r.status, 401)
    assert.equal((await r.json()).ouvert, false)
  })

  test('le bon mot de passe ouvre et pose un cookie', async () => {
    const r = await fetch(`${base}/api/verrou`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motDePasse: 'ouvre-toi' }),
    })
    assert.equal(r.status, 200)
    assert.equal((await r.json()).ouvert, true)

    const cookie = r.headers.get('set-cookie')
    assert.match(cookie, /mm_verrou=/)
    assert.match(cookie, /HttpOnly/i)
  })

  test('⚠ le cookie du verrou ne traverse pas le JavaScript de la page', async () => {
    // HttpOnly : un script injecté dans la page ne peut pas le lire, donc ne
    // peut pas le rejouer ailleurs.
    const r = await fetch(`${base}/api/verrou`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motDePasse: 'ouvre-toi' }),
    })
    assert.match(r.headers.get('set-cookie'), /HttpOnly/i)
  })
})
