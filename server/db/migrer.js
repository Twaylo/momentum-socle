/**
 * Les migrations : des fichiers `.sql` numérotés, joués une seule fois, dans
 * l'ordre de leur nom.
 *
 * ⚠ Une migration déjà jouée n'est JAMAIS rejouée, et jamais modifiée après
 * coup. Corriger une migration passée donnerait deux bases différentes selon
 * qu'on est parti d'un dépôt neuf ou d'une base existante — et la différence ne
 * se verrait qu'au moment où une requête échoue en production.
 *
 * Lancé par `npm run migrate`, et au démarrage du serveur.
 */
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { executer, tous } from './index.js'

const DOSSIER = fileURLToPath(new URL('./migrations/', import.meta.url))

async function assurerLeJournal() {
  await executer(`
    create table if not exists migrations (
      nom        text primary key,
      jouee_le   timestamptz not null default now()
    )
  `)
}

/** @returns {Promise<string[]>} les noms des migrations effectivement jouées. */
export async function migrer() {
  await assurerLeJournal()

  const deja = new Set((await tous('select nom from migrations')).map((l) => l.nom))
  const fichiers = (await readdir(DOSSIER)).filter((f) => f.endsWith('.sql')).sort()

  const jouees = []
  for (const nom of fichiers) {
    if (deja.has(nom)) continue

    const sql = await readFile(path.join(DOSSIER, nom), 'utf8')
    await executer(sql)
    await executer('insert into migrations (nom) values ($1)', [nom])
    jouees.push(nom)
  }
  return jouees
}

// Exécution directe : `npm run migrate`.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const jouees = await migrer()
  console.log(jouees.length ? `Migrations jouées : ${jouees.join(', ')}` : 'Base déjà à jour.')
  const { fermer } = await import('./index.js')
  await fermer()
}
