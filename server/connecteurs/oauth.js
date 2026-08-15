import { descripteurDe } from '../../noyau/oauth-reseaux.js'
import { doitRafraichir } from '../../noyau/oauth.js'
import { ouvrir, rafraichir, revoquer, terminer } from '../oauth/flux.js'
import { identiteDe } from '../oauth/identite.js'

/**
 * Le connecteur OAuth — UN seul, pour les six réseaux.
 *
 * ── POURQUOI IL N'Y EN A QU'UN ───────────────────────────────────────────────
 *
 * Six réseaux, six dossiers de validation, six calendriers différents. Mais un
 * seul flux : on envoie le créateur chez eux, ils nous rappellent, on échange le
 * code, on demande qui vient de se connecter.
 *
 * Ce qui diffère d'un réseau à l'autre est en DONNÉES
 * (`noyau/oauth-reseaux.js`) : des adresses, des portées, le nom du paramètre
 * d'identifiant client. Écrire six connecteurs, c'est six occasions de se
 * tromper sur la partie sensible — et la garantie de redécouvrir le même défaut
 * six fois.
 *
 * ── CE QUE ÇA CHANGE POUR LE PRODUIT ─────────────────────────────────────────
 *
 * L'écran Connexions ne bouge pas d'une ligne : il demande sa `forme` au
 * connecteur, il obtient `redirection`, il ouvre l'adresse. Un réseau bascule de
 * l'agrégateur au direct par une variable d'environnement et un redémarrage
 * (EXG-TEC-010/011). Aucune couche au-dessus ne sait lequel sert.
 */

export const oauthConnecteur = {
  forme: 'redirection',
  champs: [],

  /**
   * Ouvre l'autorisation : rend l'adresse où envoyer le créateur.
   *
   * ⚠ C'est ici qu'est retenu de quoi vérifier le retour (état, vérifieur PKCE,
   * redirection exacte). Sans cette mémoire, le retour n'est pas vérifiable —
   * et un retour non vérifié rattache le compte d'un inconnu à l'espace du
   * créateur.
   */
  async demarrer({ espaceId, reseau, base, retour } = {}, deps = {}) {
    return ouvrir({ espaceId, reseau, base, retour }, new Date().toISOString(), deps)
  },

  /**
   * Termine l'autorisation : échange le code, puis demande QUI s'est connecté.
   *
   * ⚠ Les deux étapes sont ici, ensemble, volontairement. Enregistrer un compte
   * sans son identifiant de plateforme donnerait une ligne « Connectée » qui ne
   * publiera jamais rien — et l'écran mentirait dès la première seconde
   * (EXG-CNX-002).
   */
  async terminer({ espaceId, code, etat } = {}, deps = {}) {
    const maintenant = new Date().toISOString()
    const fin = await terminer({ espaceId, code, etat }, maintenant, deps)

    const identite = await identiteDe(fin.reseau, fin.jetons.acces, deps)

    return {
      compte: {
        reseau: fin.reseau,
        ...identite,
        /**
         * ⚠ CE COMPTE EST DIRECT, MÊME SI SES PUBLICATIONS PARTENT AILLEURS.
         *
         * C'est nous qui détenons son jeton. Sans cette marque, la ligne serait
         * rangée d'après `PUBLISHER_<RESEAU>` — donc « aggregator » tant qu'il
         * n'y a pas de publieur direct — et deux mécanismes la casseraient :
         * `jetonPour` refuserait de s'en servir, et la réconciliation d'import
         * l'effacerait faute de la retrouver chez la passerelle.
         */
        backend: 'direct',
        jeton: fin.jetons.acces,
        /**
         * ⚠ Meta ne délivre pas de jeton de rafraîchissement : c'est le jeton
         * d'ACCÈS qui se ré-échange contre lui-même. On le range donc en repli,
         * sinon le renouvellement n'aurait rien sur quoi repartir et tous les
         * comptes Instagram tomberaient au bout d'une heure.
         */
        refresh:
          fin.jetons.refresh ??
          (descripteurDe(fin.reseau)?.echangeLongueDuree ? fin.jetons.acces : null),
        expireLe: fin.jetons.expireLe,
      },
      espaceId: fin.espaceId,
      retour: fin.retour,
    }
  },

  /**
   * EXG-CNX-002 — vérification RÉELLE : on redemande l'identité à la plateforme.
   *
   * Un bouton « Vérifier » qui se contenterait d'horodater serait un mensonge de
   * plus, et c'est précisément celui que l'annexe B reproche à l'itération
   * précédente.
   */
  async verifier(compte, deps = {}) {
    const frais = await jetonFrais(compte, new Date().toISOString(), deps)
    if (!frais) {
      const e = new Error('L’autorisation de ce compte a expiré. Reconnecte-le en un geste.')
      e.status = 401
      throw e
    }
    const { pseudo, nomAffiche, avatar, abonnes } = await identiteDe(compte.reseau, frais.acces, deps)
    return { pseudo, nomAffiche, avatar, abonnes, jetons: frais.renouvele ? frais : null }
  },

  /**
   * EXG-CNX-005 — retirer l'accès CHEZ la plateforme, pas seulement chez nous.
   *
   * ⚠ Ne lève pas quand le réseau ne sait pas révoquer par API : la ligne part
   * quand même et l'écran dit la vérité — l'autorisation reste à retirer côté
   * plateforme. Une déconnexion qui ne déconnecte pas doit s'avouer.
   */
  async revoquer(compte, deps = {}) {
    return revoquer({ reseau: compte?.reseau, jeton: compte?.jeton }, deps)
  },
}

