/**
 * Les trois routes de la connexion : lister, partir autoriser, revenir.
 *
 * ⚠ AUCUN APPEL DIRECT À UNE API DE PLATEFORME ICI. Tout passe par
 * `oauthConnecteur`, l'interface commune des providers. C'est ce qui rendra
 * l'ajout d'Instagram, Facebook et TikTok indolore — un descripteur de plus, pas
 * une route de plus.
 */
import { Router } from 'express'

import { oauthConnecteur } from './connecteurs/oauth.js'
import { enregistrerCompte, listerPourEcran } from './comptes-sociaux.js'
import { directConfigure } from './config.js'
import { adresseDeRetour, urlPublique } from './url-publique.js'
import { exigerVerrou } from './verrou.js'
import { RESEAUX_OAUTH } from '../noyau/oauth-reseaux.js'

export const routesConnexions = Router()

/** Où l'on renvoie le fondateur après un aller-retour, réussi ou non. */
const ECRAN = '/reglages'

/**
 * ⚠ LE VERROU EST POSÉ SUR UN CHEMIN, PAS SUR TOUT LE ROUTEUR.
 *
 * Écrit `routesConnexions.use(exigerVerrou)`, sans chemin, il s'applique à
 * CHAQUE requête qui traverse ce routeur — y compris `/`. Le serveur rendait
 * alors 401 sur la page d'accueil : impossible d'afficher l'écran qui demande
 * le mot de passe, donc impossible d'entrer. Un verrou sans porte.
 *
 * Trouvé en interrogeant le serveur pour de vrai, pas en relisant le fichier.
 */
routesConnexions.use('/api/connexions', exigerVerrou)

/**
 * L'état de chaque réseau : connecté ou non, expiration, dernière erreur.
 *
 * ⚠ RÉPOND POUR TOUS LES RÉSEAUX PRÉVUS, pas seulement pour ceux qui ont une
 * ligne en base. Un réseau jamais connecté doit apparaître « non connecté » —
 * l'absence de ligne n'est pas l'absence de réseau.
 */
routesConnexions.get('/api/connexions', async (req, res, suite) => {
  try {
    const connectes = await listerPourEcran(Date.now())
    const parReseau = new Map(connectes.map((c) => [c.reseau, c]))

    const reseaux = RESEAUX_OAUTH.map((reseau) => ({
      reseau,
      configure: directConfigure(reseau),
      adresseDeRetour: adresseDeRetour(reseau),
      compte: parReseau.get(reseau) ?? null,
    }))

    res.json({ reseaux, urlPublique: urlPublique() })
  } catch (e) {
    suite(e)
  }
})

/**
 * Départ vers la plateforme.
 *
 * ⚠ ÉCHOUE TOUT DE SUITE si les identifiants manquent ou si l'adresse publique
 * est inconnue, au lieu de construire une adresse à moitié juste. L'erreur
 * arriverait sinon chez Google, avec un message que rien ne rattache à cette
 * ligne-ci.
 */
routesConnexions.get('/api/connexions/:reseau/demarrer', async (req, res, suite) => {
  const { reseau } = req.params
  try {
    const base = urlPublique()
    if (!base) {
      res.status(503).json({
        erreur: 'adresse_inconnue',
        message:
          'L’adresse publique du serveur est inconnue : impossible de construire l’adresse de retour.',
      })
      return
    }

    const { url } = await oauthConnecteur.demarrer({ reseau, base })
    res.redirect(url)
  } catch (e) {
    suite(e)
  }
})

/**
 * Retour de la plateforme.
 *
 * ⚠ CETTE ROUTE REDIRIGE TOUJOURS VERS L'ÉCRAN, jamais vers du JSON : c'est le
 * navigateur du fondateur qui arrive ici, pas un appel de l'interface. Le motif
 * d'échec part en paramètre, et l'écran le lit.
 *
 * ⚠ UN REFUS N'EST PAS UNE PANNE. Fermer la fenêtre de Google produit
 * `access_denied` : rien n'est cassé, il n'y a rien à réparer, et afficher une
 * erreur rouge enverrait le fondateur recommencer un geste qu'il vient
 * volontairement d'annuler.
 */
routesConnexions.get('/api/connexions/retour/:reseau', async (req, res) => {
  const { code, state, error } = req.query

  if (error) {
    const refus = String(error) === 'access_denied'
    res.redirect(`${ECRAN}?${refus ? 'annule=1' : `erreur=${encodeURIComponent(String(error))}`}`)
    return
  }

  try {
    const fin = await oauthConnecteur.terminer({ code: String(code ?? ''), etat: String(state ?? '') })
    const c = fin.compte

    await enregistrerCompte({
      reseau: c.reseau,
      externeId: c.externeId,
      nom: c.nomAffiche ?? c.pseudo ?? null,
      jetons: { acces: c.jeton, refresh: c.refresh, expireLe: c.expireLe },
    })

    res.redirect(`${ECRAN}?connecte=${encodeURIComponent(c.reseau)}`)
  } catch (e) {
    /**
     * ⚠ AUCUN `catch` VIDE. Le motif remonte à l'écran, et la trace complète va
     * dans le journal du serveur — c'est là qu'on lit ce que la plateforme a
     * vraiment répondu.
     */
    console.error('[connexions] retour en échec :', e)
    const motif = e?.raison || e?.codePlateforme || e?.message || 'echec'
    res.redirect(`${ECRAN}?erreur=${encodeURIComponent(String(motif).slice(0, 200))}`)
  }
})
