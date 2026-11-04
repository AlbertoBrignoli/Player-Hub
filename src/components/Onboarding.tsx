import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { enablePush, pushSupported } from '../lib/push'
import { toast } from '../lib/toast'
import Icon from './Icon'

// Primo accesso guidato: 3 schermate brevi la prima volta che qualcuno entra (per ogni dispositivo).
// 1) dove sono le cose  2) team e chat  3) notifiche. Si salta in ogni momento.
const KEY = (uid?: string) => `onboarded:${uid || ''}`

export function needsOnboarding(uid?: string) {
  if (!uid) return false
  try { return localStorage.getItem(KEY(uid)) !== '1' } catch { return false }
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const { session, role, profile } = useAuth()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const isPlayer = role === 'player'
  const name = (profile?.full_name || '').split(' ')[0]

  function finish() {
    try { localStorage.setItem(KEY(session?.user.id), '1') } catch { /* modalità privata */ }
    onDone()
  }
  async function notifications() {
    if (!session || !role) return finish()
    setBusy(true)
    const err = await enablePush(session.user.id, role)
    setBusy(false)
    if (err) toast(t(err), 'err'); else toast(t('Notifiche attive'))
    finish()
  }

  const steps = [
    {
      icon: 'home',
      title: name ? t('Ciao {name}, benvenuto in Player Hub').replace('{name}', name) : t('Benvenuto in Player Hub'),
      text: isPlayer
        ? t('La Home ti dice cosa ti aspetta oggi: prossimo impegno, cose da fare da smarcare, la tua partita e i numeri della stagione.')
        : t('Dalla Home vedi gli atleti che segui, cosa ti chiedono e cosa hai in programma.'),
    },
    {
      icon: 'users',
      title: t('Il tuo team, in un posto solo'),
      text: isPlayer
        ? t('In Il mio team trovi tutte le persone che lavorano con te. In Chat scrivi a ognuno, come su WhatsApp.')
        : t('Scrivi all\'atleta e allo staff in Chat, proponi impegni e segui le richieste dal tuo ufficio.'),
    },
    {
      icon: 'bell',
      title: t('Non perdere niente'),
      text: t('Attiva le notifiche: ti avvisiamo quando qualcuno ti scrive, ti propone un impegno o ti chiede qualcosa. Puoi scegliere cosa ricevere dalle Impostazioni.'),
    },
  ]
  const s = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label={t('Benvenuto')}>
      <style>{OB_CSS}</style>
      <div className="ob">
        <button className="ob-skip" onClick={finish}>{t('Salta')}</button>
        <div className="ob-ic"><Icon name={s.icon} size={30} /></div>
        <div className="ob-t">{s.title}</div>
        <div className="ob-s">{s.text}</div>
        <div className="ob-dots" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
        {last ? (
          <div className="ob-actions">
            {pushSupported() && <button className="btn btn-primary ob-cta" disabled={busy} onClick={notifications}>{busy ? t('Attivo…') : t('Attiva le notifiche')}</button>}
            <button className="btn btn-ghost ob-cta" onClick={finish}>{pushSupported() ? t('Più tardi') : t('Inizia')}</button>
          </div>
        ) : (
          <div className="ob-actions">
            <button className="btn btn-primary ob-cta" onClick={() => setStep(step + 1)}>{t('Avanti')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

const OB_CSS = `
.ob-overlay { position: fixed; inset: 0; z-index: 130; background: rgba(10,10,10,.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: grid; place-items: center; padding: 16px; }
.ob { position: relative; width: 100%; max-width: 420px; background: var(--surface); border-radius: var(--radius); padding: 36px 24px 24px; text-align: center; display: grid; gap: 12px; justify-items: center; box-shadow: var(--shadow); }
.ob-skip { position: absolute; top: 12px; right: 14px; border: 0; background: none; font: inherit; font-size: var(--fs-meta); font-weight: 600; color: var(--text-dim); cursor: pointer; padding: 8px; }
.ob-ic { width: 72px; height: 72px; border-radius: 22px; background: var(--yellow); color: var(--ink); display: grid; place-items: center; margin-bottom: 4px; }
.ob-t { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; font-size: 20px; line-height: 1.2; text-transform: uppercase; max-width: 340px; }
.ob-s { font-size: var(--fs-body); color: var(--text-dim); line-height: 1.5; max-width: 340px; }
.ob-dots { display: flex; gap: 6px; margin: 6px 0 4px; }
.ob-dots span { width: 7px; height: 7px; border-radius: 50%; background: var(--border-2); transition: width .2s; }
.ob-dots span.on { width: 20px; border-radius: 999px; background: var(--ink); }
.ob-actions { display: grid; gap: 8px; width: 100%; }
.ob-cta { width: 100%; justify-content: center; min-height: 48px; }
@media (max-width: 640px) { .ob-overlay { align-items: end; padding: 0; } .ob { max-width: none; border-radius: 22px 22px 0 0; padding-bottom: calc(24px + env(safe-area-inset-bottom)); } }
`

// Mostra il primo accesso guidato una sola volta, dopo che la password è stata impostata
// (prima c'è la schermata obbligatoria della password: non si sovrappongono)
export function OnboardingGate() {
  const { session } = useAuth()
  const uid = session?.user.id
  const ready = session?.user?.user_metadata?.password_set === true
  const [show, setShow] = useState(() => needsOnboarding(uid))
  if (!uid || !ready || !show || !needsOnboarding(uid)) return null
  return <Onboarding onDone={() => setShow(false)} />
}
