import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'

/**
 * ⚠ UN JETON DE STYLE INVENTÉ NE DOIT PAS POUVOIR PASSER EN SILENCE.
 *
 * `--t-titre` n'a jamais existé dans le thème, et il était utilisé QUATRE fois
 * dans la feuille de l'accueil. Un jeton inconnu ne lève pas, ne casse pas la
 * page, ne rougit dans aucun outil : la propriété est simplement ignorée, et
 * l'élément hérite de la valeur courante.
 *
 * Conséquence vécue : les chiffres des tuiles avaient exactement la même taille
 * que leur libellé. Aucune hiérarchie typographique, sur l'écran dont le
 * fondateur disait « c'est pas assez lisible » — et la cause était invisible à
 * la relecture du CSS, parce que la ligne fautive a l'air correcte.
 *
 * Ce test lit toutes les feuilles, collecte chaque `var(--x)` et exige que `--x`
 * soit déclaré quelque part. C'est le genre de défaut qu'aucune relecture
 * humaine n'attrape et qu'une boucle de dix lignes attrape toujours.
 */

const RACINE = new URL('..', import.meta.url).pathname

function fichiers(dossier, suffixes, trouves = []) {
  for (const nom of readdirSync(dossier)) {
    const complet = path.join(dossier, nom)
    if (statSync(complet).isDirectory()) fichiers(complet, suffixes, trouves)
    else if (suffixes.some((s) => nom.endsWith(s))) trouves.push(complet)
  }
  return trouves
}

describe('⚠ les jetons de style', () => {
  const contenu = fichiers(RACINE, ['.css']).map((f) => ({ f, texte: readFileSync(f, 'utf8') }))

  /**
   * ⚠ CERTAINS JETONS NAISSENT DANS LE JSX, PAS DANS LE CSS.
   *
   * `--pousse`, `--part`, `--teinte` portent une valeur MESURÉE — la hauteur
   * d'une pousse, la largeur d'une barre — que seule la donnée connaît. Ils sont
   * posés en style inline. Les ignorer ferait échouer ce test sur du code juste ;
   * ne pas les chercher du tout le rendrait aveugle à leur disparition.
   */
  const jsx = fichiers(RACINE, ['.tsx', '.ts']).map((f) => readFileSync(f, 'utf8'))

  // Ce qui est DÉCLARÉ : « --x: » en début de déclaration, toutes feuilles
  // confondues — un jeton peut naître dans le thème comme dans une feuille
  // d'écran, la question est seulement qu'il existe.
  const declares = new Set()
  for (const { texte } of contenu) {
    for (const m of texte.matchAll(/(--[a-z0-9-]+)\s*:/gi)) declares.add(m[1])
  }
  for (const texte of jsx) {
    for (const m of texte.matchAll(/['"`](--[a-z0-9-]+)['"`]\s*:/gi)) declares.add(m[1])
  }

  test('chaque var(--x) utilisé désigne un jeton qui existe', () => {
    const manquants = []
    for (const { f, texte } of contenu) {
      for (const m of texte.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        if (!declares.has(m[1])) manquants.push(`${path.relative(RACINE, f)} → ${m[1]}`)
      }
    }
    assert.deepEqual(
      manquants,
      [],
      `Jeton(s) inconnu(s) : la propriété sera ignorée sans le moindre signal.\n${manquants.join('\n')}`,
    )
  })
})
