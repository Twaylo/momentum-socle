/**
 * Les deux routes du verrou : entrer, et savoir si on est entré.
 */
import { Router } from 'express'

import { NOM_COOKIE, jetonDeVerrou, jetonValide, motDePasseJuste, optionsCookie } from './verrou.js'

export const routesVerrou = Router()

/**
 * ⚠ UNE SEULE RÉPONSE POUR TOUS LES REFUS.
 *
 * Mot de passe faux, champ absent, mauvais format : le même 401 et la même
 * phrase. Distinguer renseignerait celui qui essaie — et il n'y a rien d'utile à
 * dire au fondateur, qui connaît son mot de passe.
 */
routesVerrou.post('/api/verrou', (req, res) => {
  const fourni = typeof req.body?.motDePasse === 'string' ? req.body.motDePasse : ''

  if (!motDePasseJuste(fourni)) {
    res.status(401).json({ ouvert: false, message: 'Mot de passe incorrect.' })
    return
  }

  res.cookie(NOM_COOKIE, jetonDeVerrou(), optionsCookie())
  res.json({ ouvert: true })
})

/** L'écran demande au chargement s'il doit afficher le verrou ou les Réglages. */
routesVerrou.get('/api/verrou', (req, res) => {
  res.json({ ouvert: jetonValide(req.cookies?.[NOM_COOKIE]) })
})

routesVerrou.delete('/api/verrou', (req, res) => {
  res.clearCookie(NOM_COOKIE, { ...optionsCookie(), maxAge: undefined })
  res.json({ ouvert: false })
})
