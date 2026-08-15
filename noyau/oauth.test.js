import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  adresseDAutorisation,
  corpsDEchange,
  corpsDeRafraichissement,
  entetesDEchange,
  etatValide,
} from './oauth.js'
import { DESCRIPTEURS } from './oauth-reseaux.js'

/**
 * ── CE QUE CE FICHIER PROTÈGE ────────────────────────────────────────────────
 *
 * Ce module est la porte d'entrée de TOUS les comptes des créateurs. Les fautes
 * qu'on peut y faire ne se voient pas à l'écran : elles se voient une heure plus
 * tard, ou trois semaines plus tard, ou dans le compte de quelqu'un d'autre.
 *
 * Chaque test ci-dessous fige une faute précise, avec sa conséquence.
 *
 * ⚠ LES DESCRIPTEURS FACTICES NE SONT PAS DE LA PARESSE. Le dépôt ne porte plus
 * qu'un seul réseau (YouTube) : les tests de MÉCANIQUE — renommage du client,
 * PKCE, secret en en-tête — ne peuvent plus s'appuyer sur TikTok ou X. Ils
 * gardent leur cobaye sous forme de descripteur factice, avec la conséquence
 * réelle en commentaire. Le jour où ces réseaux reviennent, le chemin de code
 * qu'ils empruntent est déjà couvert.
 *
 * Le rangement des jetons, le rafraîchissement et les descripteurs sont dans
 * `oauth-jetons.test.js` — deux fichiers, parce qu'aucun ne dépasse 300 lignes.
 */

const bidon = {
  autorisation: 'https://exemple.test/auth',
  jeton: 'https://exemple.test/token',
  portees: ['lire', 'ecrire'],
}

/** Un réseau qui renomme `client_id` — c'est le cas de TikTok. */
const renomme = { ...bidon, nomClient: 'client_key' }

/** Un réseau qui exige PKCE — c'est le cas de TikTok et de X. */
const avecPkce = { ...bidon, pkce: 'S256' }

/** Un réseau qui veut son secret en en-tête — c'est le cas de X. */
const secretEnEntete = { ...bidon, secretEnEntete: true }

describe('⚠ l’adresse d’autorisation', () => {
  test('un état est OBLIGATOIRE, sans valeur par défaut', () => {
    /**
     * Sans état, un lien de retour forgé rattache le compte d'un INCONNU à
     * l'espace du créateur : il publierait ensuite sur une chaîne qui n'est pas
     * la sienne, sans jamais s'en apercevoir.
     *
     * Et un état par défaut serait le même pour tout le monde, donc devinable —
     * c'est-à-dire pas une protection du tout.
     */
    assert.throws(
      () => adresseDAutorisation(bidon, { clientId: 'abc', redirection: 'https://m.test/retour' }),
      /état est obligatoire/,
    )
  })

  test('les portées partent avec le séparateur du réseau', () => {
    const avecEspaces = new URL(
      adresseDAutorisation(bidon, { clientId: 'abc', redirection: 'r', state: 'e1' }),
    )
    assert.equal(avecEspaces.searchParams.get('scope'), 'lire ecrire')

    // ⚠ TikTok sépare par des virgules. Un espace y donne « portée inconnue ».
    const avecVirgules = new URL(
      adresseDAutorisation(
        { ...bidon, separateurPortees: ',' },
        { clientId: 'abc', redirection: 'r', state: 'e1' },
      ),
    )
    assert.equal(avecVirgules.searchParams.get('scope'), 'lire,ecrire')
  })

  test('⚠ un réseau qui renomme client_id le reçoit sous SON nom', () => {
    /**
     * TikTok n'appelle pas ça `client_id` mais `client_key`. Envoyer `client_id`
     * donne une erreur qui ne nomme pas le champ manquant. On a passé assez de
     * soirées sur des messages qui ne disent rien.
     */
    const u = new URL(
      adresseDAutorisation(renomme, {
        clientId: 'clef',
        redirection: 'https://m.test/retour',
        state: 'e1',
      }),
    )
    assert.equal(u.searchParams.get('client_key'), 'clef')
    assert.equal(u.searchParams.get('client_id'), null, 'le mauvais nom est parti quand même')
  })

  test('⚠ un réseau qui exige PKCE REFUSE de partir sans défi', () => {
    /**
     * Sans le défi, l'adresse se construirait très bien et l'échec arriverait à
     * l'étape SUIVANTE — au retour du créateur, avec un message que personne ne
     * rattache à l'adresse construite ici. On échoue tout de suite.
     */
    assert.throws(
      () => adresseDAutorisation(avecPkce, { clientId: 'clef', redirection: 'r', state: 'e1' }),
      /PKCE/,
    )
  })

  test('⚠ Google demande explicitement de quoi rafraîchir', () => {
    /**
     * Sans `access_type=offline` ET `prompt=consent`, Google ne rend pas de
     * jeton de rafraîchissement. L'accès meurt au bout d'une heure — et le
     * défaut ne se voit qu'une heure plus tard.
     */
    const u = new URL(
      adresseDAutorisation(DESCRIPTEURS.youtube, {
        clientId: 'abc',
        redirection: 'https://m.test/retour',
        state: 'e1',
      }),
    )
    assert.equal(u.searchParams.get('access_type'), 'offline')
    assert.equal(u.searchParams.get('prompt'), 'consent')
  })

  test('la redirection est encodée, pas concaténée', () => {
    // Une redirection avec un paramètre casserait une adresse construite à la main.
    const u = new URL(
      adresseDAutorisation(bidon, {
        clientId: 'abc',
        redirection: 'https://m.test/retour?reseau=x&t=1',
        state: 'e1',
      }),
    )
    assert.equal(u.searchParams.get('redirect_uri'), 'https://m.test/retour?reseau=x&t=1')
  })
})

