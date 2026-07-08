import React, { useState } from 'react'
import { supabase, AGENCY_NAME, PLAYER_NAME } from '../lib/supabase'
import { Input } from '../components/ui'

function friendlyError(error: any): string {
  const m = (error?.message || '').toLowerCase()
  const secs = (error?.message || '').match(/(\d+)\s*second/i)?.[1]
  if (error?.status === 429 || m.includes('rate limit') || m.includes('too many') || (m.includes('after') && m.includes('second'))) {
    return secs ? `Troppi tentativi. Riprova tra ${secs} secondi.` : 'Troppi tentativi ravvicinati. Attendi un minuto e riprova.'
  }
  if (m.includes('invalid login credentials')) {
    return 'Email o password non corretti. Se è il tuo primo accesso o hai dimenticato la password, usa il link via email qui sotto.'
  }
  if (m.includes('email not confirmed')) {
    return 'Email non ancora confermata: usa il link via email qui sotto per completare il primo accesso.'
  }
  return error?.message || 'Si è verificato un errore. Riprova.'
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) setErr(friendlyError(error))
  }

  async function magicLink() {
    if (!email.trim()) { setErr('Inserisci prima la tua email.'); return }
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setErr(friendlyError(error))
    else setSent(true)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img className="login-logo-img" src="/icons/icon-192.png" alt="AUVI — All Around The Game" />
        <div className="login-title">Player Hub</div>
        <div className="login-sub">Spazio riservato · {PLAYER_NAME} × {AGENCY_NAME}</div>

        {sent ? (
          <div className="msg-ok">
            Link di accesso inviato a <b>{email}</b>.<br />
            Apri l'email e clicca sul link per entrare. Una volta dentro potrai impostare la tua password dalle Impostazioni.
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <Input
                type="email" required placeholder="nome@email.com"
                value={email} onChange={e => setEmail(e.target.value)} autoFocus
              />
            </div>
            <div className="field">
              <label>Password</label>
              <Input
                type="password" required placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>
            {err && <div className="msg-err" style={{ marginBottom: 14 }}>{err}</div>}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={busy}>
              {busy ? 'Accesso…' : 'Entra'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy} onClick={magicLink}>
              Primo accesso / password dimenticata → link via email
            </button>
          </form>
        )}

        <div className="login-note">
          Accesso consentito solo agli indirizzi autorizzati.<br />
          Al primo accesso usa il link via email, poi imposta la tua password dalle Impostazioni.
        </div>
      </div>
    </div>
  )
}
