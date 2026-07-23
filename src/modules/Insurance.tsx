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
  { k: 'riepilogo', l: 'Riepilogo', hint: 'Quanto spendi e per cosa sei coperto' },
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
  coverage_items?: { name: string; amount?: number | null; note?: string | null }[] | null
  premium_is_annual?: boolean
}

// Costo annuo normalizzato: rende confrontabili polizze con rate diverse.
const FREQ_MULT: Record<string, number> = { mensile: 12, trimestrale: 4, semestrale: 2, annuale: 1 }
function annualCost(p: Partial<Policy>): number {
  const v = Number(p.premium || 0)
  if (!v) return 0
  if (p.premium_is_annual) return v
  return v * (FREQ_MULT[(p.payment_frequency || 'annuale').toLowerCase()] ?? 1)
}

export type Payment = {
  id: string
  policy_id: string | null
  player_id: number
  amount: number
  paid_on: string
  method: string | null
  note: string | null
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
  const [area, setArea] = useState<string>('riepilogo')
  const [edit, setEdit] = useState<Partial<Policy> | null>(null)

  // Anche l'atleta gestisce le proprie polizze: molte (auto, casa) non passano da un assicuratore.
  const canManage = role === 'assicuratore' || role === 'admin' || role === 'player'
  const { rows, loading, reload } = useCollection<Policy>('crm_insurance_policies', {
    orderBy: 'expiry_date', ascending: true,
    match: athleteId ? { player_id: athleteId } : undefined,
  })

  const { rows: pays, reload: reloadPays } = useCollection<Payment>('crm_insurance_payments', {
    orderBy: 'paid_on', ascending: false,
    match: athleteId ? { player_id: athleteId } : undefined,
  })
  const [payFor, setPayFor] = useState<Policy | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const [quickBusy, setQuickBusy] = useState(false)

  // Percorso "documento prima": carichi la polizza e il form si apre già con
  // l'allegato dentro, pronto per i pochi dati che contano.
  async function quickUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !athleteId) return
    setQuickBusy(true)
    const path = `${athleteId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    setQuickBusy(false)
    if (up.error) { toast(up.error.message, 'err'); return }
    setEdit({
      area: area === 'riepilogo' ? 'sport' : area,
      status: 'attiva',
      title: file.name.replace(/\.[^.]+$/, ''),
      attachments: [{ name: file.name, path, size: file.size, mime: file.type }],
    })
    toast('Documento caricato: completa i dati')
  }

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
            <Icon name={a.k === 'riepilogo' ? 'activity' : a.k === 'sport' ? 'dumbbell' : 'home'} size={13} /> {a.l}
          </button>
        ))}
      </div>

      {area === 'riepilogo' ? <Overview rows={rows} pays={pays} /> : <>
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
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-sm" disabled={quickBusy} onClick={() => quickRef.current?.click()}>
                <Icon name="upload" size={13} /> {quickBusy ? 'Carico…' : 'Carica polizza'}
              </button>
              <input ref={quickRef} type="file" hidden onChange={quickUpload} />
              <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff', fontWeight: 800, border: 'none' }}
                onClick={() => setEdit({ area: area === 'riepilogo' ? 'sport' : area, status: 'attiva' })}>
                <Icon name="plus" size={13} /> Nuova polizza
              </button>
            </div>
          )}
        </div>

        {ofArea.length === 0 ? (
          <div className="card">
            <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />}
              title="Nessuna polizza in questa area"
              hint={canManage
                ? 'Carica il documento della polizza o inseriscila a mano.'
                : 'Il tuo assicuratore le caricherà qui.'} />
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
                      <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" onClick={() => setPayFor(p)}>
                          <Icon name="plus" size={12} /> Pagamento
                        </button>
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

      </>}

      {payFor && athleteId && (
        <PaymentForm policy={payFor} playerId={athleteId}
          onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); reloadPays() }} />
      )}

      {edit && athleteId && (
        <PolicyForm value={edit} playerId={athleteId}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />
      )}
    </div>
  )
}


// Dashboard aggregata: costo annuo totale, ripartizione e mappa delle coperture.
// I dati arrivano dai campi compilati: nessuna elaborazione automatica del PDF.
function Overview({ rows, pays }: { rows: Policy[]; pays: Payment[] }) {
  const attive = rows.filter(p => p.status !== 'disdetta')

  const totale = attive.reduce((s, p) => s + annualCost(p), 0)
  const perArea = ['sport', 'personale'].map(a => ({
    area: a,
    costo: attive.filter(p => p.area === a).reduce((s, p) => s + annualCost(p), 0),
    n: attive.filter(p => p.area === a).length,
  }))

  // ripartizione per categoria, dalla più cara
  const perCat = Object.entries(
    attive.reduce((acc: Record<string, number>, p) => {
      const k = p.category || 'Altro'
      acc[k] = (acc[k] || 0) + annualCost(p)
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  // tutte le garanzie dichiarate, con la polizza di provenienza
  const garanzie = attive.flatMap(p =>
    (p.coverage_items || []).map(g => ({ ...g, polizza: p.title, area: p.area }))
  )

  // Riepilogo testuale da incollare in un assistente AI per l'analisi.
  function copiaRiepilogo() {
    const righe = attive.map(p => {
      const g = (p.coverage_items || []).map(x =>
        `    - ${x.name}${x.amount ? ` (massimale ${x.amount} €)` : ''}${x.note ? ` — ${x.note}` : ''}`).join('\n')
      return [
        `POLIZZA: ${p.title}`,
        `  Area: ${p.area} · Categoria: ${p.category || '—'}`,
        `  Compagnia: ${p.company || '—'} · N. ${p.policy_number || '—'}`,
        `  Assicurato: ${p.insured_party || '—'} · Contraente: ${p.holder || '—'}`,
        `  Decorrenza: ${p.start_date || '—'} · Scadenza: ${p.expiry_date || '—'}`,
        `  Premio: ${p.premium ?? '—'} € ${p.payment_frequency || ''} → costo annuo ${annualCost(p)} €`,
        `  Massimale: ${p.coverage_amount ?? '—'} € · Franchigia: ${p.deductible || '—'}`,
        g ? `  Garanzie:\n${g}` : '  Garanzie: non dettagliate',
        p.notes ? `  Note: ${p.notes}` : '',
      ].filter(Boolean).join('\n')
    }).join('\n\n')

    const testo = `RIEPILOGO ASSICURATIVO\nCosto annuo totale: ${totale} €\nPolizze attive: ${attive.length}\n\n${righe}`
    navigator.clipboard.writeText(testo)
      .then(() => toast('Riepilogo copiato: incollalo nel tuo assistente AI'))
      .catch(() => toast('Copia non riuscita', 'err'))
  }

  if (attive.length === 0) {
    return (
      <div className="card">
        <Empty icon={<Icon name="activity" size={30} strokeWidth={1.4} />}
          title="Nessun dato da riepilogare"
          hint="Quando ci saranno polizze, qui vedrai quanto spendi e per cosa sei coperto." />
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* spesa annua */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>Spesa assicurativa annua</div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, marginTop: 6 }}>{fmtMoney(totale)}</div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
          su {attive.length} polizze · {fmtMoney(totale / 12)} al mese
        </div>

        <div className="flex gap" style={{ gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
          {perArea.map(a => (
            <Metric key={a.area}
              label={a.area === 'sport' ? 'Sport' : 'Personale'}
              value={fmtMoney(a.costo)} tone={ACCENT} />
          ))}
        </div>
      </div>

      {/* spesa effettiva dell'anno */}
      {(() => {
        const anno = new Date().getFullYear()
        const speso = pays.filter(x => new Date(x.paid_on).getFullYear() === anno)
                          .reduce((s, x) => s + Number(x.amount || 0), 0)
        if (!pays.length) return null
        const pct = totale > 0 ? Math.min(100, Math.round((speso / totale) * 100)) : 0
        return (
          <div className="card">
            <div className="flex between" style={{ alignItems: 'center', marginBottom: 10 }}>
              <div style={{ ...kicker, color: 'var(--text-dim)' }}>Speso nel {anno}</div>
              <span className="faint" style={{ fontSize: 11.5 }}>{pays.length} pagamenti registrati</span>
            </div>
            <div className="flex gap" style={{ gap: 26, flexWrap: 'wrap', marginBottom: 12 }}>
              <Metric label="Effettivo" value={fmtMoney(speso)} tone={OK} />
              <Metric label="Previsto" value={fmtMoney(totale)} tone={ACCENT} />
              <Metric label="Differenza" value={fmtMoney(speso - totale)} tone={speso > totale ? DANGER : OK} />
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: OK }} />
            </div>
          </div>
        )
      })()}

      {/* ripartizione per categoria */}
      <div className="card">
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 12 }}>Dove vanno i soldi</div>
        <div className="grid" style={{ gap: 9 }}>
          {perCat.map(([cat, costo]) => {
            const pct = totale > 0 ? Math.round((costo / totale) * 100) : 0
            return (
              <div key={cat}>
                <div className="flex between" style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{cat}</span>
                  <span className="faint">{fmtMoney(costo)} · {pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* per cosa sono coperto */}
      <div className="card">
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
          <div style={{ ...kicker, color: 'var(--text-dim)' }}>Per cosa sei coperto</div>
          <span className="faint" style={{ fontSize: 11.5 }}>{garanzie.length} garanzie</span>
        </div>
        {garanzie.length === 0 ? (
          <div className="faint" style={{ fontSize: 13 }}>
            Le garanzie non sono ancora state dettagliate. Chiedi al tuo assicuratore di compilarle:
            compariranno qui, polizza per polizza.
          </div>
        ) : (
          <div className="grid" style={{ gap: 8 }}>
            {garanzie.map((g, i) => (
              <div key={i} className="flex between" style={{ alignItems: 'flex-start', gap: 10,
                     borderBottom: i < garanzie.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{g.name}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {g.polizza}{g.note ? ` · ${g.note}` : ''}
                  </div>
                </div>
                {g.amount ? (
                  <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, whiteSpace: 'nowrap' }}>
                    {fmtMoney(g.amount)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* esportazione per analisi AI */}
      <div className="card">
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>Analisi con AI</div>
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Copia il riepilogo completo delle tue polizze e incollalo in ChatGPT o Claude
          per farti spiegare coperture, sovrapposizioni e buchi di tutela.
        </div>
        <button className="btn btn-sm" onClick={copiaRiepilogo}>
          <Icon name="copy" size={13} /> Copia riepilogo per AI
        </button>
      </div>
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

// Registrazione di un pagamento: alimenta la spesa effettiva dell'anno.
function PaymentForm({ policy, playerId, onClose, onSaved }: {
  policy: Policy; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const [amount, setAmount] = useState<string>(policy.premium ? String(policy.premium) : '')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!amount) return
    setBusy(true)
    await insertRow('crm_insurance_payments', {
      policy_id: policy.id, player_id: playerId,
      amount: Number(amount), paid_on: paidOn,
      method: method || null, note: note || null,
    })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={`Pagamento · ${policy.title}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !amount} onClick={save}>{busy ? 'Salvo…' : 'Registra'}</button>
      </>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Importo (€)"><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="Data"><Input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></Field>
      </div>
      <Field label="Metodo">
        <Select value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">—</option>
          <option value="bonifico">Bonifico</option>
          <option value="carta">Carta</option>
          <option value="RID">Addebito automatico</option>
          <option value="contanti">Contanti</option>
        </Select>
      </Field>
      <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="Es. prima rata 2026" /></Field>
    </Modal>
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
  const [cov, setCov] = useState<{ name: string; amount?: number | null; note?: string | null }[]>(value.coverage_items || [])
  const setCovAt = (i: number, k: string, v: any) =>
    setCov(prev => prev.map((x, j) => j === i ? { ...x, [k]: v } : x))
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
      coverage_items: cov.filter(c => c.name?.trim()),
      premium_is_annual: !!f.premium_is_annual,
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
      {!f.id && (f.attachments?.length ?? 0) > 0 && (
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 10, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10 }}>
          Documento allegato. Compila i dati essenziali: <b>area</b>, <b>categoria</b>,
          <b> importo</b> e <b>scadenza</b> — bastano per la dashboard dei costi.
        </div>
      )}
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
        <Field label={f.premium_is_annual ? 'Premio annuo (€)' : 'Premio per rata (€)'}>
          <Input type="number" value={f.premium ?? ''} onChange={e => set('premium', e.target.value)} />
        </Field>
        <Field label="Frequenza">
          <Select value={f.payment_frequency || ''} onChange={e => set('payment_frequency', e.target.value)}>
            <option value="">—</option>
            <option value="annuale">Annuale</option>
            <option value="semestrale">Semestrale</option>
            <option value="trimestrale">Trimestrale</option>
            <option value="mensile">Mensile</option>
          </Select>
        </Field>
        <Field label="Costo annuo">
          <div style={{ padding: '9px 2px' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: ACCENT }}>
              {annualCost(f) ? fmtMoney(annualCost(f)) : '—'}
            </div>
            <label className="flex gap" style={{ gap: 7, fontSize: 12, cursor: 'pointer', marginTop: 5 }}>
              <input type="checkbox" checked={!!f.premium_is_annual}
                onChange={e => set('premium_is_annual', e.target.checked)} />
              L'importo inserito è già il totale annuo
            </label>
          </div>
        </Field>
        <Field label="Massimale (€)"><Input type="number" value={f.coverage_amount ?? ''} onChange={e => set('coverage_amount', e.target.value)} /></Field>
        <Field label="Franchigia"><Input value={f.deductible || ''} onChange={e => set('deductible', e.target.value)} /></Field>
      </div>
      <Field label="Note"><Textarea rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>

      <div style={{ marginTop: 4 }}>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 8 }}>
          <div style={{ ...kicker, color: 'var(--text-dim)' }}>Garanzie · per cosa copre</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setCov(prev => [...prev, { name: '' }])}>
            <Icon name="plus" size={12} /> Aggiungi garanzia
          </button>
        </div>
        {cov.length === 0 ? (
          <div className="faint" style={{ fontSize: 11.5, marginBottom: 10 }}>
            Es. "Invalidità permanente" · 500.000 € — alimentano la dashboard delle coperture.
          </div>
        ) : (
          <div className="grid" style={{ gap: 7, marginBottom: 10 }}>
            {cov.map((c, i) => (
              <div key={i} className="flex gap" style={{ gap: 7, alignItems: 'center' }}>
                <Input style={{ flex: 2 }} placeholder="Garanzia" value={c.name}
                  onChange={e => setCovAt(i, 'name', e.target.value)} />
                <Input style={{ flex: 1 }} type="number" placeholder="Massimale €" value={c.amount ?? ''}
                  onChange={e => setCovAt(i, 'amount', e.target.value ? Number(e.target.value) : null)} />
                <Input style={{ flex: 1.4 }} placeholder="Note" value={c.note || ''}
                  onChange={e => setCovAt(i, 'note', e.target.value)} />
                <button className="btn btn-ghost btn-sm" onClick={() => setCov(prev => prev.filter((_, j) => j !== i))}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
