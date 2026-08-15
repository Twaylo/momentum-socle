/**
 * Le montage de l'application HTTP, séparé du démarrage.
 *
 * ⚠ POURQUOI DEUX FICHIERS. `index.js` vérifie l'environnement, joue les
 * migrations et écoute — trois choses qui exigent une vraie base. En gardant le
 * montage ici, les routes se testent sans base, sans port, sans migration.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cookieParser from 'cookie-parser'
import express from 'express'

import { routesConnexions } from './routes-connexions.js'
import { routesDiagnostic } from './routes-diagnostic.js'
import { routesVerrou } from './routes-verrou.js'

const RACINE = fileURLToPath(new URL('..', import.meta.url))

export function construireApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.get('/api/sante', (req, res) => res.json({ ok: true }))

  app.use(routesVerrou)
  app.use(routesConnexions)
  app.use(routesDiagnostic)

  /**
   * Le serveur sert aussi l'interface construite par Vite — dès qu'elle existe.
   *
   * ⚠ LA CONDITION EST « LE DOSSIER EST LÀ », PAS « NODE_ENV VAUT PRODUCTION ».
   *
   * La version précédente de cette ligne testait `NODE_ENV`. Un hébergeur qui ne
   * pose pas cette variable aurait alors servi une page blanche : le serveur
   * répond, les routes marchent, et l'écran ne s'affiche pas — sans la moindre
   * erreur pour dire pourquoi. C'est la même faute que la clé de chiffrement
   * générée en douce, sous un autre nom : faire dépendre un comportement d'une
   * variable qu'on peut oublier.
   *
   * En développement, `dist` n'existe pas et Vite sert l'interface sur son
   * propre port : la condition tombe d'elle-même, sans variable.
   */
  const dist = path.join(RACINE, 'dist')
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist))
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  /**
   * ⚠ LE DERNIER FILET, ET IL NE MENT PAS.
   *
   * Une erreur non rattrapée rend 500 avec un message générique côté client —
   * mais la trace complète part dans le journal du serveur. L'inverse (une
   * erreur avalée, un 200 vide) donnerait un écran qui affiche « rien » là où il
   * s'est passé quelque chose.
   */
  app.use((err, req, res, _suite) => {
    console.error('[erreur]', req.method, req.originalUrl, err)
    const statut = Number.isInteger(err?.status) ? err.status : 500
    res.status(statut).json({
      erreur: err?.raison || 'panne',
      message: err?.message || 'Le serveur n’a pas pu répondre.',
    })
  })

  return app
}
