// Area di lavoro del partner dei Servizi AUVI (es. Scouting Department).
// Il partner vede SOLO le richieste dei propri servizi (RLS crm_is_request_partner) e i dati
// di gioco degli atleti che le hanno inviate (crm_partner_sees). Da qui: prende in carico,
// scrive all'atleta, carica report/file, chiude la richiesta.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useRouteParam, goto } from '../lib/route'
import { Spinner, Empty, Badge, Textarea, Input, Field, Select } from '../components/ui'
import Icon from '../components/Icon'
import RequestThread from '../components/RequestThread'
import { ApiSeason, ApiMatchList, type ApiSeasonRow } from '../components/apistats'
import { fmtDate, fmtDateTime, seasonOf } from '../lib/format'

type Req = {
  id: string; player_id: number; player_name: string | null; service_id: string | null
  service_title: string | null; message: string | null; status: string; internal_note: string | null
  answers: Record<string, any> | null; created_at: string; updated_at: string | null
}
type Svc = { id: string; title: string; partner_name: string | null; logo_url: string | null; accent_color: string | null; form_schema: any[] | null }
type Athlete = { api_player_id: number; name: string | null; photo_url: string | null; position: string | null; team_name: string | null; age: number | null; nationality: string | null }

const STATUS: Record<string, { l: string; tone: 'gold' | 'blue' | 'green' | 'red' }> = {
  aperta: { l: 'Nuova', tone: 'gold' },
  in_carico: { l: 'In lavorazione', tone: 'blue' },
  completata: { l: 'Completata', tone: 'green' },
  annullata: { l: 'Annullata', tone: 'red' },
}

