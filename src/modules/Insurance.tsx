import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, fmtMoney } from '../lib/format'

// Area assicurativa dell'atleta: due mondi distinti (sport e personale),
// ciascuno con la propria dashboard. I documenti li carica l'assicuratore.
const ACCENT = '#2E9BD6'      // blu assicurativo, distinto da brand/fitness/procura
const WARN = '#c9922b'
const DANGER = '#e5484d'
const OK = '#3fb984'
const BUCKET = 'insurance-docs'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

const AREAS = [
  { k: 'sport', l: 'Sport', hint: 'Coperture legate alla carriera' },
  { k: 'personale', l: 'Personale', hint: 'Casa, veicoli, famiglia' },
] as const

const CATEGORIES: Record<string, string[]> = {
  sport: ['Infortuni', 'Invalidità permanente', 'Tutela legale', 'Responsabilità civile', 'Perdita guadagno', 'Altro'],
  personale: ['Auto', 'Casa', 'Vita', 'Salute', 'Famiglia', 'Viaggio', 'Animali', 'Altro'],
}

export type Policy = {
  id: string
  player_id: number
  area: string
  category: string | null
  title: string
  company: string | null
  broker: string | null
  policy_number: string | null
  holder: string | null
  insured_party: string | null
  start_date: string | null
  expiry_date: string | null
  premium: number | null
  payment_frequency: string | null
  coverage_amount: number | null
  deductible: string | null
  status: string
  notes: string | null
  attachments: { name: string; path: string; size?: number | null; mime?: string | null }[] | null
}

const daysTo = (d?: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null

function expiryTone(d?: string | null) {
  const n = daysTo(d)
  if (n === null) return null
  if (n < 0) return { c: DANGER, l: 'Scaduta' }
  if (n <= 30) return { c: DANGER, l: `Scade tra ${n} g` }
  if (n <= 60) return { c: WARN, l: `Scade tra ${n} g` }
  return { c: OK, l: `Scade tra ${n} g` }
}

async function openDoc(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error || !data?.signedUrl) { toast('Impossibile aprire il documento', 'err'); return }
  window.open(data.signedUrl, '_blank')
}

