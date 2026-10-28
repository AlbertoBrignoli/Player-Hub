import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, deleteRow } from '../lib/useData'
import { Field, Input, Select, Badge, Spinner, ConfirmButton, Empty } from '../components/ui'
import { fmtDate } from '../lib/format'
import type { AllowedEmail, Profile } from '../lib/types'
import CalendarSync from '../components/CalendarSync'
import { InstallInviteCard } from '../components/InstallGuide'
import { useLang } from '../lib/i18n'

export default function Settings() {
  const { isAdmin } = useAuth()
  const { t } = useLang()
  const { rows, loading, reload } = useCollection<AllowedEmail>('crm_allowed_emails', { orderBy: 'created_at', ascending: true })
  const { rows: profiles } = useCollection<Profile>('crm_profiles', { orderBy: 'created_at', ascending: true })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('player')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // La sezione Sicurezza è per tutti; whitelist e replica solo per gli admin.
  if (!isAdmin) {
    return (
      <div className="grid" style={{ gap: 16 }}>
        <CalendarSync />
        <InstallInviteCard />
        <SecurityCard />
      </div>
    )
  }
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
      <CalendarSync />
        <InstallInviteCard />
      <SecurityCard />
      <SocialCard />

      <div className="card">
        <div className="card-head"><div className="card-title">{t('Chi può accedere a questo spazio')}</div></div>
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
          {t("Solo gli indirizzi in questa lista possono entrare. Aggiungi qui l'email personale dell'atleta per dargli accesso — riceverà un link magico al primo login.")}
        </div>
        <div className="flex gap wrap" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 200 }}><Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="giocatore@email.com" /></Field></div>
          <div style={{ flex: 1, minWidth: 130 }}><Field label={t('Ruolo')}><Select value={role} onChange={e => setRole(e.target.value as any)}><option value="player">{t('Giocatore')}</option><option value="admin">AUVI · Advisor</option><option value="creator">Team · Creator</option><option value="brand">Brand</option><option value="agente">{t('Procuratore')}</option><option value="preparatore">{t('Preparatore atletico')}</option><option value="fisioterapista">{t('Fisioterapista')}</option><option value="nutrizionista">{t('Nutrizionista')}</option><option value="assicuratore">{t('Assicuratore')}</option><option value="commercialista">{t('Commercialista')}</option><option value="wealth">Wealth manager</option></Select></Field></div>
          <div style={{ flex: 1, minWidth: 130 }}><Field label={t('Nota')}><Input value={note} onChange={e => setNote(e.target.value)} placeholder={t('es. Lorenzo')} /></Field></div>
          <button className="btn btn-primary" style={{ marginBottom: 14 }} disabled={busy || !email} onClick={add}>{t('+ Autorizza')}</button>
        </div>
        {err && <div className="msg-err" style={{ marginBottom: 12 }}>{err}</div>}

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Email</th><th>{t('Ruolo')}</th><th>{t('Nota')}</th><th>{t('Stato')}</th><th>{t('Aggiunto')}</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.email}>
                  <td><b>{r.email}</b></td>
                  <td><Badge tone={r.role === 'admin' ? 'blue' : r.role === 'creator' ? 'gold' : r.role === 'brand' ? 'green' : 'accent'}>{r.role === 'admin' ? 'AUVI · Advisor' : r.role === 'creator' ? 'Team · Creator' : r.role === 'brand' ? 'Brand' : t('Giocatore')}</Badge></td>
                  <td className="muted">{r.note || '—'}</td>
                  <td>{connected(r.email) ? <Badge tone="green">{t('Attivo')}</Badge> : <Badge tone="gold">{t('In attesa 1° login')}</Badge>}</td>
                  <td className="faint">{fmtDate(r.created_at)}</td>
                  <td className="right"><ConfirmButton onConfirm={async () => { await supabase.from('crm_allowed_emails').delete().eq('email', r.email); reload() }}>{t('Revoca')}</ConfirmButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">{t('Come aggiungere un nuovo atleta')}</div></div>
        <ol className="muted" style={{ fontSize: 13, lineHeight: 1.9, paddingLeft: 18 }}>
          <li>{t("Inserisci i dati dell'atleta in")} <b>{t('questo stesso')}</b> {t('progetto Supabase (riga')} <code>player</code> + record <code>crm_*</code>). {t('Nessun nuovo progetto, nessun nuovo deploy.')}</li>
          <li>{t("Autorizza qui sopra l'email dell'atleta con ruolo")} <b>{t('Giocatore')}</b> {t('(e le email dei professionisti collegati).')}</li>
          <li>{t("L'atleta comparirà nel selettore in alto e, grazie alla RLS, vedrà solo i propri dati.")}</li>
        </ol>
      </div>
    </div>
  )
}

