import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, fmtDateTime } from '../lib/format'
import ServiceDetail from '../components/ServiceDetail'

// Marketplace interno: l'atleta sfoglia i servizi e chiede ciò che gli serve.
// La richiesta arriva ad AUVI, che la prende in carico e la chiude.
const ACCENT = '#7D6AE8'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

const STATUS: Record<string, { l: string; c: string }> = {
  aperta: { l: 'In attesa', c: '#c9922b' },
  in_carico: { l: 'Presa in carico', c: ACCENT },
  completata: { l: 'Completata', c: '#3fb984' },
  annullata: { l: 'Annullata', c: '#e5484d' },
}

import type { Service } from '../components/ServiceDetail'

type Req = {
  id: string
  player_id: number
  service_id: string | null
  service_title: string | null
  message: string | null
  preferred_date: string | null
  status: string
  internal_note: string | null
  created_at: string
}

export default function Services() {
  const { role, isAdmin } = useAuth()
  const { athleteId, athletes } = useAthlete()
  const [services, setServices] = useState<Service[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Service | null>(null)
  const [manage, setManage] = useState<Req | null>(null)

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

  const verificati = useMemo(() => services.filter(s => s.verified), [services])
  const altri = useMemo(() => services.filter(s => !s.verified), [services])
  const aperte = reqs.filter(r => r.status === 'aperta' || r.status === 'in_carico')

  if (loading) return <Spinner />

  const athleteName = (id: number) => athletes.find(a => a.api_player_id === id)?.name || 'Atleta'

  if (open) {
    return (
      <ServiceDetail service={open} playerId={athleteId} canRequest={!!athleteId}
        onBack={() => setOpen(null)} onSent={() => { setOpen(null); load() }} />
    )
  }

  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* --- intestazione --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>Servizi AUVI</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
          {isPlayer ? 'Di cosa hai bisogno?' : 'Servizi e richieste'}
        </div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 620 }}>
          {isPlayer
            ? 'Scegli il servizio e mandaci la richiesta: ci occupiamo noi di trovare la persona giusta e seguirti fino alla fine.'
            : 'Catalogo dei servizi proposti agli atleti e richieste da gestire.'}
        </div>
        {aperte.length > 0 && (
          <div className="flex gap" style={{ gap: 26, marginTop: 16, flexWrap: 'wrap' }}>
            <Metric label="Richieste aperte" value={String(aperte.length)} />
          </div>
        )}
      </div>

      {/* --- richieste in corso --- */}
      {reqs.length > 0 && (
        <div className="card">
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...kicker, color: 'var(--text-dim)' }}>
              {isPlayer ? 'Le tue richieste' : 'Richieste degli atleti'}
            </div>
            <span className="faint" style={{ fontSize: 12 }}>{reqs.length}</span>
          </div>
          <div className="grid" style={{ gap: 9 }}>
            {reqs.slice(0, 12).map(r => {
              const st = STATUS[r.status] || STATUS.aperta
              return (
                <div key={r.id} className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap',
                       borderBottom: '1px solid var(--border)', paddingBottom: 9 }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 30, borderRadius: 2, background: st.c }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.service_title}</div>
                      <div className="faint" style={{ fontSize: 11.5 }}>
                        {!isPlayer && `${athleteName(r.player_id)} · `}
                        {fmtDateTime(r.created_at)}
                        {r.preferred_date ? ` · per il ${fmtDate(r.preferred_date)}` : ''}
                      </div>
                      {r.message && <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{r.message}</div>}
                      {r.internal_note && r.status !== 'aperta' && (
                        <div style={{ fontSize: 12, marginTop: 3, color: st.c }}>{r.internal_note}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: st.c, whiteSpace: 'nowrap' }}>
                      {st.l}
                    </span>
                    {isAdmin && r.status !== 'completata' && r.status !== 'annullata' && (
                      <button className="btn btn-sm" onClick={() => setManage(r)}>Gestisci</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* --- partner verificati --- */}
      {verificati.length > 0 && (
        <Group title="Partner verificati" hint="Professionisti con cui lavoriamo già"
          services={verificati} accent={ACCENT} isPlayer={isPlayer} onAsk={setOpen} badge />
      )}

      {/* --- altri servizi --- */}
      {altri.length > 0 && (
        <Group title="Altri servizi disponibili" hint="Attiviamo il professionista giusto su richiesta"
          services={altri} accent={ACCENT} isPlayer={isPlayer} onAsk={setOpen} />
      )}

      {services.length === 0 && (
        <div className="card">
          <Empty icon={<Icon name="star" size={30} strokeWidth={1.4} />} title="Nessun servizio"
            hint="Il catalogo non è ancora stato popolato." />
        </div>
      )}

      {manage && (
        <ManageForm req={manage} onClose={() => setManage(null)} onSaved={() => { setManage(null); load() }} />
      )}
    </div>
  )
}

function Group({ title, hint, services, accent, isPlayer, onAsk, badge }: {
  title: string; hint: string; services: Service[]; accent: string
  isPlayer: boolean; onAsk: (s: Service) => void; badge?: boolean
}) {
  // raggruppa per categoria mantenendo l'ordine
  const cats = services.reduce((acc: Record<string, Service[]>, s) => {
    (acc[s.category] = acc[s.category] || []).push(s); return acc
  }, {})

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
          <span style={{ width: 3, height: 15, background: badge ? accent : 'var(--text-dim)', borderRadius: 2 }} />
          <span style={{ ...kicker, color: 'var(--text)' }}>{title}</span>
        </div>
        <div className="faint" style={{ fontSize: 11.5, marginTop: 4, marginLeft: 12 }}>{hint}</div>
      </div>

      {Object.entries(cats).map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div className="faint" style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>{cat}</div>
          <div className="grid g3" style={{ gap: 12 }}>
            {list.map(s => (
              <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 3, background: badge ? accent : 'var(--border)' }} />
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: 'calc(100% - 3px)' }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: badge ? accent : 'var(--border)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={s.icon} size={17} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800 }}>{s.title}</div>
                      {badge && (
                        <div style={{ ...kicker, fontSize: 9, color: accent }}>Partner verificato</div>
                      )}
                    </div>
                  </div>

                  {s.description && (
                    <div className="faint" style={{ fontSize: 12.5, marginTop: 10, flex: 1 }}>{s.description}</div>
                  )}

                  {s.partner_name ? (
                    <div style={{ fontSize: 12, marginTop: 9 }}>
                      <span className="faint">Con </span>
                      <b>{s.partner_name}</b>
                    </div>
                  ) : (
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 9, fontStyle: 'italic' }}>
                      Professionista selezionato da AUVI
                    </div>
                  )}

                  <button className="btn btn-sm" style={{ marginTop: 12, width: '100%', justifyContent: 'center',
                                                          background: accent, color: '#fff', fontWeight: 800, border: 'none' }}
                    onClick={() => onAsk(s)}>
                    {isPlayer ? 'Scopri e richiedi' : 'Apri servizio'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 900, marginTop: 2,
                    borderBottom: `2px solid ${ACCENT}`, display: 'inline-block', paddingBottom: 2 }}>{value}</div>
    </div>
  )
}

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
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 12, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10 }}>
          {req.message}
        </div>
      )}
      <Field label="Stato">
        <Select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="aperta">In attesa</option>
          <option value="in_carico">Presa in carico</option>
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