describe('⚠ la vérification de l’état', () => {
  test('un état juste passe, un état faux ne passe pas', () => {
    assert.equal(etatValide('abc123', 'abc123'), true)
    assert.equal(etatValide('abc123', 'abc124'), false)
  })

  test('⚠ un état ABSENT ne vaut jamais « valide »', () => {
    // Le piège : `'' === ''` est vrai. Deux états vides valideraient un retour
    // forgé, c'est-à-dire exactement l'attaque contre laquelle l'état existe.
    assert.equal(etatValide('', ''), false)
    assert.equal(etatValide(null, null), false)
    assert.equal(etatValide(undefined, ''), false)
  })

  test('une longueur différente ne valide pas', () => {
    assert.equal(etatValide('abc', 'abcd'), false)
    assert.equal(etatValide('abcd', 'abc'), false)
  })

  test('⚠ la comparaison ne s’arrête pas au premier caractère différent', () => {
    /**
     * On ne mesure pas un temps dans un test — ce serait instable. On vérifie la
     * PROPRIÉTÉ qui rend l'attaque possible : avec `===`, « zzz » sort plus vite
     * que « abz » face à « abc ». Ici les deux doivent parcourir toute la
     * chaîne, donc rendre le même verdict par le même chemin.
     *
     * Le vrai garde-fou est la revue : si quelqu'un remplace le corps de
     * `etatValide` par `attendu === recu`, ce test passe toujours. Mais le
     * commentaire ci-dessus dit pourquoi il ne faut pas.
     */
    assert.equal(etatValide('abc', 'zzz'), false)
    assert.equal(etatValide('abc', 'abz'), false)
  })
})

describe('⚠ l’échange du code contre un jeton', () => {
  test('le corps porte le code, la redirection et le type d’octroi', () => {
    const c = corpsDEchange(bidon, {
      code: 'c1',
      clientId: 'abc',
      clientSecret: 's',
      redirection: 'https://m.test/retour',
    })
    assert.equal(c.get('grant_type'), 'authorization_code')
    assert.equal(c.get('code'), 'c1')
    assert.equal(c.get('client_secret'), 's')
    assert.equal(c.get('redirect_uri'), 'https://m.test/retour')
  })

  test('⚠ quand le secret va en en-tête, il ne part PAS aussi dans le corps', () => {
    /**
     * X refuse la demande quand les deux sont présents, avec un 401 qui
     * n'explique rien. Un seul endroit, décidé par le descripteur.
     */
    const c = corpsDEchange(secretEnEntete, {
      code: 'c1',
      clientId: 'abc',
      clientSecret: 's',
      redirection: 'r',
    })
    assert.equal(c.get('client_secret'), null)

    const entetes = entetesDEchange(secretEnEntete, { clientId: 'abc', clientSecret: 's' })
    assert.equal(entetes.Authorization, `Basic ${btoa('abc:s')}`)
  })

  test('le vérifieur PKCE accompagne le code', () => {
    const c = corpsDEchange(
      { ...avecPkce, nomClient: 'client_key' },
      { code: 'c1', clientId: 'clef', clientSecret: 's', redirection: 'r', verifieur: 'v1' },
    )
    assert.equal(c.get('code_verifier'), 'v1')
    assert.equal(c.get('client_key'), 'clef')
  })

  test('un réseau sans PKCE ne reçoit pas de vérifieur parasite', () => {
    const c = corpsDEchange(bidon, { code: 'c1', clientId: 'a', clientSecret: 's', verifieur: 'v1' })
    assert.equal(c.get('code_verifier'), null)
  })

  test('le rafraîchissement garde le nom de client du réseau', () => {
    const c = corpsDeRafraichissement(renomme, {
      refresh: 'r1',
      clientId: 'clef',
      clientSecret: 's',
    })
    assert.equal(c.get('grant_type'), 'refresh_token')
    assert.equal(c.get('refresh_token'), 'r1')
    assert.equal(c.get('client_key'), 'clef')
  })
})
