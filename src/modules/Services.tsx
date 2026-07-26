import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Modal, Field, Textarea, Select, Empty, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'
import ServiceDetail from '../components/ServiceDetail'
import type { Service } from '../components/ServiceDetail'

// Store dei servizi AUVI (redesign UX handoff): l'atleta sfoglia i servizi
// come in un marketplace, apre la scheda del partner, compila il questionario
// e segue lo stato delle richieste. La richiesta passa sempre da AUVI.

// asset in public/servizi (spediti col deploy)
const STUDIO_BG = '/servizi/auvi-hero.jpg'
const STUDIO_VIDEO = '/servizi/auvi-video.mp4'
const AUVI_MARK = '/servizi/auvi-mark-white.png'
const STUDIO_CAT = 'AUVI Studio'

// --- token del design (store scuro) ---
const T = {
  card: '#141419',
  cardDark: '#101015',
  border: '#26262e',
  borderSoft: '#1e1e26',
  text: '#f2f2f5',
  dim: '#9a9aa6',
  muted: '#6e6e7a',
  yellow: '#FFD400',
  green: '#4ade80',
}

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 800,
}

const STATUS: Record<string, { l: string; c: string; step: number }> = {
  aperta: { l: 'Inviata', c: '#FBBF24', step: 1 },
  in_carico: { l: 'In lavorazione', c: '#7DD3FC', step: 2 },
  completata: { l: 'Completata', c: '#4ADE80', step: 3 },
  annullata: { l: 'Annullata', c: '#e5484d', step: 3 },
}
const st = (s: string) => STATUS[s] || STATUS.aperta

type Req = {
  id: string
  player_id: number
  player_name: string | null
  service_id: string | null
  service_title: string | null
  message: string | null
  preferred_date: string | null
  status: string
  internal_note: string | null
  created_at: string
}

const isStudio = (s: Service) => s.category === STUDIO_CAT

function initials(s: string) {
  return s.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
}

