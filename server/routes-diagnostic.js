/**
 * La route de la sonde.
 *
 * ⚠ DERRIÈRE LE VERROU. Le rapport contient l'état réel des autorisations du
 * fondateur : il n'a rien à faire sur une adresse publique.
 */
import { Router } from 'express'

import { compteAvecJetons } from './comptes-sociaux.js'
import { sonderYoutube } from './sonde-youtube.js'
import { exigerVerrou } from './verrou.js'

export const routesDiagnostic = Router()

// ⚠ Sur le chemin, pas sur le routeur entier : sans chemin, il bloquerait aussi
// la page d'accueil, et l'écran du mot de passe deviendrait inatteignable.
routesDiagnostic.use('/api/diagnostic', exigerVerrou)

routesDiagnostic.get('/api/diagnostic/youtube', async (req, res, suite) => {
  try {
    const compte = await compteAvecJetons('youtube')
    if (!compte) {
      /**
       * ⚠ 200 ET UNE PHRASE, PAS UNE ERREUR. Il n'y a rien de cassé : le compte
       * n'est simplement pas connecté. Rendre 404 ferait afficher « panne » là
       * où l'état est parfaitement normal.
       */
      res.json({ mesurable: false, message: 'YouTube n’est pas connecté : il n’y a rien à sonder.' })
      return
    }

    const rapport = await sonderYoutube(compte, new Date().toISOString())
    res.json({ mesurable: true, ...rapport })
  } catch (e) {
    suite(e)
  }
})
