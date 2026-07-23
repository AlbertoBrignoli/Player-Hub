import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Field, Input, Textarea, Empty, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime } from '../lib/format'

// Collegamenti fra professionisti e atleti.
// Il professionista NON vede l'elenco degli atleti: inserisce il codice che gli
// è stato consegnato. Agenzia e atleta approvano con un clic.
const ACCENT = '#8b7ff0'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

const ROLE_LABEL: Record<string, string> = {
  assicuratore: 'Assicuratore', agente: 'Procuratore', preparatore: 'Preparatore atletico',
}

type Req = {
  id: string
  requester_id: string
  requester_name: string | null
  requester_email: string | null
  requester_role: string
  player_id: number
  message: string | null
  status: string
  created_at: string
}

export default function AccessRequests() {
  const { role, isAdmin } = useAuth()
  const { athletes } = useAthlete()
  const [rows, setRows] = useState<Req[]>([])
  const [codes, setCodes] = useState<{ name: string; code: string }[]>([])
  const [loading, setLoading] = useState(true)

  const isPro = ['assicuratore', 'agente', 'preparatore'].includes(role || '')
  const canDecide = isAdmin || role === 'player'

  async function load() {
    const { data } = await supabase.from('crm_access_requests')
      .select('*').order('created_at', { ascending: false })
    const list = (data as Req[]) || []
    setRows(list)

    // codici da consegnare ai professionisti (l'atleta trova il suo in home)
    if (isAdmin) {
      const { data: pl } = await supabase.from('player').select('name, access_code')
      setCodes(((pl as any[]) || []).filter(p => p.access_code)
        .map(p => ({ name: p.name, code: p.access_code })))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id: string, approve: boolean) {
    const { error } = await supabase.rpc('crm_decide_access', { p_request: id, p_approve: approve })
    if (error) { toast(error.message, 'err'); return }
    toast(approve ? 'Accesso approvato' : 'Richiesta rifiutata')
    load()
  }

  if (loading) return <Spinner />

  const pending = rows.filter(r => r.status === 'pending')
  const storico = rows.filter(r => r.status !== 'pending')
  const athleteName = (id: number) => athletes.find(a => a.api_player_id === id)?.name || `Atleta ${id}`

  return (
    <div className="grid" style={{ gap: 18 }}>
      {isPro && <RequestForm onDone={load} mine={rows} />}

      {canDecide && (
        <>
          <div>
            <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
              <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
                <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
                <span style={{ ...kicker, color: 'var(--text)' }}>Richieste in attesa</span>
              </div>
              <span className="faint" style={{ fontSize: 12 }}>{pending.length}</span>
            </div>

            {pending.length === 0 ? (
              <div className="card">
                <Empty icon={<Icon name="inbox" size={28} strokeWidth={1.4} />} title="Nessuna richiesta"
                  hint="Quando un professionista inserisce il codice di un atleta, la richiesta compare qui." />
              </div>
            ) : (
              <div className="grid" style={{ gap: 10 }}>
                {pending.map(r => (
                  <div key={r.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ height: 3, background: ACCENT }} />
                    <div style={{ padding: 16 }}>
                      <div style={{ ...kicker, fontSize: 9.5, color: ACCENT }}>
                        {ROLE_LABEL[r.requester_role] || r.requester_role}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3 }}>
                        {r.requester_name || 'Professionista'}
                      </div>
                      {r.requester_email && (
                        <div className="faint" style={{ fontSize: 11.5 }}>{r.requester_email}</div>
                      )}
                      <div className="faint" style={{ fontSize: 13, marginTop: 3 }}>
                        chiede di accedere all'area di <b style={{ color: 'var(--text)' }}>{athleteName(r.player_id)}</b>
                      </div>
                      {r.message && (
                        <div className="faint" style={{ fontSize: 12.5, marginTop: 8, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10 }}>
                          {r.message}
                        </div>
                      )}
                      <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>{fmtDateTime(r.created_at)}</div>

                      <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" style={{ background: '#3fb984', color: '#111', fontWeight: 800, border: 'none' }}
                          onClick={() => decide(r.id, true)}>
                          <Icon name="check" size={13} /> Autorizza
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => decide(r.id, false)}>Rifiuta</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* codici da consegnare */}
          {codes.length > 0 && (
            <div className="card">
              <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>Codici atleta</div>
              <div className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>
                Consegna il codice al professionista: gli serve per chiedere il collegamento.
                Senza codice non può nemmeno sapere quali atleti esistono.
              </div>
              <div className="grid" style={{ gap: 8 }}>
                {codes.map(c => (
                  <div key={c.code} className="flex between" style={{ alignItems: 'center', gap: 10,
                         border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
                    <span className="flex gap" style={{ alignItems: 'center', gap: 8 }}>
                      <code style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1.5, color: ACCENT }}>{c.code}</code>
                      <button className="btn btn-ghost btn-sm" title="Copia"
                        onClick={() => { navigator.clipboard.writeText(c.code); toast('Codice copiato') }}>
                        <Icon name="copy" size={13} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {storico.length > 0 && (
        <div className="card">
          <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 10 }}>Storico</div>
          <div className="grid" style={{ gap: 7 }}>
            {storico.map(r => (
              <div key={r.id} className="flex between" style={{ alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span>
                  {r.requester_name || ROLE_LABEL[r.requester_role]} · {athleteName(r.player_id)}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 800,
                               color: r.status === 'approvata' ? '#3fb984' : '#e5484d' }}>
                  {r.status === 'approvata' ? 'APPROVATA' : 'RIFIUTATA'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Form per il professionista: inserisce il codice ricevuto dall'atleta o dall'agenzia.
function RequestForm({ onDone, mine }: { onDone: () => void; mine: Req[] }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const inAttesa = mine.filter(r => r.status === 'pending')

  async function send() {
    if (!code.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('crm_request_access', {
      p_code: code.trim(), p_message: msg.trim() || null,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    const res = data as any
    if (!res?.ok) { toast(res?.error || 'Codice non valido', 'err'); return }
    toast(`Richiesta inviata per ${res.player}`)
    setCode(''); setMsg(''); onDone()
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                  background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
      <div style={{ ...kicker, color: ACCENT }}>Collegati a un atleta</div>
      <div className="faint" style={{ fontSize: 12.5, marginTop: 5, marginBottom: 14 }}>
        Inserisci il codice che ti ha dato l'atleta o AUVI. La richiesta viene approvata
        prima di darti accesso.
      </div>

      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Codice atleta">
          <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ES. ABC-123XYZ" style={{ letterSpacing: 2, fontWeight: 700 }} />
        </Field>
        <Field label="Messaggio (facoltativo)">
          <Textarea rows={1} value={msg} onChange={e => setMsg(e.target.value)}
            placeholder="Chi sei e perché richiedi l'accesso" />
        </Field>
      </div>
      <button className="btn btn-primary" disabled={busy || !code.trim()} onClick={send} style={{ marginTop: 4 }}>
        {busy ? 'Invio…' : 'Invia richiesta'}
      </button>

      {inAttesa.length > 0 && (
        <div className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>
          <Icon name="clock" size={12} /> Hai {inAttesa.length} richiest{inAttesa.length === 1 ? 'a' : 'e'} in attesa di approvazione.
        </div>
      )}
    </div>
  )
}