export default function Services() {
  const { role, isAdmin } = useAuth()
  const { athleteId, athletes } = useAthlete()
  const [services, setServices] = useState<Service[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Service | null>(null)
  const [manage, setManage] = useState<Req | null>(null)
  const [tab, setTab] = useState<'store' | 'requests'>('store')
  const [cat, setCat] = useState<string>('Tutti')

  const isPlayer = role === 'player'

  async function load() {
    const [sv, rq] = await Promise.all([
      supabase.from('crm_services_public').select('*').order('sort'),
      supabase.from('crm_service_requests').select('*').order('created_at', { ascending: false }),
    ])
    setServices((sv.data as Service[]) || [])
    setReqs((rq.data as Req[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const studio = useMemo(() => services.filter(isStudio), [services])
  const verificati = useMemo(() => services.filter(s => s.verified && !isStudio(s)), [services])
  const altri = useMemo(() => services.filter(s => !s.verified && !isStudio(s)), [services])
  const cats = useMemo(() => {
    const seen: string[] = []
    for (const s of services) if (!isStudio(s) && !seen.includes(s.category)) seen.push(s.category)
    return ['Tutti', ...seen]
  }, [services])

  const inCat = (s: Service) => cat === 'Tutti' || s.category === cat
  const attive = reqs.filter(r => r.status === 'aperta' || r.status === 'in_carico')

  const athleteName = (r: Req) =>
    r.player_name || athletes.find(a => a.api_player_id === r.player_id)?.name || 'Atleta'
  const activeAthlete = athletes.find(a => a.api_player_id === athleteId)
  const firstName = (activeAthlete?.name || '').trim().split(/\s+/)[0] || 'Atleta'

  if (loading) return <Spinner />

  if (open) {
    return (
      <ServiceDetail service={open} playerId={athleteId} canRequest={!!athleteId}
        onBack={() => setOpen(null)} onSent={() => { setOpen(null); setTab('store'); load() }} />
    )
  }

  return (
    <div className="grid" style={{ gap: 18, color: T.text }}>
      <style>{keyframes}</style>

      {/* --- header --- */}
      <div>
        <div style={{ ...kicker, color: T.muted, fontSize: 10, letterSpacing: 2.5 }}>Servizi AUVI</div>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.6, marginTop: 4 }}>
          {isPlayer ? `Ciao, ${firstName}` : 'Servizi e richieste'}
        </div>
        <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4, maxWidth: 620 }}>
          {isPlayer
            ? 'Scopri i servizi, apri la scheda del partner e mandaci la richiesta: pensiamo noi a seguirti fino alla fine.'
            : 'Catalogo dei servizi proposti agli atleti e richieste da gestire.'}
        </div>
      </div>

      {/* --- segmento Store / Richieste --- */}
      <div className="flex gap" style={{ gap: 8 }}>
        {(['store', 'requests'] as const).map(k => {
          const on = tab === k
          return (
            <button key={k} onClick={() => setTab(k)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${on ? T.text : T.border}`,
                background: on ? T.text : 'transparent',
                color: on ? '#0b0b0e' : T.dim, fontWeight: 800, fontSize: 13,
              }}>
              {k === 'store' ? 'Store' : `Richieste${reqs.length ? ` · ${reqs.length}` : ''}`}
            </button>
          )
        })}
      </div>

      {tab === 'requests' ? (
        <RequestsView reqs={reqs} isPlayer={isPlayer} isAdmin={isAdmin}
          athleteName={athleteName} onManage={setManage} onEmptyGoStore={() => setTab('store')} />
      ) : (
        <>
          {/* --- banner richieste in corso --- */}
          {attive.length > 0 && (
            <button onClick={() => setTab('requests')}
              style={{
                textAlign: 'left', cursor: 'pointer', width: '100%',
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14,
              }}
              className="flex between">
              <div className="flex gap" style={{ alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: st(attive[0].status).c,
                  animation: 'auviPulse 2s infinite',
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {attive[0].service_title}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.dim }}>{st(attive[0].status).l}</div>
                </div>
              </div>
              <span style={{ fontSize: 12.5, color: T.dim, whiteSpace: 'nowrap' }}>
                {attive.length} in corso →
              </span>
            </button>
          )}

          {/* --- AUVI Studio --- */}
          {studio.length > 0 && <StudioHero studio={studio} onOpen={setOpen} />}

          {/* --- chip categorie --- */}
          {cats.length > 1 && (
            <div className="flex gap" style={{ gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {cats.map(c => {
                const on = cat === c
                return (
                  <button key={c} onClick={() => setCat(c)}
                    style={{
                      whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                      border: `1px solid ${on ? T.text : T.border}`,
                      background: on ? T.text : 'transparent',
                      color: on ? '#0b0b0e' : T.dim, fontWeight: 700, fontSize: 12.5,
                    }}>
                    {c}
                  </button>
                )
              })}
            </div>
          )}

          {/* --- partner verificati --- */}
          {verificati.filter(inCat).length > 0 && (
            <section>
              <div style={{ ...kicker, fontSize: 12, color: T.text, marginBottom: 12 }}>Partner verificati</div>
              <div className="grid g3" style={{ gap: 12 }}>
                {verificati.filter(inCat).map(s => (
                  <VerifiedCard key={s.id} s={s} onOpen={() => setOpen(s)} />
                ))}
              </div>
            </section>
          )}

          {/* --- su richiesta --- */}
          {altri.filter(inCat).length > 0 && (
            <section>
              <div style={{ ...kicker, fontSize: 12, color: T.text, marginBottom: 12 }}>Su richiesta</div>
              <div className="grid" style={{ gap: 8 }}>
                {altri.filter(inCat).map(s => (
                  <button key={s.id} onClick={() => setOpen(s)}
                    className="flex between"
                    style={{
                      textAlign: 'left', cursor: 'pointer', width: '100%', gap: 12,
                      background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 14, padding: 12,
                    }}>
                    <div className="flex gap" style={{ alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                        background: `oklch(0.3 0.07 ${s.hue ?? 250})`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: `oklch(0.85 0.13 ${s.hue ?? 250})`,
                      }}>
                        <Icon name={s.icon} size={20} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{s.title}</div>
                        {s.description && (
                          <div style={{
                            fontSize: 12, color: T.dim, marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260,
                          }}>{s.description}</div>
                        )}
                      </div>
                    </div>
                    <span style={{ color: T.muted, flexShrink: 0 }}><Icon name="chevron-right" size={18} /></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {services.length === 0 && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
              <Empty icon={<Icon name="star" size={30} strokeWidth={1.4} />} title="Nessun servizio"
                hint="Il catalogo non è ancora stato popolato." />
            </div>
          )}
        </>
      )}

      {manage && (
        <ManageForm req={manage} onClose={() => setManage(null)} onSaved={() => { setManage(null); load() }} />
      )}
    </div>
  )
}

// --- card partner verificato: foto (se c'è) + logo sovrapposto, altrimenti logo centrato ---
function VerifiedCard({ s, onOpen }: { s: Service; onOpen: () => void }) {
  const accent = s.accent_color || `oklch(0.85 0.13 ${s.hue ?? 250})`
  return (
    <button onClick={onOpen}
      style={{
        textAlign: 'left', cursor: 'pointer', width: '100%', padding: 0, overflow: 'hidden',
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 18,
        display: 'flex', flexDirection: 'column',
      }}>
      <div style={{ position: 'relative', height: 170, background: s.cover_url ? T.cardDark : `oklch(0.3 0.07 ${s.hue ?? 250})` }}>
        {s.cover_url ? (
          <>
            <div style={{
              position: 'absolute', inset: 0, backgroundImage: `url(${s.cover_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
            }} />
            <div style={{ position: 'absolute', inset: 0,
              background: `linear-gradient(180deg, rgba(11,11,14,0) 38%, rgba(11,11,14,.86) 100%)` }} />
            {s.logo_url && (
              <img src={s.logo_url} alt={s.partner_name || s.title}
                style={{ position: 'absolute', left: 12, bottom: 12, height: 26, maxWidth: '55%',
                  objectFit: 'contain' }} />
            )}
          </>
        ) : s.logo_url ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 26 }}>
            <img src={s.logo_url} alt={s.partner_name || s.title}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 40, fontWeight: 900, letterSpacing: -1,
            color: `oklch(0.85 0.13 ${s.hue ?? 250})` }}>{initials(s.partner_name || s.title)}</div>
        )}
        <span style={{
          position: 'absolute', left: 10, top: 10, display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(11,11,14,.72)', color: T.green, padding: '4px 9px', borderRadius: 999,
          fontSize: 9.5, letterSpacing: 1.4, fontWeight: 800, textTransform: 'uppercase',
        }}>● Verificato</span>
      </div>
      <div style={{ padding: 16 }}>
        {s.hero_claim && (
          <div style={{ fontSize: 9, letterSpacing: 1.8, fontWeight: 800, textTransform: 'uppercase',
            color: accent }}>{s.hero_claim}</div>
        )}
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, letterSpacing: -0.3 }}>{s.title}</div>
        {s.partner_name && (
          <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>con {s.partner_name}</div>
        )}
      </div>
    </button>
  )
}

