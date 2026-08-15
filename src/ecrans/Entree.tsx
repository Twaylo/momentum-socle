import { useState, type FormEvent } from 'react'

/**
 * Le verrou d'entrée.
 *
 * Un champ, un bouton. Pas de compte, pas d'inscription, pas de « mot de passe
 * oublié » : le mot de passe est une variable d'environnement que le fondateur
 * a lui-même posée.
 */
export function Entree({ surOuverture }: { surOuverture: () => void }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setMessage(null)

    try {
      const r = await fetch('/api/verrou', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motDePasse }),
      })
      const corps = (await r.json()) as { ouvert: boolean; message?: string }

      if (corps.ouvert) {
        surOuverture()
        return
      }
      setMessage(corps.message ?? 'Mot de passe incorrect.')
    } catch {
      // Aucun catch vide : on dit ce qui s'est passé, même quand c'est le
      // réseau. Un formulaire qui ne réagit pas est pire qu'un refus.
      setMessage('Le serveur n’a pas répondu.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <main className="page">
      <h1>Momentum</h1>
      <form className="carte" onSubmit={envoyer}>
        <h2>Mot de passe</h2>
        <p className="doux">Cet outil est personnel. Une seule personne y entre.</p>
        <p>
          <input
            type="password"
            value={motDePasse}
            autoFocus
            autoComplete="current-password"
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </p>
        <button type="submit" disabled={enCours}>
          {enCours ? 'Vérification…' : 'Entrer'}
        </button>
        {message ? <p className="erreur">{message}</p> : null}
      </form>
    </main>
  )
}
