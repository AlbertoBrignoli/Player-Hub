import { useEffect, useState } from 'react'

// Routing leggero sull'hash dell'URL: #/media?tab=approvare
// - il tasto indietro del browser/telefono torna alla schermata precedente
// - un refresh resta sulla stessa schermata
// - notifiche e card possono aprire una vista precisa (goto('media?tab=approvare'))
// I moduli continuano a ricevere goto(route: string): la stringa può avere parametri.

function read(): { route: string | null; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [route, query = ''] = raw.split('?')
  return { route: route || null, params: new URLSearchParams(query) }
}

export function goto(target: string) {
  const next = '#/' + target.replace(/^#?\/?/, '')
  if (window.location.hash === next) return
  window.location.hash = next
}

export function useHashRoute(): [string | null, (r: string) => void] {
  const [route, setRoute] = useState(() => read().route)
  useEffect(() => {
    const on = () => {
      setRoute(read().route)
      document.querySelector('.content')?.scrollTo({ top: 0 })
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [route, goto]
}

// Parametro della vista corrente (es. useRouteParam('tab')), aggiornato a ogni navigazione.
export function useRouteParam(name: string): string | null {
  const [value, setValue] = useState(() => read().params.get(name))
  useEffect(() => {
    const on = () => setValue(read().params.get(name))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [name])
  return value
}
