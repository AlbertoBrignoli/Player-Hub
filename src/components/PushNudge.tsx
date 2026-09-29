import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { enablePush, getPushState, isIosBrowser, pushSupported } from '../lib/push'
import { toast } from '../lib/toast'
import Icon from './Icon'

const DISMISS_KEY = 'push-nudge-dismissed'

// Banner in Home: invita ad attivare le notifiche sul dispositivo.
// Sparisce quando sono attive o se l'utente lo chiude (ricompare dopo 7 giorni).
// Su iPhone da browser spiega il passaggio "Aggiungi a Home", senza cui iOS non manda push.
export default function PushNudge() {
  const { session, role } = useAuth()
  const [state, setState] = useState<'on' | 'off' | 'unsupported' | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) || 0)
      return Date.now() - t < 7 * 24 * 3600 * 1000
    } catch { return false }
  })
  const ios = isIosBrowser()

  useEffect(() => { getPushState().then(setState) }, [])

  if (dismissed || state === 'loading' || state === 'on') return null
  if (state === 'unsupported' && !ios) return null

  async function activate() {
    if (!session || !role) return
    setBusy(true)
    const err = await enablePush(session.user.id, role)
    setBusy(false)
    if (err) { toast(err, 'err'); return }
    setState('on')
    toast('Notifiche attive su questo dispositivo')
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* modalità privata */ }
    setDismissed(true)
  }

  return (
    <div className="nudge" role="region" aria-label="Notifiche" style={{ marginBottom: 16 }}>
      <div className="nudge-ico"><Icon name="bell" size={20} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="nudge-t">{ios ? 'Aggiungi AUVI alla schermata Home' : 'Attiva le notifiche'}</div>
        <div className="nudge-s">
          {ios
            ? 'Tocca Condividi → Aggiungi a Home, poi apri l\'app da lì: su iPhone le notifiche arrivano solo così.'
            : 'Partite, foto da approvare e messaggi: ti avvisiamo appena succede qualcosa.'}
        </div>
      </div>
      {!ios && pushSupported() && (
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={activate}>{busy ? 'Attivo…' : 'Attiva'}</button>
      )}
      <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label="Non ora" style={{ color: 'rgba(255,255,255,.7)', marginLeft: ios ? 'auto' : 0 }}>
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}