export default function Insurance() {
  const { role } = useAuth()
  const { athleteId } = useAthlete()
  const [area, setArea] = useState<string>('sport')
  const [edit, setEdit] = useState<Partial<Policy> | null>(null)

  const canManage = role === 'assicuratore' || role === 'admin'
  const { rows, loading, reload } = useCollection<Policy>('crm_insurance_policies', {
    orderBy: 'expiry_date', ascending: true,
    match: athleteId ? { player_id: athleteId } : undefined,
  })

  const ofArea = useMemo(() => rows.filter(p => p.area === area), [rows, area])

  // Riepilogo dell'area attiva
  const stats = useMemo(() => {
    const attive = ofArea.filter(p => p.status === 'attiva').length
    const inScadenza = ofArea.filter(p => { const n = daysTo(p.expiry_date); return n !== null && n >= 0 && n <= 60 }).length
    const scadute = ofArea.filter(p => { const n = daysTo(p.expiry_date); return n !== null && n < 0 }).length
    const premio = ofArea.filter(p => p.status !== 'disdetta').reduce((s, p) => s + Number(p.premium || 0), 0)
    return { attive, inScadenza, scadute, premio }
  }, [ofArea])

  const prossime = useMemo(
    () => ofArea.filter(p => p.expiry_date && p.status !== 'disdetta')
                .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || '')).slice(0, 4),
    [ofArea])

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* --- selettore area: due dashboard distinte --- */}
      <div className="pill-tabs" style={{ alignSelf: 'start' }}>
        {AREAS.map(a => (
          <button key={a.k} className={`pill-tab ${area === a.k ? 'active' : ''}`} onClick={() => setArea(a.k)}
            style={area === a.k ? { background: ACCENT, color: '#fff', borderColor: ACCENT } : undefined}>
            <Icon name={a.k === 'sport' ? 'dumbbell' : 'home'} size={13} /> {a.l}
          </button>
        ))}
      </div>

      {/* --- riepilogo --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>
          Assicurazioni · {AREAS.find(a => a.k === area)?.l}
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
          {AREAS.find(a => a.k === area)?.hint}
        </div>
        <div className="flex gap" style={{ gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
          <Metric label="Polizze attive" value={String(stats.attive)} tone={ACCENT} />
          <Metric label="In scadenza" value={String(stats.inScadenza)} tone={stats.inScadenza ? WARN : undefined} />
          <Metric label="Scadute" value={String(stats.scadute)} tone={stats.scadute ? DANGER : undefined} />
          {stats.premio > 0 && <Metric label="Premio totale" value={fmtMoney(stats.premio)} tone={ACCENT} />}
        </div>
      </div>

      {/* --- prossime scadenze --- */}
      {prossime.length > 0 && (
        <div className="card">
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...kicker, color: 'var(--text-dim)' }}>Prossime scadenze</div>
            <span className="faint" style={{ fontSize: 11.5 }}>Sono anche in agenda</span>
          </div>
          <div className="grid" style={{ gap: 8 }}>
            {prossime.map(p => {
              const t = expiryTone(p.expiry_date)
              return (
                <div key={p.id} className="flex between" style={{ alignItems: 'center', gap: 10 }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 28, borderRadius: 2, background: t?.c || ACCENT }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div className="faint" style={{ fontSize: 11.5 }}>
                        {[p.category, p.company].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{fmtDate(p.expiry_date)}</div>
                    {t && <div style={{ fontSize: 11, fontWeight: 800, color: t.c }}>{t.l}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* --- elenco polizze --- */}
      <div>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
          <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
            <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
            <span style={{ ...kicker, color: 'var(--text)' }}>Le mie polizze</span>
          </div>
          {canManage && (
            <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff', fontWeight: 800, border: 'none' }}
              onClick={() => setEdit({ area, status: 'attiva' })}>
              <Icon name="plus" size={13} /> Nuova polizza
            </button>
          )}
        </div>

        {ofArea.length === 0 ? (
          <div className="card">
            <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />}
              title="Nessuna polizza in questa area"
              hint={canManage ? 'Aggiungi la prima polizza.' : 'Il tuo assicuratore le caricherà qui.'} />
          </div>
        ) : (
          <div className="grid g2" style={{ gap: 12 }}>
            {ofArea.map(p => {
              const t = expiryTone(p.expiry_date)
              return (
                <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ height: 3, background: t?.c || ACCENT }} />
                  <div style={{ padding: 16 }}>
                    <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 800 }}>{p.title}</div>
                        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                          {[p.category, p.company].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      {t && (
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase',
                                       color: t.c, whiteSpace: 'nowrap' }}>{t.l}</span>
                      )}
                    </div>

                    <div className="grid g2" style={{ gap: 8, marginTop: 13 }}>
                      <Info k="Numero polizza" v={p.policy_number} />
                      <Info k="Scadenza" v={p.expiry_date ? fmtDate(p.expiry_date) : null} />
                      <Info k="Assicurato" v={p.insured_party} />
                      <Info k="Massimale" v={p.coverage_amount ? fmtMoney(p.coverage_amount) : null} />
                      <Info k="Premio" v={p.premium ? `${fmtMoney(p.premium)}${p.payment_frequency ? ' · ' + p.payment_frequency : ''}` : null} />
                      <Info k="Franchigia" v={p.deductible} />
                    </div>

                    {p.attachments && p.attachments.length > 0 && (
                      <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
                        {p.attachments.map(a => (
                          <button key={a.path} className="btn btn-sm" title={a.name}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 230 }}
                            onClick={() => openDoc(a.path)}>
                            <Icon name="download" size={13} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {p.notes && <div className="faint" style={{ fontSize: 12.5, marginTop: 11 }}>{p.notes}</div>}

                    {canManage && (
                      <div className="flex gap" style={{ marginTop: 13 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEdit(p)}>Modifica</button>
                        <ConfirmButton onConfirm={async () => { await deleteRow('crm_insurance_policies', p.id); reload() }}>Elimina</ConfirmButton>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {edit && athleteId && (
        <PolicyForm value={edit} playerId={athleteId}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />
      )}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2,
                    borderBottom: `2px solid ${tone || 'var(--border)'}`, display: 'inline-block', paddingBottom: 2 }}>
        {value}
      </div>
    </div>
  )
}

function Info({ k, v }: { k: string; v?: any }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.7px', fontWeight: 700 }}>{k}</div>
      <div style={{ fontSize: 13, marginTop: 1 }}>{v || '—'}</div>
    </div>
  )
}

function PolicyForm({ value, playerId, onClose, onSaved }: {
  value: Partial<Policy>; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState<Partial<Policy>>(value)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [atts, setAtts] = useState(value.attachments || [])
  const set = (k: keyof Policy, v: any) => setF(p => ({ ...p, [k]: v }))

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      // il percorso inizia con l'id atleta: l'isolamento è imposto dalle policy storage
      const path = `${playerId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { toast(up.error.message, 'err'); continue }
      setAtts(prev => [...prev, { name: file.name, path, size: file.size, mime: file.type }])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    if (!f.title) return
    setBusy(true)
    const payload = {
      player_id: playerId,
      area: f.area || 'sport',
      category: f.category || null,
      title: f.title,
      company: f.company || null,
      broker: f.broker || null,
      policy_number: f.policy_number || null,
      holder: f.holder || null,
      insured_party: f.insured_party || null,
      start_date: f.start_date || null,
      expiry_date: f.expiry_date || null,
      premium: f.premium ? Number(f.premium) : null,
      payment_frequency: f.payment_frequency || null,
      coverage_amount: f.coverage_amount ? Number(f.coverage_amount) : null,
      deductible: f.deductible || null,
      status: f.status || 'attiva',
      notes: f.notes || null,
      attachments: atts,
      updated_at: new Date().toISOString(),
    }
    if (f.id) await updateRow('crm_insurance_policies', f.id, payload)
    else await insertRow('crm_insurance_policies', payload)
    setBusy(false); onSaved()
  }

  const cats = CATEGORIES[f.area || 'sport'] || []

  return (
    <Modal wide title={f.id ? 'Modifica polizza' : 'Nuova polizza'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.title} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Area">
          <Select value={f.area || 'sport'} onChange={e => { set('area', e.target.value); set('category', '') }}>
            <option value="sport">Sport</option>
            <option value="personale">Personale</option>
          </Select>
        </Field>
        <Field label="Categoria">
          <Select value={f.category || ''} onChange={e => set('category', e.target.value)}>
            <option value="">— seleziona —</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Titolo"><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="Es. Infortuni professionali" /></Field>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Compagnia"><Input value={f.company || ''} onChange={e => set('company', e.target.value)} /></Field>
        <Field label="Intermediario"><Input value={f.broker || ''} onChange={e => set('broker', e.target.value)} /></Field>
        <Field label="Numero polizza"><Input value={f.policy_number || ''} onChange={e => set('policy_number', e.target.value)} /></Field>
        <Field label="Contraente"><Input value={f.holder || ''} onChange={e => set('holder', e.target.value)} /></Field>
        <Field label="Assicurato"><Input value={f.insured_party || ''} onChange={e => set('insured_party', e.target.value)} placeholder="Es. atleta, coniuge, figlio" /></Field>
        <Field label="Stato">
          <Select value={f.status || 'attiva'} onChange={e => set('status', e.target.value)}>
            <option value="attiva">Attiva</option>
            <option value="in_rinnovo">In rinnovo</option>
            <option value="scaduta">Scaduta</option>
            <option value="disdetta">Disdetta</option>
          </Select>
        </Field>
        <Field label="Decorrenza"><Input type="date" value={f.start_date || ''} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="Scadenza"><Input type="date" value={f.expiry_date || ''} onChange={e => set('expiry_date', e.target.value)} /></Field>
        <Field label="Premio (€)"><Input type="number" value={f.premium ?? ''} onChange={e => set('premium', e.target.value)} /></Field>
        <Field label="Frequenza">
          <Select value={f.payment_frequency || ''} onChange={e => set('payment_frequency', e.target.value)}>
            <option value="">—</option>
            <option value="annuale">Annuale</option>
            <option value="semestrale">Semestrale</option>
            <option value="trimestrale">Trimestrale</option>
            <option value="mensile">Mensile</option>
          </Select>
        </Field>
        <Field label="Massimale (€)"><Input type="number" value={f.coverage_amount ?? ''} onChange={e => set('coverage_amount', e.target.value)} /></Field>
        <Field label="Franchigia"><Input value={f.deductible || ''} onChange={e => set('deductible', e.target.value)} /></Field>
      </div>
      <Field label="Note"><Textarea rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>

      <div style={{ marginTop: 4 }}>
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>Documenti</div>
        {atts.length > 0 && (
          <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
            {atts.map(a => (
              <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                <span className="flex gap" style={{ alignItems: 'center', minWidth: 0, gap: 7 }}>
                  <Icon name="file" size={15} />
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setAtts(prev => prev.filter(x => x.path !== a.path))}>Rimuovi</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> {uploading ? 'Carico…' : 'Aggiungi documento'}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
        <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
          Polizza, condizioni, quietanze: l'atleta li apre e li scarica dal suo telefono.
        </div>
      </div>
    </Modal>
  )
}
