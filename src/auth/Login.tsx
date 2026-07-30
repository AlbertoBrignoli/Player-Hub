import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './Login.css'
import { useLang } from '../lib/i18n'

// Schermata di accesso Player Hub (design handoff) collegata all'auth reale:
// email+password (signInWithPassword) e magic link (signInWithOtp).

const HERO_VIDEO = '/login/auvi-sport-atleta.mp4'
const HERO_POSTER = '/login/auvi-sport-atleta-poster.png'
const AUVI_MARK = '/login/auvi-mark-white.png'
const PARTNERS = ['NEST Football', 'EY', 'Delian & Co.', 'Banchero Costa', 'AUVI Flights']

function friendlyError(error: any): string {
  const m = (error?.message || '').toLowerCase()
  const secs = (error?.message || '').match(/(\d+)\s*second/i)?.[1]
  if (error?.status === 429 || m.includes('rate limit') || m.includes('too many') || (m.includes('after') && m.includes('second'))) {
    return secs ? `Troppi tentativi. Riprova tra ${secs} secondi.` : 'Troppi tentativi ravvicinati. Attendi un minuto e riprova.'
  }
  if (m.includes('invalid login credentials')) {
    return 'Email o password non corretti. Se è il tuo primo accesso o hai dimenticato la password, usa il link via email.'
  }
  if (m.includes('email not confirmed')) {
    return 'Email non ancora confermata: usa il link via email per completare il primo accesso.'
  }
  return error?.message || 'Si è verificato un errore. Riprova.'
}

export default function Login() {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // autoplay: muted va forzato sul nodo prima di play() (altrimenti Safari blocca)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.play().catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) { setNotice('Inserisci email e password per continuare.'); return }
    setSending(true); setNotice('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setSending(false)
    if (error) setNotice(friendlyError(error))
  }

  async function handleMagicLink() {
    if (!email.trim()) { setNotice('Inserisci prima la tua email.'); return }
    setSending(true); setNotice('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setSending(false)
    if (error) setNotice(friendlyError(error))
    else setNotice('Ti abbiamo inviato un link di accesso. Controlla la posta (anche lo spam).')
  }

  return (
    <div className="ph-login">
      <section className="ph-login__stage">
        <video
          ref={videoRef}
          className="ph-login__video"
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
        <div className="ph-login__veil ph-login__veil--v" />
        <div className="ph-login__veil ph-login__veil--h" />

        <div className="ph-login__stageInner">
          <header className="ph-login__brand">
            <img src={AUVI_MARK} alt="AUVI" />
            <span className="ph-login__rule" />
            <span className="ph-login__wordmark">PLAYER HUB</span>
          </header>

          <div className="ph-login__claimBlock">
            <p className="ph-login__kicker">{t('IL TUO SPAZIO RISERVATO')}</p>
            <h1 className="ph-login__claim">Own your<br />image.</h1>
            <p className="ph-login__reason">{t('Contratti, compensi, sponsor, agenda, servizi: tutto in un unico posto. Tu pensi a giocare — Player Hub tiene insieme la tua carriera e la fa crescere.')}</p>
            <div className="ph-login__partners">
              <p className="ph-login__partnersLabel">{t('PARTNER NEL TUO HUB')}</p>
              <ul className="ph-login__chips">
                {PARTNERS.map((p) => (
                  <li key={p} className="ph-login__chip">{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="ph-login__panel">
        <div className="ph-login__form">
          <div className="ph-login__tile">
            <img src={AUVI_MARK} alt="" />
          </div>

          <h2 className="ph-login__title">{t('Bentornato.')}</h2>
          <p className="ph-login__sub">{t('Accedi al tuo Player Hub.')}</p>

          <form onSubmit={handleSubmit} className="ph-login__fields">
            <label className="ph-login__field">
              <span className="ph-login__label">{t('EMAIL')}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@email.com"
              />
            </label>

            <label className="ph-login__field">
              <span className="ph-login__label">
                {t('PASSWORD')}
                <button type="button" className="ph-login__pwToggle" onClick={() => setShowPw((s) => !s)}>
                  {showPw ? t('NASCONDI') : t('MOSTRA')}
                </button>
              </span>
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>

            <button type="submit" className="ph-login__cta" disabled={sending}>
              {sending ? t('Accesso in corso…') : t('Entra')}
            </button>

            <button type="button" className="ph-login__link" onClick={handleMagicLink} disabled={sending}>
              {t('Primo accesso o password dimenticata →')}
            </button>
          </form>

          {notice && <p className="ph-login__notice" role="status">{notice}</p>}

          <footer className="ph-login__footer">
            <p className="ph-login__invite"><span className="ph-login__dot" />{t('Accesso su invito · solo indirizzi autorizzati')}</p>
            <p className="ph-login__fine">{t('Al primo accesso usa il link via email, poi imposta la password dalle Impostazioni.')}</p>
          </footer>
        </div>
      </section>
    </div>
  )
}
