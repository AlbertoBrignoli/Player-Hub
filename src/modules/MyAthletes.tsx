import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { goto } from '../lib/route'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Modal, Field, Input, Empty, Spinner, Badge } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime } from '../lib/format'
import { RequestForm, ROLE_LABEL } from './AccessRequests'

// "I miei atleti": l'hub del professionista per tutti i collegamenti con gli atleti.
// - invita un atleta (codice AUVI-XXXXXX che l'atleta inserisce in Collegamenti)
// - oppure inserisce il codice ricevuto dall'atleta (crm_request_access)
// - elenco atleti collegati, inviti e storico.

const APP_URL = 'https://player-hub-chi.vercel.app'

// area principale per figura professionale
export const PRO_HOME: Record<string, string> = {
  agente: 'dashboard',
  assicuratore: 'insurance',
  commercialista: 'legaltax',
  preparatore: 'fitness',
  fisioterapista: 'physio-office',
}

type Ath = {
  api_player_id: number
  name: string | null
  photo_url?: string | null
  team_name?: string | null
  position?: string | null
}
type Invite = {
  id: string; code: string; label: string | null
  status: 'active' | 'used' | 'revoked'
  created_at: string; used_at: string | null; player_name: string | null
}
type Req = {
  id: string; player_id: number; status: string; created_at: string
  requester_id: string; requester_role: string
}

export function inviteText(code: string) {
  return `Ciao, ti invito a collegarmi al tuo Player Hub AUVI: apri l'app, vai in Collegamenti e inserisci il codice ${code}. ${APP_URL}`
}

export async function shareInvite(code: string) {
  const text = inviteText(code)
  if (navigator.share) {
    try { await navigator.share({ text }); return } catch { /* annullato */ return }
  }
  await copyText(text, 'Invito copiato')
}
export function whatsappInvite(code: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(inviteText(code))}`, '_blank', 'noopener')
}
async function copyText(text: string, msg = 'Copiato') {
  try { await navigator.clipboard.writeText(text); toast(msg) }
  catch { toast('Copia non riuscita', 'err') }
}

function initials(n: string | null | undefined) {
  return (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

const STYLE = `
.ma-head { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap;
  background: var(--surface); border:1px solid var(--border); border-radius: var(--radius); padding:18px 20px; }
.ma-count { font-size:34px; font-weight:900; line-height:1; letter-spacing:-.02em; color: var(--text); }
.ma-kicker { font-size:11px; letter-spacing:1.6px; text-transform:uppercase; font-weight:800; color: var(--text-dim); }
.ma-actions { display:flex; gap:8px; flex-wrap:wrap; }
.ma-roster { display:grid; gap:10px; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); }
.ma-card { display:flex; align-items:center; gap:12px; background: var(--surface); border:1px solid var(--border);
  border-radius: var(--radius-sm); padding:12px 14px; }
