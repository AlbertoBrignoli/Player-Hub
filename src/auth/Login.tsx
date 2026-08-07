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
  const [inviteMode, setInviteMode] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
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
    // pre-check: l'email deve essere autorizzata, altrimenti il link non partirebbe
    // (e l'utente non capirebbe perché). Così mostriamo subito un messaggio chiaro.
    const { data: chk } = await supabase.rpc('crm_check_email_allowed', { p_email: email.trim() })
    if (chk && chk.allowed === false) {
      setSending(false)
      setNotice('Questa email non è autorizzata all\'accesso. Se hai ricevuto un codice invito usa "Registrati con codice invito" qui sotto, altrimenti contatta AUVI.')
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setSending(false)
    if (error) setNotice(friendlyError(error))
    else setNotice('Ti abbiamo inviato un link di accesso. Controlla la posta (anche lo spam).')
  }

  // Registrazione con codice invito: il codice (generato dall'atleta con la figura
  // professionale) autorizza l'email con il ruolo giusto; al primo accesso via magic
  // link il profilo e la vista dedicata vengono creati automaticamente.
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !inviteCode.trim()) { setNotice('Inserisci email e codice invito.'); return }
    setSending(true); setNotice('')
    const { data, error } = await supabase.rpc('crm_redeem_invite', {
      p_code: inviteCode.trim(), p_email: email.trim(),
    })
    if (error) { setSending(false); setNotice(friendlyError(error)); return }
    if (!data?.ok) {
      setSending(false)
      setNotice(data?.error === 'already_registered'
        ? 'Questa email è già registrata: torna al login e accedi normalmente (o usa il link via email).'
        : (data?.error || 'Codice non valido.'))
      return
    }
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setSending(false)
    if (otpErr) { setNotice(friendlyError(otpErr)); return }
    setInviteCode('')
    setNotice(`Codice valido${data.player ? ` — sarai collegato a ${data.player}` : ''}! Ti abbiamo inviato il link per completare la registrazione. Controlla la posta (anche lo spam).`)
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

          <h2 className="ph-login__title">{inviteMode ? t('Benvenuto.') : t('Bentornato.')}</h2>
          <p className="ph-login__sub">{inviteMode ? t('Registrati con il codice invito ricevuto.') : t('Accedi al tuo Player Hub.')}</p>

          {inviteMode ? (
          <form onSubmit={handleInvite} className="ph-login__fields">
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
              <span className="ph-login__label">{t('CODICE INVITO')}</span>
              <input
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ES. ELI-4F2A91"
              />
            </label>

            <button type="submit" className="ph-login__cta" disabled={sending}>
              {sending ? t('Verifica in corso…') : t('Registrati')}
            </button>

            <button type="button" className="ph-login__link" onClick={() => { setInviteMode(false); setNotice('') }} disabled={sending}>
              {t('← Torna al login')}
            </button>
          </form>
          ) : (
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

            <button type="button" className="ph-login__link" onClick={() => { setInviteMode(true); setNotice('') }} disabled={sending}>
              {t('Registrati con codice invito →')}
            </button>
          </form>
          )}

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
