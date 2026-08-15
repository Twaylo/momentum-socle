import { useEffect, useState } from 'react'

import { Entree } from './ecrans/Entree'
import { Reglages } from './ecrans/Reglages'

type Etat = 'chargement' | 'ferme' | 'ouvert'

/**
 * Deux écrans, pas de routeur.
 *
 * Le verrou décide : fermé, on ne voit que le champ mot de passe ; ouvert, on
 * voit les Réglages. Il n'y a rien d'autre à atteindre dans ce chantier, et un
 * routeur donnerait des adresses vers des écrans qui n'existent pas.
 */
export function App() {
  const [etat, setEtat] = useState<Etat>('chargement')

  useEffect(() => {
    fetch('/api/verrou')
      .then((r) => r.json())
      .then((r: { ouvert: boolean }) => setEtat(r.ouvert ? 'ouvert' : 'ferme'))
      .catch(() => setEtat('ferme'))
  }, [])

  if (etat === 'chargement') {
    return (
      <main className="page">
        <p className="doux">Chargement…</p>
      </main>
    )
  }

  if (etat === 'ferme') return <Entree surOuverture={() => setEtat('ouvert')} />

  return <Reglages surFermeture={() => setEtat('ferme')} />
}