.ma-av { width:44px; height:44px; border-radius:50%; flex-shrink:0; object-fit:cover; background: var(--bg-2); }
.ma-ini { width:44px; height:44px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  background: var(--yellow); color: var(--ink); font-weight:900; font-size:15px; }
.ma-name { font-weight:800; font-size:15px; color: var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ma-sub { font-size:12px; color: var(--text-faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ma-card-btns { display:flex; gap:6px; margin-left:auto; flex-shrink:0; }
.ma-row { display:flex; align-items:center; justify-content:space-between; gap:10px; border:1px solid var(--border);
  border-radius: var(--radius-xs); padding:10px 12px; background: var(--surface); }
.ma-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight:800; letter-spacing:1.5px; font-size:14px; color: var(--text); }
.ma-bigcode { text-align:center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:30px; font-weight:900;
  letter-spacing:3px; color: var(--ink); background: var(--yellow-soft); border-radius: var(--radius-sm); padding:20px 10px; margin:6px 0 14px; }
.ma-share { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; }
.ma-section { display:grid; gap:10px; }
@media (max-width: 520px) {
  .ma-card-btns .ma-lbl { display:none; }
}
`

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="ma-section">
      <div className="flex between" style={{ alignItems: 'center' }}>
        <span className="ma-kicker">{title}</span>
        {count != null && <span className="faint" style={{ fontSize: 12 }}>{count}</span>}
      </div>
      {children}
    </div>
  )
}

export function MyAthletes() {
  const { role, session } = useAuth()
  const { athletes, setAthleteId } = useAthlete()
  const uid: string | undefined = session?.user?.id
  const [roster, setRoster] = useState<Ath[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)

  async function load() {
    const [pl, inv, rq] = await Promise.all([
      // RLS: il professionista vede solo gli atleti collegati
      supabase.from('player').select('api_player_id, name, photo_url, team_name, position')
        .not('api_player_id', 'is', null).order('name'),
      supabase.rpc('crm_pro_list_invites'),
      uid
        ? supabase.from('crm_access_requests').select('id, player_id, status, created_at, requester_id, requester_role')
            .eq('requester_id', uid).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as Req[] }),
    ])
    setRoster((pl.data as Ath[]) || (athletes as Ath[]))
    setInvites((inv.data as Invite[]) || [])
    setReqs(((rq as any).data as Req[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [uid, athletes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const home = PRO_HOME[role || ''] || 'dashboard'
  function openArea(id: number) { setAthleteId(id); goto(home) }
  function openChat(id: number) { setAthleteId(id); goto('messages') }

  if (loading) return <Spinner />

  const nameOf = (id: number) =>
    roster.find(a => a.api_player_id === id)?.name || athletes.find(a => a.api_player_id === id)?.name || `Atleta ${id}`

  const ctas = (
    <div className="ma-actions">
      <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
        <Icon name="plus" size={15} /> Invita un atleta
      </button>
      <button className="btn" onClick={() => setCodeOpen(true)}>
        <Icon name="key" size={14} /> Ho un codice dall'atleta
      </button>
    </div>
  )

  return (
    <div className="grid" style={{ gap: 20 }}>
      <style>{STYLE}</style>

      <div className="ma-head">
        <div>
          <div className="ma-kicker">I miei atleti</div>
          <div className="flex" style={{ alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span className="ma-count">{roster.length}</span>
            <span className="faint" style={{ fontSize: 13 }}>{roster.length === 1 ? 'atleta collegato' : 'atleti collegati'}</span>
          </div>
        </div>
        {ctas}
      </div>

      {roster.length === 0 ? (
        <div className="card">
          <Empty icon={<Icon name="users" size={28} strokeWidth={1.4} />} title="Nessun atleta collegato"
            hint="Invita un atleta: gli mandi un codice e lui lo inserisce nel suo Player Hub. Se invece è l'atleta ad averti dato un codice, inseriscilo tu." />
          <div className="flex" style={{ justifyContent: 'center', paddingBottom: 18 }}>{ctas}</div>
        </div>
      ) : (
        <Section title="Atleti" count={roster.length}>
          <div className="ma-roster">
            {roster.map(a => (
              <div key={a.api_player_id} className="ma-card">
                {a.photo_url
                  ? <img className="ma-av" src={a.photo_url} alt="" />
                  : <div className="ma-ini">{initials(a.name)}</div>}
                <div style={{ minWidth: 0 }}>
                  <div className="ma-name">{a.name || `Atleta ${a.api_player_id}`}</div>
                  <div className="ma-sub">{[a.team_name, a.position].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <div className="ma-card-btns">
                  <button className="btn btn-ghost btn-sm" title="Chat" onClick={() => openChat(a.api_player_id)}>
                    <Icon name="message" size={14} /> <span className="ma-lbl">Chat</span>
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => openArea(a.api_player_id)}>
                    Apri area <Icon name="chevron-right" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="I miei inviti" count={invites.length}>
        {invites.length === 0 ? (
          <div className="faint" style={{ fontSize: 12.5 }}>Nessun invito ancora creato.</div>
        ) : (
          <div className="grid" style={{ gap: 8 }}>
            {invites.map(i => {
              const active = i.status === 'active'
              return (
                <div key={i.id} className="ma-row" style={{ opacity: i.status === 'revoked' ? .55 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="flex" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="ma-code" style={{ textDecoration: i.status === 'revoked' ? 'line-through' : 'none' }}>{i.code}</span>
                      {active ? <Badge tone="green">Attivo</Badge>
                        : i.status === 'used' ? <Badge>{i.player_name ? `Usato da ${i.player_name}` : 'Usato'}</Badge>
                        : <Badge tone="red">Revocato</Badge>}
                    </div>
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {i.label ? i.label + ' · ' : ''}{fmtDateTime(i.created_at)}
                    </div>
                  </div>
                  {active && (
                    <div className="flex" style={{ gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" title="Copia codice" onClick={() => copyText(i.code, 'Codice copiato')}>
                        <Icon name="copy" size={13} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Condividi" onClick={() => shareInvite(i.code)}>
                        <Icon name="send" size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {reqs.length > 0 && (
        <Section title="Storico collegamenti" count={reqs.length}>
          <div className="grid" style={{ gap: 8 }}>
            {reqs.map(r => (
              <div key={r.id} className="ma-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{nameOf(r.player_id)}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {ROLE_LABEL[r.requester_role] || r.requester_role} · {fmtDateTime(r.created_at)}
                  </div>
                </div>
                {r.status === 'approvata' ? <Badge tone="green">Collegato</Badge>
                  : r.status === 'pending' ? <Badge tone="gold">In attesa</Badge>
                  : r.status === 'rifiutata' ? <Badge tone="red">Rifiutata</Badge>
                  : <Badge>{r.status}</Badge>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {inviteOpen && <InviteSheet onClose={() => { setInviteOpen(false); load() }} />}
      {codeOpen && (
        <Modal title="Ho un codice dall'atleta" onClose={() => setCodeOpen(false)}>
          <RequestForm bare mine={reqs} onDone={() => { setCodeOpen(false); load() }} />
        </Modal>
      )}
    </div>
  )
}

// Foglio "Invita un atleta": crea il codice e lo mostra grande con le azioni di condivisione.
function InviteSheet({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    if (busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('crm_pro_create_invite', { p_label: label.trim() || null })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    const res = data as any
    if (!res?.ok || !res.code) { toast(res?.error || 'Invito non creato', 'err'); return }
    setCode(res.code)
  }

  return (
    <Modal title="Invita un atleta" onClose={onClose}
      footer={code ? <button className="btn" onClick={onClose}>Fatto</button> : undefined}>
      {!code ? (
        <>
          <div className="faint" style={{ fontSize: 13, marginBottom: 12 }}>
            Crei un codice personale da mandare all'atleta. Quando lo inserisce nel suo Player Hub
            (Collegamenti) sei collegato: è la sua conferma.
          </div>
          <Field label="Per chi? (facoltativo)">
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="es. Mario Rossi"
              onKeyDown={e => { if (e.key === 'Enter') create() }} />
          </Field>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={create}>
            {busy ? 'Creazione…' : 'Crea codice invito'}
          </button>
        </>
      ) : (
        <>
          <div className="faint" style={{ fontSize: 13 }}>
            Manda questo codice all'atleta{label.trim() ? <> (<b style={{ color: 'var(--text)' }}>{label.trim()}</b>)</> : null}.
          </div>
          <div className="ma-bigcode">{code}</div>
          <div className="ma-share">
            <button className="btn btn-primary" onClick={() => shareInvite(code)}>
              <Icon name="send" size={14} /> Condividi
            </button>
            <button className="btn" onClick={() => whatsappInvite(code)}>
              <Icon name="message" size={14} /> WhatsApp
            </button>
            <button className="btn" onClick={() => copyText(code, 'Codice copiato')}>
              <Icon name="copy" size={14} /> Copia
            </button>
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 12 }}>
            Il codice è monouso: lo trovi anche in "I miei inviti".
          </div>
        </>
      )}
    </Modal>
  )
}

export default MyAthletes