// --- hero AUVI Studio (foto atleta + servizi interni) ---
function StudioHero({ studio, onOpen }: { studio: Service[]; onOpen: (s: Service) => void }) {
  const vidRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => { const v = vidRef.current; if (v) { v.muted = true; v.play().catch(() => {}) } }, [])
  return (
    <div style={{ background: T.cardDark, border: '1px solid #3a3420', borderRadius: 20, overflow: 'hidden' }}>
      <div style={{ position: 'relative', padding: '26px 20px', minHeight: 150 }}>
        <video ref={vidRef} poster={STUDIO_BG} muted loop playsInline autoPlay preload="metadata"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}>
          <source src={STUDIO_VIDEO} type="video/mp4" />
        </video>
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, rgba(16,16,21,.35), rgba(16,16,21,.9))' }} />
        <div style={{ position: 'relative' }}>
          <img src={AUVI_MARK} alt="AUVI" style={{ height: 22, opacity: .95 }} />
          <div style={{ ...kicker, fontSize: 10, color: T.yellow, letterSpacing: 2, marginTop: 14 }}>
            Il team creativo della tua agenzia
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.6, marginTop: 6 }}>Own your image.</div>
          <div style={{ fontSize: 12.5, color: '#d5d5de', marginTop: 4 }}>
            Diamo forza all'immagine, valore alle storie.
          </div>
        </div>
      </div>
      <div className="grid" style={{ gap: 1, background: T.border }}>
        {studio.map(s => (
          <button key={s.id} onClick={() => onOpen(s)}
            className="flex between"
            style={{ textAlign: 'left', cursor: 'pointer', width: '100%', gap: 12,
              background: T.cardDark, border: 'none', padding: 14 }}>
            <div className="flex gap" style={{ alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: T.yellow, color: '#0b0b0e',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src="/servizi/auvi-mark-white.png" alt="AUVI"
                  style={{ width: 22, height: 22, objectFit: 'contain', filter: 'brightness(0)' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{s.title}</div>
                {s.description && (
                  <div style={{ fontSize: 12, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', maxWidth: 260 }}>{s.description}</div>
                )}
              </div>
            </div>
            <span style={{ color: T.muted, flexShrink: 0 }}><Icon name="chevron-right" size={18} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

// --- vista Richieste ---
function RequestsView({ reqs, isPlayer, isAdmin, athleteName, onManage, onEmptyGoStore }: {
  reqs: Req[]; isPlayer: boolean; isAdmin: boolean
  athleteName: (r: Req) => string; onManage: (r: Req) => void; onEmptyGoStore: () => void
}) {
  const [filter, setFilter] = useState<'tutte' | 'corso' | 'fatte'>('tutte')
  const active = (r: Req) => r.status === 'aperta' || r.status === 'in_carico'
  const list = reqs.filter(r =>
    filter === 'tutte' ? true : filter === 'corso' ? active(r) : r.status === 'completata')
  const nCorso = reqs.filter(active).length
  const nFatte = reqs.filter(r => r.status === 'completata').length

  if (reqs.length === 0) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
        <Empty icon={<Icon name="inbox" size={30} strokeWidth={1.4} />}
          title="Nessuna richiesta"
          hint={isPlayer ? 'Apri lo Store e manda la tua prima richiesta.' : 'Non ci sono ancora richieste.'} />
        {isPlayer && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={onEmptyGoStore}
              style={{ padding: '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: T.text, color: '#0b0b0e', fontWeight: 800 }}>
              Vai allo store
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div style={{ fontSize: 12.5, color: T.dim }}>{nCorso} in corso · {nFatte} completate</div>
      <div className="flex gap" style={{ gap: 8 }}>
        {([['tutte', 'Tutte'], ['corso', 'In corso'], ['fatte', 'Completate']] as const).map(([k, l]) => {
          const on = filter === k
          return (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${on ? T.text : T.border}`, background: on ? T.text : 'transparent',
                color: on ? '#0b0b0e' : T.dim, fontWeight: 700, fontSize: 12 }}>
              {l}
            </button>
          )
        })}
      </div>

      <div className="grid" style={{ gap: 10 }}>
        {list.map(r => {
          const s = st(r.status)
          return (
            <div key={r.id} style={{
              background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${s.c}`,
              borderRadius: 14, padding: 14 }}>
              <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div className="flex gap" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0, color: s.c,
                    border: `1.5px solid ${s.c}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...(active(r) ? { animation: 'auviPulse 2s infinite' } : {}),
                  }}>
                    <Icon name={r.status === 'completata' ? 'check' : r.status === 'in_carico' ? 'rotate-ccw' : 'send'} size={14} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{r.service_title}</div>
                    <div style={{ fontSize: 11.5, color: T.dim }}>
                      {!isPlayer && `${athleteName(r)} · `}Inviata {fmtDate(r.created_at)}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: s.c, whiteSpace: 'nowrap' }}>
                  {s.l}
                </span>
              </div>

              <div className="flex gap" style={{ gap: 4, marginTop: 12 }}>
                {[1, 2, 3].map(n => (
                  <span key={n} style={{ flex: 1, height: 4, borderRadius: 2,
                    background: n <= s.step ? s.c : T.border }} />
                ))}
              </div>

              {r.internal_note && r.status !== 'aperta' && (
                <div style={{ fontSize: 12, marginTop: 10, color: s.c }}>{r.internal_note}</div>
              )}
              {r.message && (
                <div style={{ fontSize: 12, marginTop: 8, color: T.dim }}>{r.message}</div>
              )}

              {isAdmin && r.status !== 'completata' && r.status !== 'annullata' && (
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-sm" onClick={() => onManage(r)}>Gestisci</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- gestione richiesta (admin) ---
function ManageForm({ req, onClose, onSaved }: { req: Req; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(req.status)
  const [note, setNote] = useState(req.internal_note || '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('crm_service_requests').update({
      status, internal_note: note || null, updated_at: new Date().toISOString(),
      closed_at: ['completata', 'annullata'].includes(status) ? new Date().toISOString() : null,
    }).eq('id', req.id)
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast('Richiesta aggiornata')
    onSaved()
  }

  return (
    <Modal title={`Gestisci · ${req.service_title}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      {req.message && (
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 12, borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
          {req.message}
        </div>
      )}
      <Field label="Stato">
        <Select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="aperta">Inviata</option>
          <option value="in_carico">In lavorazione</option>
          <option value="completata">Completata</option>
          <option value="annullata">Annullata</option>
        </Select>
      </Field>
      <Field label="Messaggio per l'atleta">
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Es. ho girato la richiesta al nostro partner, ti aggiorno entro domani" />
      </Field>
    </Modal>
  )
}

const keyframes = `
@keyframes auviPulse {
  0% { box-shadow: 0 0 0 0 rgba(125,211,252,.45); }
  70% { box-shadow: 0 0 0 8px rgba(125,211,252,0); }
  100% { box-shadow: 0 0 0 0 rgba(125,211,252,0); }
}
`