export default function PartnerHome() {
  const [reqs, setReqs] = useState<Req[]>([])
  const [svcs, setSvcs] = useState<Svc[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'attive' | 'completate' | 'tutte'>('attive')
  const openId = useRouteParam('req')

  async function load() {
    const { data: r } = await supabase.from('crm_service_requests').select('*').order('created_at', { ascending: false })
    const list = (r as Req[]) || []
    setReqs(list)
    const sids = [...new Set(list.map(x => x.service_id).filter(Boolean))] as string[]
    const pids = [...new Set(list.map(x => x.player_id))]
    const [s, p] = await Promise.all([
      sids.length ? supabase.from('crm_services_public').select('id, title, partner_name, logo_url, accent_color, form_schema').in('id', sids) : Promise.resolve({ data: [] }),
      pids.length ? supabase.from('player').select('api_player_id, name, photo_url, position, team_name, age, nationality').in('api_player_id', pids) : Promise.resolve({ data: [] }),
    ])
    setSvcs((s.data as Svc[]) || [])
    setAthletes((p.data as Athlete[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const open = reqs.find(r => r.id === openId) || null
  const partnerName = svcs[0]?.partner_name || 'Area partner'
  const logo = svcs[0]?.logo_url

  if (loading) return <Spinner />
  if (open) {
    return <RequestDetail req={open} svc={svcs.find(s => s.id === open.service_id) || null}
      athlete={athletes.find(a => a.api_player_id === open.player_id) || null}
      onBack={() => goto('partner-home')} onChanged={load} />
  }

  const nNew = reqs.filter(r => r.status === 'aperta').length
  const nWork = reqs.filter(r => r.status === 'in_carico').length
  const nDone = reqs.filter(r => r.status === 'completata').length
  const shown = reqs.filter(r => filter === 'tutte' ? true
    : filter === 'completate' ? r.status === 'completata' : (r.status === 'aperta' || r.status === 'in_carico'))

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="partner-hero">
        {logo && <img src={logo} alt={partnerName} />}
        <div>
          <div className="partner-hero-k">Area partner · AUVI</div>
          <div className="partner-hero-t">{partnerName}</div>
          <div className="partner-hero-s">Le richieste degli atleti AUVI per i tuoi servizi: prendile in carico, invia report e file, chiudile.</div>
        </div>
      </div>

      <div className="kv-grid kv-grid-hero">
        <div className="kv"><div className="kv-k">Nuove</div><div className="kv-v" style={{ color: nNew ? 'var(--gold)' : undefined }}>{nNew}</div><div className="kv-sub">da prendere in carico</div></div>
        <div className="kv"><div className="kv-k">In lavorazione</div><div className="kv-v">{nWork}</div></div>
        <div className="kv"><div className="kv-k">Completate</div><div className="kv-v">{nDone}</div></div>
        <div className="kv"><div className="kv-k">Atleti seguiti</div><div className="kv-v">{athletes.length}</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Richieste</div>
          <div className="flex gap" style={{ gap: 6 }}>
            {(['attive', 'completate', 'tutte'] as const).map(k => (
              <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : ''}`} onClick={() => setFilter(k)}>
                {k === 'attive' ? 'Attive' : k === 'completate' ? 'Completate' : 'Tutte'}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <Empty icon={<Icon name="inbox" size={26} strokeWidth={1.5} />}
            title={reqs.length ? 'Niente in questa vista' : 'Ancora nessuna richiesta'}
            hint={reqs.length ? undefined : 'Quando un atleta AUVI compila il questionario del tuo servizio, la richiesta arriva qui e ricevi una notifica.'} />
        ) : (
          <div className="list">
            {shown.map(r => {
              const a = athletes.find(x => x.api_player_id === r.player_id)
              const st = STATUS[r.status] || STATUS.aperta
              const what = Array.isArray(r.answers?.servizio) ? r.answers!.servizio.join(', ') : r.service_title
              return (
                <button key={r.id} className="row" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => goto(`partner-home?req=${r.id}`)}>
                  {a?.photo_url ? <img src={a.photo_url} alt="" className="partner-ava" /> : <span className="partner-ava" />}
                  <div className="row-main">
                    <div className="row-title">{r.player_name || a?.name || 'Atleta'}</div>
                    <div className="row-sub">{what}</div>
                    <div className="row-sub">{[a?.team_name, a?.position].filter(Boolean).join(' · ')} · inviata {fmtDate(r.created_at)}</div>
                  </div>
                  <Badge tone={st.tone}>{st.l}</Badge>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function RequestDetail({ req, svc, athlete, onBack, onChanged }: {
  req: Req; svc: Svc | null; athlete: Athlete | null; onBack: () => void; onChanged: () => void
}) {
  const [note, setNote] = useState(req.internal_note || '')
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<ApiSeasonRow[]>([])
  const [matches, setMatches] = useState<any[]>([])
  const st = STATUS[req.status] || STATUS.aperta
  const curSeason = seasonOf(new Date())

  useEffect(() => {
    (async () => {
      const [s, m] = await Promise.all([
        supabase.from('player_stats_api').select('*').eq('player_id', req.player_id).eq('season', Number(curSeason.slice(0, 4))),
        supabase.from('matches').select('*').eq('player_id', req.player_id).eq('status', 'FT')
          .lte('match_date', new Date().toISOString()).order('match_date', { ascending: false }).limit(8),
      ])
      setStats((s.data as ApiSeasonRow[]) || [])
      setMatches((m.data as any[]) || [])
    })()
  }, [req.player_id, curSeason])

  // risposte nell'ordine del questionario
  const rows = useMemo(() => {
    const a = req.answers || {}
    const filled = (v: any) => v != null && v !== '' && (!Array.isArray(v) || v.length > 0)
    const fmt = (v: any) => (Array.isArray(v) ? v.join(', ') : String(v))
    const schema = svc?.form_schema || []
    const out = schema.filter((f: any) => filled(a[f.key])).map((f: any) => ({ k: f.label as string, v: fmt(a[f.key]) }))
    const known = new Set(schema.map((f: any) => f.key))
    for (const [k, v] of Object.entries(a)) if (!known.has(k) && filled(v)) out.push({ k, v: fmt(v) })
    return out
  }, [req.answers, svc])

  async function setStatus(status: string) {
    setBusy(true)
    const { error } = await supabase.from('crm_service_requests').update({
      status, internal_note: note || null, updated_at: new Date().toISOString(),
      closed_at: status === 'completata' ? new Date().toISOString() : null,
    }).eq('id', req.id)
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(status === 'completata' ? 'Richiesta completata: l\'atleta riceve la notifica' : 'Presa in carico: l\'atleta riceve la notifica')
    onChanged()
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <button onClick={onBack} className="flex gap" style={{ alignItems: 'center', gap: 8, alignSelf: 'start', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
        ← Tutte le richieste
      </button>

      <div className="card">
        <div className="flex gap" style={{ gap: 14, alignItems: 'center' }}>
          {athlete?.photo_url ? <img src={athlete.photo_url} alt="" className="partner-ava lg" /> : <span className="partner-ava lg" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{req.player_name || athlete?.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>{[athlete?.position, athlete?.team_name, athlete?.age ? `${athlete.age} anni` : null].filter(Boolean).join(' · ')}</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{req.service_title} · inviata {fmtDate(req.created_at)}</div>
          </div>
          <Badge tone={st.tone}>{st.l}</Badge>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="kv-title">Messaggio di stato per l'atleta</div>
          <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Es. Iniziamo dalle ultime 3 partite, report entro venerdì" />
          <div className="flex gap wrap" style={{ gap: 8, marginTop: 10 }}>
            {req.status === 'aperta' && (
              <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('in_carico')}>Prendi in carico</button>
            )}
            {req.status === 'in_carico' && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('completata')}>Segna completata</button>
                <button className="btn" disabled={busy} onClick={() => setStatus('in_carico')}>Aggiorna messaggio</button>
              </>
            )}
            {req.status === 'completata' && (
              <button className="btn" disabled={busy} onClick={() => setStatus('in_carico')}>Riapri</button>
            )}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Cosa chiede l'atleta</div></div>
          <div className="grid" style={{ gap: 10 }}>
            {rows.map(r => (
              <div key={r.k}>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{r.k}</div>
                <div style={{ fontSize: 14, marginTop: 1 }}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CalendarActions req={req} />

      <div className="card">
        <div className="card-head">
          <div className="card-title">Lavoro con l'atleta</div>
          <div className="card-hint">messaggi e file · li vedono atleta e AUVI</div>
        </div>
        <RequestThread requestId={req.id} placeholder="Scrivi all'atleta o allega il report…" />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Stagione {curSeason}</div>
          <div className="card-hint">dati API-Football</div>
        </div>
        {stats.length ? <ApiSeason rows={stats} matches={matches} role={athlete?.position} />
          : <div className="faint" style={{ fontSize: 13 }}>Statistiche di stagione non ancora disponibili.</div>}
      </div>

      {matches.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Ultime partite</div><div className="card-hint">per scegliere cosa analizzare</div></div>
          <ApiMatchList matches={matches} />
        </div>
      )}
    </div>
  )
}

// Documenti fino a questa dimensione si caricano nell'app; oltre, link scaricabile.
const MAX_UPLOAD_MB = 45
const BUCKET = 'service-files'

type Ev = { id: string; type: string; title: string; start_at: string; request_status: string | null; change_note: string | null; link_url: string | null; attachments: any[] | null }

// Tutto passa dal calendario dell'atleta: la call da confermare con un tocco, il report che si apre
// dall'impegno. Il partner non tocca il calendario: usa due funzioni controllate (RPC).
function CalendarActions({ req }: { req: Req }) {
  const [evs, setEvs] = useState<Ev[]>([])
  const [mode, setMode] = useState<'call' | 'report' | null>(null)
  const [busy, setBusy] = useState(false)
  // call
  const [when, setWhen] = useState('')
  const [mins, setMins] = useState('45')
  const [meet, setMeet] = useState('')
  const [cnote, setCnote] = useState('')
  // report
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [rnote, setRnote] = useState('')

  async function load() {
    const { data } = await supabase.from('crm_events')
      .select('id, type, title, start_at, request_status, change_note, link_url, attachments')
      .eq('service_request_id', req.id).order('start_at', { ascending: false })
    setEvs((data as Ev[]) || [])
  }
  useEffect(() => { load() }, [req.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function proposeCall() {
    if (!when) { toast('Scegli giorno e ora della call', 'err'); return }
    setBusy(true)
    const { error } = await supabase.rpc('crm_partner_propose_call', {
      p_req: req.id, p_start: new Date(when).toISOString(), p_minutes: Number(mins), p_link: meet || null, p_note: cnote || null,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast("Call proposta: l'atleta la trova nel calendario da confermare")
    setMode(null); setWhen(''); setMeet(''); setCnote(''); load()
  }

  async function deliver() {
    if (!file && !link.trim()) { toast('Carica il report o incolla un link scaricabile', 'err'); return }
    if (file && file.size > MAX_UPLOAD_MB * 1048576) {
      toast(`File oltre ${MAX_UPLOAD_MB} MB: caricalo su WeTransfer/Drive e incolla il link`, 'err'); return
    }
    setBusy(true)
    let path: string | null = null
    if (file) {
      path = `${req.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { setBusy(false); toast(up.error.message, 'err'); return }
    }
    const { error } = await supabase.rpc('crm_partner_deliver', {
      p_req: req.id, p_title: title || 'Report', p_file_path: path, p_file_name: file?.name || null,
      p_file_size: file?.size || null, p_link: link || null, p_note: rnote || null,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast("Consegnato: l'atleta lo apre dal suo calendario")
    setMode(null); setTitle(''); setFile(null); setLink(''); setRnote(''); load()
  }

  async function withdraw(ev: Ev) {
    const { error } = await supabase.from('crm_events').delete().eq('id', ev.id)
    if (error) { toast(error.message, 'err'); return }
    toast('Proposta ritirata'); load()
  }

  const ST: Record<string, { l: string; tone: 'gold' | 'green' | 'red' | 'blue' }> = {
    da_confermare: { l: 'Da confermare', tone: 'gold' }, confermata: { l: 'Confermata', tone: 'green' },
    rifiutata: { l: 'Non accettata', tone: 'red' }, modifica_richiesta: { l: 'Chiede modifica', tone: 'blue' },
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Nel calendario dell'atleta</div>
        <div className="card-hint">l'atleta riceve la notifica e apre tutto dal calendario</div>
      </div>
      <div className="flex gap wrap" style={{ gap: 8 }}>
        <button className={`btn ${mode === 'call' ? 'btn-primary' : ''}`} onClick={() => setMode(mode === 'call' ? null : 'call')}>
          <Icon name="calendar" size={14} /> Proponi una call
        </button>
        <button className={`btn ${mode === 'report' ? 'btn-primary' : ''}`} onClick={() => setMode(mode === 'report' ? null : 'report')}>
          <Icon name="file" size={14} /> Consegna report
        </button>
      </div>

      {mode === 'call' && (
        <div className="grid" style={{ gap: 10, marginTop: 14 }}>
          <div className="row2">
            <Field label="Giorno e ora"><Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></Field>
            <Field label="Durata">
              <Select value={mins} onChange={e => setMins(e.target.value)}>
                {['20', '30', '45', '60', '90'].map(m => <option key={m} value={m}>{m} minuti</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Link della call (Meet, Zoom, Teams)"><Input value={meet} placeholder="https://meet.google.com/…" onChange={e => setMeet(e.target.value)} /></Field>
          <Field label="Di cosa parliamo (facoltativo)"><Input value={cnote} placeholder="Es. analisi OFI – Asteras" onChange={e => setCnote(e.target.value)} /></Field>
          <button className="btn btn-primary" disabled={busy} onClick={proposeCall} style={{ justifySelf: 'start' }}>
            {busy ? 'Invio…' : "Proponi all'atleta"}
          </button>
        </div>
      )}

      {mode === 'report' && (
        <div className="grid" style={{ gap: 10, marginTop: 14 }}>
          <Field label="Titolo"><Input value={title} placeholder="Es. Report post-partita · OFI – Asteras" onChange={e => setTitle(e.target.value)} /></Field>
          <Field label={`Documento (PDF, fino a ${MAX_UPLOAD_MB} MB: si apre nell'app)`}>
            <input type="file" className="input" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </Field>
          <Field label="Video o file pesanti: link scaricabile (WeTransfer, Drive, Dropbox)">
            <Input value={link} placeholder="https://…" onChange={e => setLink(e.target.value)} />
          </Field>
          <Field label="Nota per l'atleta (facoltativo)"><Textarea rows={2} value={rnote} onChange={e => setRnote(e.target.value)} /></Field>
          <button className="btn btn-primary" disabled={busy} onClick={deliver} style={{ justifySelf: 'start' }}>
            {busy ? 'Caricamento…' : 'Consegna nel calendario'}
          </button>
        </div>
      )}

      {evs.length > 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {evs.map(ev => {
            const st = ev.request_status ? ST[ev.request_status] : null
            return (
              <div key={ev.id} className="row" style={{ padding: '10px 2px', alignItems: 'flex-start' }}>
                <Icon name={ev.type === 'call' ? 'calendar' : 'file'} size={16} />
                <div className="row-main">
                  <div className="row-title">{ev.title}</div>
                  <div className="row-sub">{ev.type === 'call' ? fmtDateTime(ev.start_at) : `consegnato ${fmtDate(ev.start_at)}`}
                    {ev.attachments?.length ? ' · documento' : ''}{ev.link_url ? ' · link' : ''}</div>
                  {ev.request_status === 'modifica_richiesta' && ev.change_note && <div className="row-sub" style={{ color: 'var(--magenta)' }}>«{ev.change_note}»</div>}
                </div>
                {st && <Badge tone={st.tone}>{st.l}</Badge>}
                {ev.type === 'call' && ev.request_status !== 'confermata' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => withdraw(ev)}>Ritira</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