function SocialCard() {
  // I numeri sono PER ATLETA: si legge e si scrive sulla riga dell'atleta attivo.
  const { athleteId, athletes } = useAthlete()
  const { t } = useLang()
  const [followers, setFollowers] = useState('')
  const [engagement, setEngagement] = useState('')
  const [reach, setReach] = useState('')
  const [ig, setIg] = useState('')
  const [audience, setAudience] = useState('')
  const [connected, setConnected] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!athleteId) return
    setLoaded(false); setMsg('')
    supabase.from('player').select('*').eq('api_player_id', athleteId).maybeSingle().then(({ data }) => {
      const p = data as any
      // reset esplicito: cambiando atleta i campi non devono restare quelli di prima
      setFollowers(p?.instagram_followers ?? ''); setEngagement(p?.instagram_engagement ?? '')
      setReach(p?.instagram_reach ?? ''); setIg(p?.instagram_url ?? ''); setAudience(p?.audience_note ?? '')
      setConnected(!!p?.instagram_connected)
      setLoaded(true)
    })
  }, [athleteId])

  async function save() {
    if (!athleteId) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('player').update({
      instagram_url: ig || null,
      instagram_followers: followers ? Number(followers) : null,
      instagram_engagement: engagement ? Number(engagement) : null,
      instagram_reach: reach ? Number(reach) : null,
      audience_note: audience || null,
      instagram_connected: connected,
    }).eq('api_player_id', athleteId)
    setBusy(false)
    setMsg(error ? error.message : t('Numeri social di {name} salvati — visibili ai brand nel Media Kit.').replace('{name}', athleteName))
  }

  const athleteName = athletes.find(a => a.api_player_id === athleteId)?.name || t('atleta')

  if (!loaded) return null
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{t('Instagram & numeri social')}</div>
        <span className="badge">{athleteName}</span>
      </div>
      <div className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
        {t('Numeri di')} <b>{athleteName}</b>{t(': cambia atleta dal selettore in alto per compilare gli altri.')}{' '}
        {t('Compaiono nel Media Kit che vedono i brand. Inseriscili a mano (aggiornali ogni tanto).')}{' '}
        {t("La sincronizzazione automatica da Instagram richiede un collegamento con un account Business e l'app Meta: posso attivarla in un secondo momento se vuoi.")}
      </div>
      <div className="flex gap wrap" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 220 }}><Field label={t('Profilo Instagram (URL)')}><Input value={ig} onChange={e => setIg(e.target.value)} placeholder="https://www.instagram.com/…" /></Field></div>
        <div style={{ flex: 1, minWidth: 120 }}><Field label={t('Follower')}><Input type="number" value={followers} onChange={e => setFollowers(e.target.value)} placeholder={t('es. 85000')} /></Field></div>
        <div style={{ flex: 1, minWidth: 120 }}><Field label="Engagement %"><Input type="number" value={engagement} onChange={e => setEngagement(e.target.value)} placeholder={t('es. 4.2')} /></Field></div>
        <div style={{ flex: 1, minWidth: 120 }}><Field label={t('Reach medio/post')}><Input type="number" value={reach} onChange={e => setReach(e.target.value)} placeholder={t('es. 42000')} /></Field></div>
      </div>
      <Field label={t('Nota pubblico (demografia, mercati…)')}><Input value={audience} onChange={e => setAudience(e.target.value)} placeholder={t('Es. 68% Italia · 22% Grecia · 18-34 anni')} /></Field>
      <div className="flex between wrap gap" style={{ alignItems: 'center' }}>
        <label className="flex gap" style={{ gap: 8, fontSize: 12.5, color: 'var(--text-dim)', cursor: 'pointer' }}>
          <input type="checkbox" checked={connected} onChange={e => setConnected(e.target.checked)} /> {t('Segna come “profilo collegato”')}
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t('Salvo…') : t('Salva numeri social')}</button>
      </div>
      {msg && <div className="msg-ok" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  )
}

function SecurityCard() {
  const { session, profile } = useAuth()
  const { t } = useLang()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    if (pw.length < 8) { setMsg({ ok: false, text: t('La password deve avere almeno 8 caratteri.') }); return }
    if (pw !== pw2) { setMsg({ ok: false, text: t('Le due password non coincidono.') }); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSaving(false)
    if (error) setMsg({ ok: false, text: error.message })
    else { setPw(''); setPw2(''); setMsg({ ok: true, text: t('Password salvata! Dal prossimo accesso entri con email e password, senza link via email.') }) }
  }

  return (
    <div className="card">
      <div className="card-head"><div className="card-title">{t('Sicurezza · la tua password')}</div></div>
      <div className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
        {t('Account:')} <b>{profile?.email || session?.user.email}</b> — {t('imposta (o cambia) la password per entrare direttamente con email e password. Il link via email resta disponibile se la dimentichi.')}
      </div>
      <div className="flex gap wrap" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Field label={t('Nuova password')}><Input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder={t('Minimo 8 caratteri')} autoComplete="new-password" /></Field>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Field label={t('Ripeti password')}><Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        </div>
        <button className="btn btn-primary" style={{ marginBottom: 14 }} disabled={saving || !pw} onClick={save}>
          {saving ? t('Salvo…') : t('Salva password')}
        </button>
      </div>
      {msg && <div className={msg.ok ? 'msg-ok' : 'msg-err'}>{msg.text}</div>}
    </div>
  )
}
