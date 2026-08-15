/**
 * L'état affichable d'un compte connecté, et ce que l'écran a le droit d'en voir.
 *
 * Module PUR : il reçoit la ligne et l'instant, il ne lit jamais l'horloge. C'est
 * ce qui rend l'expiration testable sans attendre trois semaines.
 *
 * Repris de `server/comptes-sociaux.js` de l'ancien dépôt (lignes 62-182), avec
 * son correctif — celui du faux « À renouveler », plus bas.
 */

/** Trois jours de préavis avant une échéance qui ne se règle pas toute seule. */
const PREAVIS_MS = 3 * 24 * 3600_000

/**
 * PostgreSQL rend un `timestamptz` sous forme d'objet `Date`, pas de chaîne.
 * Passer l'un ou l'autre à `Date.parse` marcherait par accident dans un sens et
 * donnerait `NaN` dans l'autre — donc « pas d'échéance » sur un compte qui en a
 * une. On accepte les deux, explicitement.
 *
 * @returns {number|null} l'instant en millisecondes, ou `null` si non mesuré.
 */
export function instantDe(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null
  const ms = valeur instanceof Date ? valeur.getTime() : Date.parse(valeur)
  return Number.isFinite(ms) ? ms : null
}

/**
 * @returns {{cle: string, mot: string, phrase: string|null, action: string|null,
 *            gravite: 'ok'|'attention'|'rupture'}}
 */
export function etatDe(ligne, maintenantMs) {
  if (ligne.etat === 'a_reconnecter') {
    return {
      cle: 'erreur',
      mot: 'En erreur',
      // On dit ce qui s'est passé. Le message vient de la plateforme, gardé tel
      // quel à l'enregistrement — aucun `catch` vide n'a pu l'effacer en route.
      phrase: ligne.derniere_erreur ?? 'Ce compte ne répond plus.',
      action: 'Reconnecter',
      gravite: 'rupture',
    }
  }

  const expireMs = instantDe(ligne.expire_le)

  /**
   * ⚠ UN JETON QUI SE RENOUVELLE TOUT SEUL N'EST PAS « À RENOUVELER ».
   *
   * Google délivre des jetons d'accès qui durent UNE HEURE. Avec le préavis de
   * trois jours ci-dessous, une chaîne fraîchement autorisée s'affichait donc
   * « À renouveler — l'autorisation expire dans 1 jour » à la seconde même où
   * le créateur venait de l'accorder. Pire : une heure plus tard elle passait
   * en RUPTURE, disparaissait des réseaux publiables et cessait d'être comptée
   * dans l'audience — pour un compte parfaitement valide.
   *
   * Tant qu'on détient un jeton de rafraîchissement, l'échéance de l'accès ne
   * regarde pas le créateur : elle se règle toute seule avant chaque appel.
   * Seul un renouvellement qui ÉCHOUE mérite d'être annoncé — et celui-là écrit
   * `etat = 'a_reconnecter'`, traité juste au-dessus.
   */
  const seRenouvelleSeul = Boolean(ligne.jeton_rafraichissement_chiffre)

  if (!seRenouvelleSeul && expireMs !== null && expireMs <= maintenantMs) {
    return {
      cle: 'expire',
      mot: 'Accès expiré',
      phrase: 'Ce réseau demande de renouveler l’autorisation.',
      action: 'Reconnecter',
      gravite: 'rupture',
    }
  }

  if (!seRenouvelleSeul && expireMs !== null && expireMs - maintenantMs < PREAVIS_MS) {
    const jours = Math.max(1, Math.round((expireMs - maintenantMs) / (24 * 3600_000)))
    return {
      cle: 'bientot',
      mot: 'À renouveler',
      phrase: `L’autorisation expire dans ${jours} jour${jours > 1 ? 's' : ''}.`,
      action: 'Renouveler',
      gravite: 'attention',
    }
  }

  return { cle: 'actif', mot: 'Connecté', phrase: null, action: null, gravite: 'ok' }
}

/**
 * Ce que l'écran a le droit de voir.
 *
 * ⚠ AUCUN JETON NE TRAVERSE CETTE FONCTION. Ni l'accès, ni le rafraîchissement,
 * ni leur forme chiffrée. C'est la seule porte entre la base et le réseau, et
 * elle recopie champ par champ au lieu d'étaler la ligne : un `...ligne` ferait
 * sortir en clair toute colonne ajoutée plus tard, sans que personne le voie.
 */
export function versVue(ligne, maintenantMs) {
  const expireMs = instantDe(ligne.expire_le)

  return {
    id: ligne.id,
    reseau: ligne.reseau,
    nom: ligne.nom ?? null,

    /**
     * ⚠ TROIS ÉTATS, JAMAIS DEUX.
     *
     * `expireLe` à `null` ne veut pas dire « expiré » ni « expire maintenant » :
     * il veut dire que la plateforme n'a pas donné d'échéance. L'écran doit
     * écrire « expiration inconnue », jamais une date inventée ni un zéro.
     * `expirationConnue` existe pour que l'affichage n'ait pas à deviner.
     */
    expireLe: expireMs === null ? null : new Date(expireMs).toISOString(),
    expirationConnue: expireMs !== null,

    portees: ligne.portees ?? null,

    derniereErreur: ligne.derniere_erreur ?? null,
    derniereErreurLe: instantDe(ligne.derniere_erreur_le)
      ? new Date(instantDe(ligne.derniere_erreur_le)).toISOString()
      : null,

    connecteLe: instantDe(ligne.cree_le) ? new Date(instantDe(ligne.cree_le)).toISOString() : null,

    etat: etatDe(ligne, maintenantMs),
  }
}
