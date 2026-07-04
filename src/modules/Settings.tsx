import { useState } from 'react'
import { supabase, PLAYER_NAME } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, deleteRow } from '../lib/useData'
import { Field, Input, Select, Badge, Spinner, ConfirmButton, Empty } from '../components/ui'
import { fmtDate } from '../lib/format'
import type { AllowedEmail, Profile } from '../lib/types'

export default function Settings() {
  const { isAdmin } = useAuth()
  const { rows, loading, reload } = useCollection<AllowedEmail>('crm_allowed_emails', { orderBy: 'created_at', ascending: true })
  const { rows: profiles } = useCollection<Profile>('crm_profiles', { orderBy: 'created_at', ascending: true })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'player' | 'admin' | 'creator'>('player')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isAdmin) return <Empty icon="🔒" title="Area riservata" hint="Solo gli amministratori AUVI possono accedere alle impostazioni." />
  if (loading) return <Spinner />

  async function add() {
    if (!email.trim()) return
    setBusy(true); setErr('')
    const { error } = await insertRow('crm_allowed_emails', { email: email.trim().toLowerCase(), role, note: note || null })
    setBusy(false)
    if (error) setErr(error.message)
    else { setEmail(''); setNote(''); reload() }
  }

  const connected = (e: string) => profiles.some(p => (p.email || '').toLowerCase() === e.toLowerCase())

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head"><div className="card-title">Chi può accedere a questo spazio</div></div>
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Solo gli indirizzi in questa lista possono entrare. Aggiungi qui l'email personale di {PLAYER_NAME} per dargli accesso — riceverà un link magico al primo login.
        </div>
        <div className="flex gap wrap" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 200 }}><Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="giocatore@email.com" /></Field></div>
          <div style={{ flex: 1, minWidth: 130 }}><Field label="Ruolo"><Select value={role} onChange={e => setRole(e.target.value as any)}><option value="player">Giocatore</option><option value="admin">AUVI · Advisor</option><option value="creator">Team · Creator</option></Select></Field></div>
          <div style={{ flex: 1, minWidth: 130 }}><Field label="Nota"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="es. Lorenzo" /></Field></div>
          <button className="btn btn-primary" style={{ marginBottom: 14 }} disabled={busy || !email} onClick={add}>+ Autorizza</button>
        </div>
        {err && <div className="msg-err" style={{ marginBottom: 12 }}>{err}</div>}

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Email</th><th>Ruolo</th><th>Nota</th><th>Stato</th><th>Aggiunto</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.email}>
                  <td><b>{r.email}</b></td>
                  <td><Badge tone={r.role === 'admin' ? 'blue' : r.role === 'creator' ? 'gold' : 'accent'}>{r.role === 'admin' ? 'AUVI · Advisor' : r.role === 'creator' ? 'Team · Creator' : 'Giocatore'}</Badge></td>
                  <td className="muted">{r.note || '—'}</td>
                  <td>{connected(r.email) ? <Badge tone="green">Attivo</Badge> : <Badge tone="gold">In attesa 1° login</Badge>}</td>
                  <td className="faint">{fmtDate(r.created_at)}</td>
                  <td className="right"><ConfirmButton onConfirm={async () => { await supabase.from('crm_allowed_emails').delete().eq('email', r.email); reload() }}>Revoca</ConfirmButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">Come replicare per un nuovo atleta</div></div>
        <ol className="muted" style={{ fontSize: 13, lineHeight: 1.9, paddingLeft: 18 }}>
          <li>Crea un nuovo progetto Supabase dedicato all'atleta e applica le stesse migrazioni <code>crm_*</code>.</li>
          <li>Duplica questo repo, imposta le env <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> / <code>VITE_PLAYER_NAME</code>.</li>
          <li>Fai il deploy su Vercel e autorizza qui l'email dell'atleta e di AUVI.</li>
        </ol>
      </div>
    </div>
  )
}
