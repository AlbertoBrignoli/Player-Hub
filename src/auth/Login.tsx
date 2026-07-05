import React, { useState } from 'react'
import { supabase, AGENCY_NAME, PLAYER_NAME } from '../lib/supabase'
import { Input } from '../components/ui'

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
    if (error) {
      setErr(error.message === 'Invalid login credentials'
        ? 'Email o password non corretti. Se è il tuo primo accesso o hai dimenticato la password, usa il link via email qui sotto.'
        : error.message)
    }
  }

  async function magicLink() {
    if (!email.trim()) { setErr('Inserisci prima la tua email.'); return }
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">A</div>
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
