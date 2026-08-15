/**
 * Accès PostgreSQL, en un seul endroit.
 *
 * ── POURQUOI UN SEUL MOTEUR ──────────────────────────────────────────────────
 *
 * L'ancien dépôt gérait deux bases derrière une couche commune : SQLite en local
 * et en test, PostgreSQL en production. On ne reprend pas ce double dialecte.
 *
 * D'abord parce que le disque d'un hébergeur de ce type est effacé à chaque
 * redéploiement : une base posée en local y perdrait les jetons, et il faudrait
 * reconnecter YouTube à chaque mise en ligne. Ensuite parce que deux moteurs,
 * c'est un écart de comportement possible entre la machine du fondateur et la
 * production — l'ancien dépôt l'assumait et le rattrapait en jouant les
 * migrations sur les deux. Ici, il n'y a rien à rattraper.
 *
 * Conséquence pratique : les paramètres s'écrivent `$1`, `$2` — la syntaxe
 * PostgreSQL — et non `?`.
 */
import pg from 'pg'

let bassin = null

/**
 * Le bassin de connexions, ouvert à la première requête.
 *
 * ⚠ On ne force PAS de réglage TLS ici. Le mode de chiffrement se déclare dans
 * `DATABASE_URL` (`?sslmode=require` chez les hébergeurs qui l'exigent) : le
 * coder en dur obligerait à modifier le code pour changer d'hébergeur, et la
 * valeur la plus permissive finirait par y rester.
 */
export function bassinDeConnexions() {
  if (bassin) return bassin

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL est absente. La base n’est pas joignable, et aucun jeton ne peut être rangé.',
    )
  }

  bassin = new pg.Pool({ connectionString: url, max: 5 })
  return bassin
}

/** Exécute une requête sans rien attendre en retour. */
export async function executer(sql, params = []) {
  const r = await bassinDeConnexions().query(sql, params)
  return { lignesTouchees: r.rowCount }
}

/** La première ligne, ou `null` s'il n'y en a aucune. */
export async function un(sql, params = []) {
  const r = await bassinDeConnexions().query(sql, params)
  return r.rows[0] ?? null
}

/** Toutes les lignes, éventuellement aucune. */
export async function tous(sql, params = []) {
  const r = await bassinDeConnexions().query(sql, params)
  return r.rows
}

/**
 * La base répond-elle ?
 *
 * ⚠ Rend l'erreur au lieu de la mordre. Un `catch` vide ici afficherait
 * « connecté » sur un serveur qui n'a plus de base — c'est-à-dire un mensonge à
 * l'endroit exact où le produit doit dire la vérité.
 */
export async function verifierLaBase() {
  try {
    await un('select 1 as ok')
    return { ok: true, erreur: null }
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) }
  }
}

export async function fermer() {
  if (!bassin) return
  await bassin.end()
  bassin = null
}