/**
 * Un jeton utilisable MAINTENANT — renouvelé si l'échéance approche.
 *
 * ── ⚠ POURQUOI CETTE FONCTION EST LE CŒUR DE L'INTERNALISATION ───────────────
 *
 * Un jeton d'accès dure une heure chez Google, deux chez X. Sans renouvellement
 * automatique, chaque publication planifiée la nuit échouerait, et le créateur
 * découvrirait au matin que rien n'est parti — avec un message d'autorisation
 * qu'il ne peut relier à rien.
 *
 * ⚠ On renouvelle AVANT l'échéance (marge de cinq minutes) : un appel parti
 * juste avant arriverait juste après.
 *
 * ⚠ Sans date d'expiration connue, on NE renouvelle PAS. Le faire à chaque appel
 * brûlerait le quota du fournisseur et finirait par faire révoquer
 * l'application — pour tous les créateurs à la fois.
 *
 * @returns {Promise<{acces, refresh, expireLe, renouvele: boolean}|null>}
 */
export async function jetonFrais(compte, maintenantIso, deps = {}) {
  if (!compte?.jeton && !compte?.refresh) return null

  if (compte.jeton && !doitRafraichir(compte.expireLe, maintenantIso)) {
    return { acces: compte.jeton, refresh: compte.refresh, expireLe: compte.expireLe, renouvele: false }
  }

  /**
   * ⚠ Meta se rallonge à partir du jeton d'ACCÈS, les autres à partir du jeton
   * de rafraîchissement. Le flux le sait ; ici on lui donne simplement ce qu'il
   * a de disponible.
   */
  const base = descripteurDe(compte.reseau)?.echangeLongueDuree
    ? (compte.refresh ?? compte.jeton)
    : compte.refresh

  /**
   * ⚠ UN RENOUVELLEMENT QUI ÉCHOUE EST UN ÉTAT, PAS UNE EXCEPTION.
   *
   * `rafraichir` LÈVE quand la plateforme refuse — c'est ce qu'on veut sur le
   * chemin de la connexion, où le mot à mot doit remonter jusqu'à l'écran. Mais
   * ici on est sur le chemin d'un ENVOI : laisser passer l'exception ferait
   * échouer une publication alors qu'on tient peut-être encore un jeton
   * valable. Un test l'a attrapé ; sans lui, ça se serait vu une nuit, sur une
   * publication planifiée.
   */
  let renouvele = null
  try {
    renouvele = await rafraichir({ reseau: compte.reseau, refresh: base }, maintenantIso, deps)
  } catch (e) {
    console.warn(`[oauth] ${compte.reseau} — renouvellement refusé ${e.codePlateforme ?? ''}`)
  }

  /**
   * Le renouvellement a échoué : on rend le jeton COURANT s'il en reste un,
   * plutôt que rien. Il est peut-être encore valable quelques minutes, et un
   * envoi qui passe vaut mieux qu'un envoi qu'on refuse par prudence.
   */
  if (!renouvele) {
    return compte.jeton
      ? { acces: compte.jeton, refresh: compte.refresh, expireLe: compte.expireLe, renouvele: false }
      : null
  }

  return {
    acces: renouvele.acces,
    refresh: renouvele.refresh ?? compte.refresh,
    expireLe: renouvele.expireLe,
    renouvele: true,
  }
}
