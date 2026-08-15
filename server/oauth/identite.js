/**
 * « Qui vient de se connecter ? » — la question qu'on pose juste après l'échange.
 *
 * ── POURQUOI ELLE EST OBLIGATOIRE, ET PAS UN CONFORT ─────────────────────────
 *
 * Un jeton seul ne suffit pas à enregistrer un compte : il faut l'identifiant
 * CÔTÉ PLATEFORME. C'est lui qui forme l'unicité avec l'espace (migration 004),
 * donc lui qui permet à un créateur d'avoir deux chaînes YouTube sans qu'elles
 * s'écrasent l'une l'autre (EXG-CNX-006). Sans lui, `enregistrerCompte` refuse
 * — et il a raison.
 *
 * C'est aussi ce qui fait qu'après une connexion, l'écran affiche un NOM et un
 * avatar plutôt que « compte connecté ». Un créateur qui relie trois comptes
 * doit pouvoir les distinguer.
 *
 * ── ⚠ CE QUI EST DÉLIBÉRÉMENT ABSENT ─────────────────────────────────────────
 *
 * Le choix de la Page Facebook ou de la page LinkedIn n'est PAS fait ici. Ce
 * choix existe déjà dans le produit (`noyau/destinations.js`), il a son écran et
 * sa règle. Le refaire ici en donnerait deux, et deux versions d'une même
 * question finissent toujours par se contredire.
 */

const DELAI_MS = 15_000

/** Un GET authentifié qui rend un objet, ou lève avec le mot de la plateforme. */
async function lire(url, jeton, appel = fetch) {
  const reponse = await appel(url, {
    headers: { Authorization: `Bearer ${jeton}` },
    signal: AbortSignal.timeout(DELAI_MS),
  })
  const texte = await reponse.text()
  const corps = texte ? JSON.parse(texte) : {}

  if (!reponse.ok) {
    const mot =
      corps?.error?.message ?? corps?.error_description ?? corps?.message ?? `HTTP ${reponse.status}`
    const e = new Error(`Ce réseau n’a pas rendu l’identité du compte. ${mot}`)
    e.status = 502
    throw e
  }
  return corps
}

/** Un compteur rendu en chaîne devient un nombre, ou rien. */
const nombre = (v) => {
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

/**
 * Un lecteur par réseau. Chacun rend la MÊME forme, quelles que soient les
 * bizarreries de la plateforme — c'est ce qui permet au connecteur générique
 * d'ignorer complètement de quel réseau il s'agit.
 */
const LECTEURS = {
  async youtube(jeton, appel) {
    const c = await lire(
      'https://youtube.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      jeton,
      appel,
    )
    const chaine = c?.items?.[0]

    /**
     * ⚠ UNE RÉPONSE COMPRISE MAIS SANS CHAÎNE N'EST PAS UNE CHAÎNE VIDE.
     *
     * `items: []` veut dire « ce compte Google n'a aucune chaîne YouTube » —
     * ce qui arrive pour de vrai, avec un compte Google personnel. L'enregistrer
     * quand même donnerait un compte « Connecté » qui ne publiera jamais rien.
     */
    if (!chaine?.id) {
      const e = new Error(
        'Ce compte Google n’a pas de chaîne YouTube. Choisis le compte qui possède ta chaîne.',
      )
      e.status = 409
      throw e
    }

    return {
      externeId: chaine.id,
      pseudo: chaine.snippet?.customUrl ?? null,
      nomAffiche: chaine.snippet?.title ?? null,
      avatar: chaine.snippet?.thumbnails?.default?.url ?? null,
      // ⚠ null quand le créateur masque ses abonnés : zéro afficherait une
      // chaîne sans public à quelqu'un qui en a des centaines de milliers.
      abonnes: chaine.statistics?.hiddenSubscriberCount
        ? null
        : nombre(chaine.statistics?.subscriberCount),
    }
  },

  async tiktok(jeton, appel) {
    const c = await lire(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count',
      jeton,
      appel,
    )
    const u = c?.data?.user
    if (!u?.open_id) {
      const e = new Error('TikTok n’a pas rendu l’identité du compte.')
      e.status = 502
      throw e
    }
    return {
      externeId: u.open_id,
      pseudo: u.display_name ?? null,
      nomAffiche: u.display_name ?? null,
      avatar: u.avatar_url ?? null,
      abonnes: nombre(u.follower_count),
    }
  },

  async linkedin(jeton, appel) {
    /**
     * ⚠ `/v2/userinfo`, pas `/v2/me`. L'ancien point d'entrée exige la portée
     * `r_liteprofile`, retirée du programme ouvert : il répond 403 avec un
     * message qui parle de permission, pas de point d'entrée obsolète.
     */
    const c = await lire('https://api.linkedin.com/v2/userinfo', jeton, appel)
    if (!c?.sub) {
      const e = new Error('LinkedIn n’a pas rendu l’identité du compte.')
      e.status = 502
      throw e
    }
    return {
      externeId: c.sub,
      pseudo: null,
      nomAffiche: c.name ?? null,
      avatar: c.picture ?? null,
      /**
       * ⚠ LinkedIn ne donne PAS le nombre de relations d'un membre sans être
       * partenaire. `null` — pas zéro : le zéro passerait pour un compte vide.
       */
      abonnes: null,
    }
  },

  async x(jeton, appel) {
    const c = await lire(
      'https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics,username,name',
      jeton,
      appel,
    )
    const u = c?.data
    if (!u?.id) {
      const e = new Error('X n’a pas rendu l’identité du compte.')
      e.status = 502
      throw e
    }
    return {
      externeId: u.id,
      pseudo: u.username ? `@${u.username}` : null,
      nomAffiche: u.name ?? null,
      avatar: u.profile_image_url ?? null,
      abonnes: nombre(u.public_metrics?.followers_count),
    }
  },

  /**
   * Meta : l'identité est celle de la PERSONNE, pas de la Page.
   *
   * ⚠ On publie sur une Page, et la Page se choisit après — c'est déjà une
   * notion du produit (`noyau/destinations.js`, né du « No Facebook Pages found
   * for your account » qu'a reçu le fondateur). Enregistrer ici l'identifiant
   * d'une Page choisie au hasard reproduirait exactement ce défaut, en pire :
   * silencieusement.
   */
  async facebook(jeton, appel) {
    const c = await lire('https://graph.facebook.com/v21.0/me?fields=id,name,picture', jeton, appel)
    if (!c?.id) {
      const e = new Error('Meta n’a pas rendu l’identité du compte.')
      e.status = 502
      throw e
    }
    return {
      externeId: c.id,
      pseudo: null,
      nomAffiche: c.name ?? null,
      avatar: c.picture?.data?.url ?? null,
      abonnes: null,
    }
  },

  async instagram(jeton, appel) {
    return LECTEURS.facebook(jeton, appel)
  },
}

/**
 * Qui vient de se connecter, sur ce réseau, avec ce jeton.
 *
 * @returns {Promise<{externeId, pseudo, nomAffiche, avatar, abonnes}>}
 */
export async function identiteDe(reseau, jeton, deps = {}) {
  const lecteur = LECTEURS[reseau]
  if (!lecteur) {
    const e = new Error('Ce réseau ne sait pas encore dire quel compte vient de se connecter.')
    e.status = 501
    throw e
  }
  return lecteur(jeton, deps.appel)
}

/** Les réseaux dont on sait lire l'identité — utile aux tests et au diagnostic. */
export const RESEAUX_IDENTIFIABLES = Object.keys(LECTEURS)
