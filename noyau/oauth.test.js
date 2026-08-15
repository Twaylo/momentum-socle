import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  adresseDAutorisation,
  corpsDEchange,
  corpsDeRafraichissement,
  doitRafraichir,
  entetesDEchange,
  etatValide,
  lireEchec,
  rangerJetons,
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
 */

const bidon = {
  autorisation: 'https://exemple.test/auth',
  jeton: 'https://exemple.test/token',
  portees: ['lire', 'ecrire'],
}

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

  test('⚠ TikTok reçoit client_key, pas client_id', () => {
    /**
     * Envoyer `client_id` à TikTok donne une erreur qui ne nomme pas le champ
     * manquant. On a passé assez de soirées sur des messages qui ne disent rien.
     */
    const u = new URL(
      adresseDAutorisation(DESCRIPTEURS.tiktok, {
        clientId: 'clef',
        redirection: 'https://m.test/retour',
        state: 'e1',
        defi: 'd1',
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
      () =>
        adresseDAutorisation(DESCRIPTEURS.tiktok, {
          clientId: 'clef',
          redirection: 'r',
          state: 'e1',
        }),
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
    const c = corpsDEchange(DESCRIPTEURS.x, {
      code: 'c1',
      clientId: 'abc',
      clientSecret: 's',
      redirection: 'r',
      verifieur: 'v1',
    })
    assert.equal(c.get('client_secret'), null)

    const entetes = entetesDEchange(DESCRIPTEURS.x, { clientId: 'abc', clientSecret: 's' })
    assert.equal(entetes.Authorization, `Basic ${btoa('abc:s')}`)
  })

  test('le vérifieur PKCE accompagne le code', () => {
    const c = corpsDEchange(DESCRIPTEURS.tiktok, {
      code: 'c1',
      clientId: 'clef',
      clientSecret: 's',
      redirection: 'r',
      verifieur: 'v1',
    })
    assert.equal(c.get('code_verifier'), 'v1')
    assert.equal(c.get('client_key'), 'clef')
  })

  test('un réseau sans PKCE ne reçoit pas de vérifieur parasite', () => {
    const c = corpsDEchange(bidon, { code: 'c1', clientId: 'a', clientSecret: 's', verifieur: 'v1' })
    assert.equal(c.get('code_verifier'), null)
  })

  test('le rafraîchissement garde le nom de client du réseau', () => {
    const c = corpsDeRafraichissement(DESCRIPTEURS.tiktok, {
      refresh: 'r1',
      clientId: 'clef',
      clientSecret: 's',
    })
    assert.equal(c.get('grant_type'), 'refresh_token')
    assert.equal(c.get('refresh_token'), 'r1')
    assert.equal(c.get('client_key'), 'clef')
  })
})

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
    const j = rangerJetons({ access_token: 'a' }, t0)
    assert.equal(j.expireLe, null)
  })

  test('l’échéance du jeton de rafraîchissement est gardée quand elle existe', () => {
    // TikTok : un an. Le savoir permet de prévenir AVANT la rupture.
    const j = rangerJetons({ access_token: 'a', expires_in: 86_400, refresh_expires_in: 31_536_000 }, t0)
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

  test('⚠ la phrase rendue ne nomme aucune variable d’environnement (EXG-CNX-004)', () => {
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

  test('⚠ X demande offline.access, sans quoi il n’y a rien à rafraîchir', () => {
    assert.ok(DESCRIPTEURS.x.portees.includes('offline.access'))
  })

  test('⚠ Meta ne demande AUCUN droit de publication tant qu’il ne publie pas', () => {
    /**
     * Meta refuse le consentement ENTIER dès qu'une seule portée n'est pas
     * ouverte sur l'app — « Invalid Scopes », et le créateur ne voit rien
     * d'autre qu'un écran gris. Une portée de publication demandée alors que
     * rien ne l'appelle fait donc échouer la LECTURE, qui, elle, marcherait.
     *
     * ⚠ Ce test tombera le jour où un éditeur Meta direct existera. C'est
     * voulu : il faudra alors remettre la portée ET le code qui s'en sert dans
     * le même commit, pas l'une sans l'autre.
     */
    const publication = ['instagram_content_publish', 'pages_manage_posts']
    for (const id of ['instagram', 'facebook']) {
      for (const portee of publication) {
        assert.ok(!DESCRIPTEURS[id].portees.includes(portee), `${id} demande ${portee}`)
      }
    }
  })

  test('⚠ Meta demande business_management, sinon les Pages deviennent invisibles', () => {
    /**
     * ⚠ CE TEST EXISTE PARCE QUE J'AI RETIRÉ CETTE PORTÉE.
     *
     * Au motif qu'aucune ligne ne l'appelle — ce qui est vrai. Elle ne sert pas
     * à appeler un point d'entrée : elle sert à VOIR les Pages rangées dans un
     * portefeuille professionnel. Meta y déplace une Page dès qu'on lui relie un
     * compte Instagram.
     *
     * Sans elle, `me/accounts` rend une liste VIDE — sans erreur, sans refus,
     * avec `pages_show_list` pourtant accordée. Indiscernable de « ce compte n'a
     * aucune Page ». Le produit l'a affiché à quelqu'un qui en avait une.
     */
    for (const id of ['instagram', 'facebook']) {
      assert.ok(DESCRIPTEURS[id].portees.includes('business_management'), id)
    }
  })

  test('⚠ Meta demande quand même de quoi LIRE : les Pages et leurs chiffres', () => {
    // `me/accounts` sans `pages_show_list` rend une liste vide — donc « aucune
    // Page », donc un compte qui a l'air éteint alors qu'il ne l'est pas. C'est
    // de là que vient le nombre d'abonnés des DEUX réseaux Meta.
    for (const id of ['instagram', 'facebook']) {
      assert.ok(DESCRIPTEURS[id].portees.includes('pages_show_list'), id)
      assert.ok(DESCRIPTEURS[id].portees.includes('pages_read_engagement'), id)
    }
    assert.ok(DESCRIPTEURS.instagram.portees.includes('instagram_manage_insights'))
    // Sans elle, la Page n'a que son compteur d'abonnés : ni portée, ni
    // engagement. C'est la moitié de ce qu'un créateur vient chercher.
    assert.ok(DESCRIPTEURS.facebook.portees.includes('read_insights'))
  })

  test('⚠ Meta n’a pas de rafraîchissement : il a un échange longue durée', () => {
    /**
     * Le traiter comme les autres déconnecterait tous les comptes Instagram au
     * bout d'une heure.
     */
    assert.ok(DESCRIPTEURS.instagram.echangeLongueDuree)
    assert.ok(DESCRIPTEURS.facebook.echangeLongueDuree)
  })

  test('⚠ aucun secret n’a été écrit dans le fichier', () => {
    // EXG-TEC-041. Un descripteur ne contient que ce que la plateforme publie.
    const texte = JSON.stringify(DESCRIPTEURS)
    assert.doesNotMatch(texte, /secret["']?\s*:\s*["'][^"']{8,}/i)
  })
})
