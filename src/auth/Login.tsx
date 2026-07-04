import React, { useState } from 'react'
import { supabase, AGENCY_NAME, PLAYER_NAME } from '../lib/supabase'
import { Input } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
            ✉️ Link di accesso inviato a <b>{email}</b>.<br />
            Apri l'email e clicca sul link per entrare.
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
            {err && <div className="msg-err" style={{ marginBottom: 14 }}>{err}</div>}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={busy}>
              {busy ? 'Invio…' : 'Ricevi link di accesso'}
            </button>
          </form>
        )}

        <div className="login-note">
          Accesso consentito solo agli indirizzi autorizzati.<br />
          Riceverai un link magico via email — nessuna password da ricordare.
        </div>
      </div>
    </div>
  )
}
