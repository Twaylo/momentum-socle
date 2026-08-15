import { useCallback, useEffect, useState } from 'react'

type EtatCompte = {
  cle: string
  mot: string
  phrase: string | null
  action: string | null
  gravite: 'ok' | 'attention' | 'rupture'
}

type Compte = {
  id: number
  reseau: string
  nom: string | null
  expireLe: string | null
  expirationConnue: boolean
  derniereErreur: string | null
  derniereErreurLe: string | null
  connecteLe: string | null
  etat: EtatCompte
}

type Reseau = {
  reseau: string
  configure: boolean
  adresseDeRetour: string
  compte: Compte | null
}

const LIBELLES: Record<string, string> = { youtube: 'YouTube' }

/** Une date lisible, ou la vérité quand il n'y en a pas. */
function dateLisible(iso: string | null): string {
  if (!iso) return 'inconnue'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function Reglages({ surFermeture }: { surFermeture: () => void }) {
  const [reseaux, setReseaux] = useState<Reseau[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [sonde, setSonde] = useState<unknown>(null)
  const [sondeEnCours, setSondeEnCours] = useState(false)

  const parametres = new URLSearchParams(window.location.search)
  const annule = parametres.get('annule')
  const echec = parametres.get('erreur')

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/connexions')
      if (r.status === 401) {
        surFermeture()
        return
      }
      const corps = (await r.json()) as { reseaux: Reseau[] }
      setReseaux(corps.reseaux)
    } catch {
      setErreur('Le serveur n’a pas répondu.')
    }
  }, [surFermeture])

  useEffect(() => {
    void charger()
  }, [charger])

  async function ausculter() {
    setSondeEnCours(true)
    setSonde(null)
    try {
      const r = await fetch('/api/diagnostic/youtube')
      setSonde(await r.json())
    } catch (e) {
      setSonde({ erreur: String(e) })
    } finally {
      setSondeEnCours(false)
    }
  }

  return (
    <main className="page">
      <h1>Réglages</h1>

      {annule ? (
        <p className="doux">
          Tu as fermé la fenêtre de Google sans confirmer. Rien n’est cassé, rien à réparer.
        </p>
      ) : null}
      {echec ? <p className="erreur">La connexion a échoué : {echec}</p> : null}
      {erreur ? <p className="erreur">{erreur}</p> : null}

      {reseaux === null ? <p className="doux">Chargement…</p> : null}

      {reseaux?.map((r) => (
        <section className="carte" key={r.reseau}>
          <div className="ligne">
            <h2>{LIBELLES[r.reseau] ?? r.reseau}</h2>
            <span className={`pastille pastille-${r.compte?.etat.gravite ?? 'rupture'}`}>
              {r.compte ? r.compte.etat.mot : 'Non connecté'}
            </span>
          </div>

          {r.compte ? (
            <>
              {r.compte.nom ? <p>{r.compte.nom}</p> : null}
              {r.compte.etat.phrase ? <p className="erreur">{r.compte.etat.phrase}</p> : null}

              {/*
                ⚠ Trois états, jamais deux. Une échéance non communiquée par
                Google s'écrit « inconnue » — pas une date inventée, pas « expiré ».
              */}
              <p className="doux">
                Jeton :{' '}
                {r.compte.expirationConnue
                  ? `expire le ${dateLisible(r.compte.expireLe)}`
                  : 'expiration inconnue — Google ne l’a pas communiquée'}
              </p>
              <p className="doux">Connecté depuis le {dateLisible(r.compte.connecteLe)}</p>

              {/*
                La dernière erreur reste visible même quand le compte remarche :
                c'est elle qui explique ce qui s'est passé entre-temps.
              */}
              <p className="doux">
                Dernière erreur :{' '}
                {r.compte.derniereErreur
                  ? `${r.compte.derniereErreur} (${dateLisible(r.compte.derniereErreurLe)})`
                  : 'aucune'}
              </p>

              <p>
                <a className="bouton" href={`/api/connexions/${r.reseau}/demarrer`}>
                  Reconnecter
                </a>
              </p>
            </>
          ) : (
            <>
              <p className="doux">
                {r.configure
                  ? 'Aucun compte connecté pour ce réseau.'
                  : 'Identifiants développeur absents : la connexion ne peut pas partir.'}
              </p>
              {r.configure ? (
                <p>
                  <a className="bouton" href={`/api/connexions/${r.reseau}/demarrer`}>
                    Connecter {LIBELLES[r.reseau] ?? r.reseau}
                  </a>
                </p>
              ) : null}
            </>
          )}

          <p className="doux">Adresse de retour déclarée : {r.adresseDeRetour || 'inconnue'}</p>
        </section>
      ))}

      <section className="carte">
        <h2>Sonde Google</h2>
        <p className="doux">
          Montre la réponse brute de Google, entière, avec les mêmes paramètres que le produit.
          Elle peut renouveler le jeton au passage — c’est le prix d’emprunter le vrai chemin, et
          elle le dit quand elle le fait.
        </p>
        <button className="discret" onClick={() => void ausculter()} disabled={sondeEnCours}>
          {sondeEnCours ? 'Mesure…' : 'Ausculter'}
        </button>
        {sonde ? <pre>{JSON.stringify(sonde, null, 2)}</pre> : null}
      </section>

      <button
        className="discret"
        onClick={() => {
          void fetch('/api/verrou', { method: 'DELETE' }).then(surFermeture)
        }}
      >
        Sortir
      </button>
    </main>
  )
}
