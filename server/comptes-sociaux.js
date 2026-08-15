/**
 * Le rangement des comptes connectés : écrire, relire, marquer en échec.
 *
 * ⚠ LES JETONS NE SORTENT D'ICI QUE PAR DEUX PORTES, et elles sont différentes.
 * `listerPourEcran` passe par `versVue`, qui n'en laisse passer aucun.
 * `compteAvecJetons` les déchiffre, et n'est appelée que par le serveur.
 * Aucune fonction ne fait les deux.
 */
import { chiffrer, dechiffrer } from './chiffrement.js'
import { executer, tous, un } from './db/index.js'
import { versVue } from '../noyau/etat-jeton.js'

/**
 * Enregistre un compte fraîchement autorisé, ou met à jour celui qui existe.
 *
 * ⚠ C'EST UN UPSERT, ET C'EST VOULU. L'unicité porte sur (reseau, externe_id) :
 * reconnecter la même chaîne met à jour la ligne au lieu d'en créer une
 * deuxième. Sans ça, un fondateur qui reconnecte après une erreur se retrouve
 * avec deux lignes pour une chaîne, et rien ne dit laquelle porte le jeton
 * valable.
 *
 * ⚠ UN REFRESH ABSENT N'ÉCRASE PAS CELUI QU'ON A. Google ne rend le jeton de
 * rafraîchissement qu'à la première autorisation. `coalesce` garde l'ancien
 * quand la nouvelle valeur est nulle — sinon la reconnexion déconnecterait
 * silencieusement au renouvellement suivant.
 */
export async function enregistrerCompte({ reseau, externeId, nom, jetons }) {
  if (!jetons?.acces) {
    throw new Error('Aucun jeton d’accès : il n’y a rien à enregistrer.')
  }

  const ligne = await un(
    `insert into comptes_sociaux
       (reseau, externe_id, nom, jeton_acces_chiffre, jeton_rafraichissement_chiffre,
        expire_le, refresh_expire_le, portees, etat, derniere_erreur, derniere_erreur_le, maj_le)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'actif', null, null, now())
     on conflict (reseau, externe_id) do update set
       nom                            = excluded.nom,
       jeton_acces_chiffre            = excluded.jeton_acces_chiffre,
       jeton_rafraichissement_chiffre = coalesce(excluded.jeton_rafraichissement_chiffre,
                                                 comptes_sociaux.jeton_rafraichissement_chiffre),
       expire_le                      = excluded.expire_le,
       refresh_expire_le              = excluded.refresh_expire_le,
       portees                        = coalesce(excluded.portees, comptes_sociaux.portees),
       etat                           = 'actif',
       derniere_erreur                = null,
       derniere_erreur_le             = null,
       maj_le                         = now()
     returning *`,
    [
      reseau,
      externeId,
      nom ?? null,
      chiffrer(jetons.acces),
      jetons.refresh ? chiffrer(jetons.refresh) : null,
      jetons.expireLe ?? null,
      jetons.refreshExpireLe ?? null,
      jetons.portees ?? null,
    ],
  )
  return ligne
}

/** Les comptes tels que l'écran a le droit de les voir. Aucun jeton. */
export async function listerPourEcran(maintenantMs) {
  const lignes = await tous('select * from comptes_sociaux order by reseau, id')
  return lignes.map((l) => versVue(l, maintenantMs))
}

/**
 * Le compte d'un réseau, jetons DÉCHIFFRÉS.
 *
 * ⚠ Ce que rend cette fonction ne doit jamais traverser une réponse HTTP.
 * @returns {Promise<{ligne: object, acces: string, refresh: string|null}|null>}
 */
export async function compteAvecJetons(reseau) {
  const ligne = await un('select * from comptes_sociaux where reseau = $1 order by id limit 1', [
    reseau,
  ])
  if (!ligne) return null

  const acces = dechiffrer(ligne.jeton_acces_chiffre)

  /**
   * ⚠ « ILLISIBLE » N'EST PAS « ABSENT ».
   *
   * `dechiffrer` rend `null` quand le chiffré a été modifié — ou quand la clé a
   * changé. Laisser passer ce `null` donnerait un compte qui a l'air de n'avoir
   * aucun jeton, alors qu'il en a un que l'on ne sait plus lire. Le fondateur
   * verrait « non connecté » et reconnecterait, sans jamais apprendre que la
   * vraie cause est une `CLE_CHIFFREMENT` qui a bougé entre deux déploiements.
   *
   * Trois états, jamais deux : pas de compte / compte lisible / compte illisible.
   */
  if (ligne.jeton_acces_chiffre && acces === null) {
    const e = new Error(
      'Le jeton enregistré est illisible : CLE_CHIFFREMENT a changé depuis son enregistrement. ' +
        'Remettre la clé d’origine, ou reconnecter le réseau.',
    )
    e.status = 500
    e.raison = 'cle_changee'
    throw e
  }

  return {
    ligne,
    acces,
    refresh: ligne.jeton_rafraichissement_chiffre
      ? dechiffrer(ligne.jeton_rafraichissement_chiffre)
      : null,
  }
}

/** Range les jetons renouvelés. Le refresh absent ne remplace pas l'ancien. */
export async function majJetons(id, jetons) {
  await executer(
    `update comptes_sociaux set
       jeton_acces_chiffre            = $2,
       jeton_rafraichissement_chiffre = coalesce($3, jeton_rafraichissement_chiffre),
       expire_le                      = $4,
       etat                           = 'actif',
       derniere_erreur                = null,
       derniere_erreur_le             = null,
       maj_le                         = now()
     where id = $1`,
    [id, chiffrer(jetons.acces), jetons.refresh ? chiffrer(jetons.refresh) : null, jetons.expireLe ?? null],
  )
}

/**
 * Marque un compte comme ne répondant plus, avec le message de la plateforme.
 *
 * ⚠ LE MESSAGE EST GARDÉ MOT POUR MOT. C'est lui qui permet de comprendre ; une
 * phrase générique à la place, et il faut rouvrir la console de la plateforme
 * pour savoir ce qui s'est passé.
 */
export async function marquerEnEchec(id, message) {
  await executer(
    `update comptes_sociaux
        set etat = 'a_reconnecter', derniere_erreur = $2, derniere_erreur_le = now(), maj_le = now()
      where id = $1`,
    [id, String(message ?? '').slice(0, 2000)],
  )
}

/** Note une erreur SANS déconnecter : la lecture a échoué, l'accès tient peut-être. */
export async function noterErreur(id, message) {
  await executer(
    `update comptes_sociaux
        set derniere_erreur = $2, derniere_erreur_le = now(), maj_le = now()
      where id = $1`,
    [id, String(message ?? '').slice(0, 2000)],
  )
}
