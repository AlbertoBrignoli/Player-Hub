import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import ChatDocs from '../components/ChatDocs'
import { fmtDate, fmtMoney } from '../lib/format'
import { useLang } from '../lib/i18n'
import { useItemPeople, PeopleRow, ItemPeopleModal } from '../components/ItemPeople'
import { useRouteParam } from '../lib/route'

// Area legale e fiscale: pagamenti, documenti del commercialista
// e sue richieste che l'atleta deve smarcare.
const ACCENT = '#9A5530'   // terra bruciata: distinto da brand/fitness/procura/assicurazioni
const WARN = '#8A6D00'
const DANGER = '#E53F00'
const OK = '#12A150'
const BUCKET = 'tax-docs'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

const TABS = [
  { k: 'riepilogo', l: 'Riepilogo', icon: 'activity', hint: 'Spese, scadenze e richieste aperte' },
  { k: 'fiscale', l: 'Fiscale', icon: 'briefcase', hint: 'Imposte, contributi, dichiarazioni' },
  { k: 'legale', l: 'Legale', icon: 'archive', hint: 'Contratti, atti, contenziosi' },
  { k: 'documenti', l: 'Documenti', icon: 'file', hint: 'Allegati e file mandati in chat' },
] as const

const CATEGORIES: Record<string, string[]> = {
  fiscale: ['F24', 'IRPEF', 'IVA', 'Contributi INPS', 'Dichiarazione redditi', 'Acconto', 'Saldo', 'Altro'],
  legale: ['Contratto', 'Atto', 'Contenzioso', 'Visura', 'Procura', 'Altro'],
}

const KINDS = [
  { k: 'pagamento', l: 'Da pagare' },
  { k: 'documento', l: 'Documento' },
  { k: 'richiesta', l: 'Richiesta di documenti' },
]

export type TaxItem = {
  id: string
  player_id: number
  area: string
  kind: string
  category: string | null
  title: string
  description: string | null
  amount: number | null
  due_date: string | null
  status: string
  paid_on: string | null
  period: string | null
  attachments: { name: string; path: string }[] | null
  response_attachments: { name: string; path: string }[] | null
  response_note: string | null
}

const daysTo = (d?: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null

function dueTone(i: TaxItem) {
  // l è la chiave di traduzione: {n} si sostituisce al momento del render
  if (i.status !== 'aperto') return { c: OK, l: i.status === 'pagato' ? 'Pagato' : 'Completato', n: 0 }
  const n = daysTo(i.due_date)
  if (n === null) return null
  if (n < 0) return { c: DANGER, l: 'Scaduto da {n} g', n: -n }
  if (n <= 7) return { c: DANGER, l: 'Tra {n} g', n }
  if (n <= 30) return { c: WARN, l: 'Tra {n} g', n }
  return { c: 'var(--text-dim)', l: 'Tra {n} g', n }
}

async function openDoc(path: string, errMsg = 'Impossibile aprire il documento') {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error || !data?.signedUrl) { toast(errMsg, 'err'); return }
  window.open(data.signedUrl, '_blank')
}

export default function LegalTax() {
  const { role } = useAuth()
  const { t: tr } = useLang()
  const { athleteId } = useAthlete()
  const [tab, setTab] = useState<string>('riepilogo')
  const [edit, setEdit] = useState<Partial<TaxItem> | null>(null)
  const [respond, setRespond] = useState<TaxItem | null>(null)

  const isAdvisor = role === 'commercialista' || role === 'admin'
  const isPlayer = role === 'player'
  const canManage = isAdvisor || isPlayer

  const { rows, loading, reload } = useCollection<TaxItem>('crm_tax_items', {
    orderBy: 'due_date', ascending: true,
    match: athleteId ? { player_id: athleteId } : undefined,
  })

  const { people, reload: reloadPeople } = useItemPeople('tax', rows.map(r => r.id))
  const [thread, setThread] = useState<TaxItem | null>(null)
  const itemParam = useRouteParam('item')
  useEffect(() => {
    const it = itemParam ? rows.find(r => r.id === itemParam) : null
    if (it) { setTab(it.area); setThread(it) }
  }, [itemParam, rows.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const ofArea = useMemo(() => rows.filter(i => i.area === tab), [rows, tab])
  const aperte = useMemo(() => rows.filter(i => i.kind === 'richiesta' && i.status === 'aperto'), [rows])

  async function marcaPagato(i: TaxItem) {
    await updateRow('crm_tax_items', i.id, {
      status: 'pagato', paid_on: new Date().toISOString().slice(0, 10),
    })
    toast(tr('Segnato come pagato')); reload()
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="pill-tabs" style={{ alignSelf: 'start' }}>
        {TABS.map(t => (
          <button key={t.k} className={`pill-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}
            style={tab === t.k ? { background: ACCENT, color: '#fff', borderColor: ACCENT } : undefined}>
            <Icon name={t.icon} size={13} /> {tr(t.l)}
          </button>
        ))}
      </div>

      {/* richieste da smarcare: sempre in evidenza */}
      {aperte.length > 0 && (
        <div className="card" style={{ borderColor: `${WARN}55` }}>
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...kicker, color: WARN }}>{tr('Ti hanno chiesto questi documenti')}</div>
            <span className="faint" style={{ fontSize: 12 }}>{aperte.length}</span>
          </div>
          <div className="grid" style={{ gap: 9 }}>
            {aperte.map(i => (
              <div key={i.id} className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{i.title}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {i.description || (i.category && tr(i.category)) || '—'}
                    {i.due_date ? ' · ' + tr('entro il {date}').replace('{date}', fmtDate(i.due_date)) : ''}
                  </div>
                </div>
                <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: 'var(--ink)', fontWeight: 800, border: 'none' }}
                  onClick={() => setRespond(i)}>
                  <Icon name="upload" size={13} /> {tr('Rispondi')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'documenti' ? <LegalDocs rows={rows} /> : tab === 'riepilogo' ? <Overview rows={rows} /> : <>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                      background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
          <div style={{ ...kicker, color: ACCENT }}>{tr(TABS.find(t => t.k === tab)?.l || '')}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{tr(TABS.find(t => t.k === tab)?.hint || '')}</div>
          <div className="flex gap" style={{ gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
            <Metric label={tr('Voci aperte')} value={String(ofArea.filter(i => i.status === 'aperto').length)} tone={ACCENT} />
            <Metric label={tr('Da pagare')}
              value={fmtMoney(ofArea.filter(i => i.kind === 'pagamento' && i.status === 'aperto')
                                    .reduce((s, i) => s + Number(i.amount || 0), 0))} tone={WARN} />
            <Metric label={tr('Pagato')}
              value={fmtMoney(ofArea.filter(i => i.status === 'pagato')
                                    .reduce((s, i) => s + Number(i.amount || 0), 0))} tone={OK} />
          </div>
        </div>

        <div>
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
              <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
              <span style={{ ...kicker, color: 'var(--text)' }}>{tr('Voci')} · {tr(TABS.find(t => t.k === tab)?.l || '')}</span>
            </div>
            {canManage && (
              <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff', fontWeight: 800, border: 'none' }}
                onClick={() => setEdit({ area: tab, kind: 'pagamento', status: 'aperto' })}>
                <Icon name="plus" size={13} /> {tr('Aggiungi')}
              </button>
            )}
          </div>

          {ofArea.length === 0 ? (
            <div className="card">
              <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />}
                title={tr('Niente in questa area')}
                hint={canManage ? tr('Aggiungi un pagamento, un documento o una richiesta.')
                                : tr('Il tuo commercialista caricherà qui documenti e scadenze.')} />
            </div>
          ) : (
            <div className="grid g2" style={{ gap: 12 }}>
              {ofArea.map(i => {
                const t = dueTone(i)
                return (
                  <div key={i.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ height: 3, background: t?.c || ACCENT }} />
                    <div style={{ padding: 16 }}>
                      <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...kicker, fontSize: 9.5, color: ACCENT }}>
                            {tr(KINDS.find(k => k.k === i.kind)?.l || '')}{i.category ? ` · ${tr(i.category)}` : ''}
                          </div>
                          <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 2 }}>{i.title}</div>
                          {i.period && <div className="faint" style={{ fontSize: 11.5 }}>{i.period}</div>}
                        </div>
                        {t && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
                                             color: t.c, whiteSpace: 'nowrap' }}>{tr(t.l).replace('{n}', String(t.n))}</span>}
                      </div>

                      {i.description && <div className="faint" style={{ fontSize: 12.5, marginTop: 9 }}>{i.description}</div>}

                      <div className="grid g2" style={{ gap: 8, marginTop: 12 }}>
                        {i.amount ? <Info k={tr('Importo')} v={fmtMoney(i.amount)} /> : null}
                        {i.due_date ? <Info k={tr('Scadenza')} v={fmtDate(i.due_date)} /> : null}
                        {i.paid_on ? <Info k={tr('Pagato il')} v={fmtDate(i.paid_on)} /> : null}
                      </div>

                      {i.attachments && i.attachments.length > 0 && (
                        <div className="flex gap" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                          {i.attachments.map(a => (
                            <button key={a.path} className="btn btn-sm" title={a.name}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 220 }}
                              onClick={() => openDoc(a.path, tr('Impossibile aprire il documento'))}>
                              <Icon name="download" size={13} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {i.response_attachments && i.response_attachments.length > 0 && (
                        <div style={{ marginTop: 11, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <div style={{ ...kicker, fontSize: 9.5, color: OK, marginBottom: 6 }}>{tr("Consegnato dall'atleta")}</div>
                          <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                            {i.response_attachments.map(a => (
                              <button key={a.path} className="btn btn-ghost btn-sm" onClick={() => openDoc(a.path, tr('Impossibile aprire il documento'))}>
                                <Icon name="download" size={12} /> {a.name}
                              </button>
                            ))}
                          </div>
                          {i.response_note && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{i.response_note}</div>}
                        </div>
                      )}

                      <PeopleRow people={people[i.id] || []} onOpen={() => setThread(i)} />
                      <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
                        {i.kind === 'pagamento' && i.status === 'aperto' && (
                          <button className="btn btn-sm" style={{ background: OK, color: '#fff', fontWeight: 800, border: 'none' }}
                            onClick={() => marcaPagato(i)}>{tr('Segna pagato')}</button>
                        )}
                        {i.kind === 'richiesta' && i.status === 'aperto' && (
                          <button className="btn btn-sm" onClick={() => setRespond(i)}>
                            <Icon name="upload" size={12} /> {tr('Rispondi')}
                          </button>
                        )}
                        {canManage && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(i)}>{tr('Modifica')}</button>}
                        {canManage && <ConfirmButton onConfirm={async () => { await deleteRow('crm_tax_items', i.id); reload() }}>{tr('Elimina')}</ConfirmButton>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </>}

      {edit && athleteId && (
        <ItemForm value={edit} playerId={athleteId}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />
      )}
      {thread && athleteId && (
        <ItemPeopleModal kind="tax" itemId={thread.id} playerId={athleteId} title={thread.title}
          sub={tr(KINDS.find(k => k.k === thread.kind)?.l || '') + (thread.due_date ? ' · ' + fmtDate(thread.due_date) : '')}
          people={people[thread.id] || []} onPeople={reloadPeople} onClose={() => setThread(null)}>
          {thread.description && <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{thread.description}</div>}
        </ItemPeopleModal>
      )}
      {respond && athleteId && (
        <RespondForm item={respond} playerId={athleteId}
          onClose={() => setRespond(null)} onSaved={() => { setRespond(null); reload() }} />
      )}
    </div>
  )
}

// Tab Documenti: i file delle voci (caricati dal commercialista o in risposta dall'atleta)
// e, sotto, quelli mandati nella chat con il commercialista.
function LegalDocs({ rows }: { rows: TaxItem[] }) {
  const { t: tr } = useLang()
  const files = rows.flatMap(i => [
    ...(i.attachments || []).map(a => ({ ...a, item: i, reply: false })),
    ...(i.response_attachments || []).map(a => ({ ...a, item: i, reply: true })),
  ]).filter(f => f.path)
  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <div className="flex gap" style={{ alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
          <span style={{ ...kicker, color: 'var(--text)' }}>{tr('Documenti delle voci')}</span>
          <span className="faint" style={{ fontSize: 12 }}>{files.length}</span>
        </div>
        {files.length === 0
          ? <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />} title={tr('Nessun documento')}
              hint={tr('I file allegati alle voci fiscali e legali compaiono qui.')} />
          : <div className="list">
              {files.map(f => (
                <div className="row" key={f.path}>
                  <span style={{ display: 'inline-flex', color: ACCENT }}><Icon name="file" size={18} /></span>
                  <div className="row-main">
                    <div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div className="row-sub">{f.item.title}{f.reply ? ' · ' + tr("Risposta dell'atleta") : ''}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => openDoc(f.path)}>{tr('Apri')}</button>
                </div>
              ))}
            </div>}
      </div>
      <ChatDocs channel="commercialista" accent={ACCENT} />
    </div>
  )
}

function Overview({ rows }: { rows: TaxItem[] }) {
  const { t: tr } = useLang()
  const anno = new Date().getFullYear()
  const pagati = rows.filter(i => i.status === 'pagato' && i.paid_on &&
                                  new Date(i.paid_on).getFullYear() === anno)
  const speso = pagati.reduce((s, i) => s + Number(i.amount || 0), 0)
  const daPagare = rows.filter(i => i.kind === 'pagamento' && i.status === 'aperto')
  const totDaPagare = daPagare.reduce((s, i) => s + Number(i.amount || 0), 0)
  const scadute = daPagare.filter(i => (daysTo(i.due_date) ?? 99) < 0).length
  const richieste = rows.filter(i => i.kind === 'richiesta' && i.status === 'aperto').length

  const perCat = Object.entries(
    pagati.reduce((acc: Record<string, number>, i) => {
      const k = i.category || 'Altro' // chiave: tradotta al render
      acc[k] = (acc[k] || 0) + Number(i.amount || 0)
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  const prossime = daPagare.filter(i => i.due_date)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5)

  if (rows.length === 0) {
    return (
      <div className="card">
        <Empty icon={<Icon name="activity" size={30} strokeWidth={1.4} />}
          title={tr('Nessun dato')} hint={tr('Qui vedrai spese, scadenze e richieste del tuo commercialista.')} />
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>{tr('Legale e fiscale')} · {anno}</div>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1, marginTop: 6 }}>{fmtMoney(speso)}</div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{tr("versato quest'anno su {n} voci").replace('{n}', String(pagati.length))}</div>

        <div className="flex gap" style={{ gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
          <Metric label={tr('Da pagare')} value={fmtMoney(totDaPagare)} tone={totDaPagare ? WARN : undefined} />
          <Metric label={tr('Scadute')} value={String(scadute)} tone={scadute ? DANGER : undefined} />
          <Metric label={tr('Richieste aperte')} value={String(richieste)} tone={richieste ? WARN : undefined} />
        </div>
      </div>

      {prossime.length > 0 && (
        <div className="card">
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...kicker, color: 'var(--text-dim)' }}>{tr('Prossime scadenze')}</div>
            <span className="faint" style={{ fontSize: 11.5 }}>{tr('Sono anche in agenda')}</span>
          </div>
          <div className="grid" style={{ gap: 8 }}>
            {prossime.map(i => {
              const t = dueTone(i)
              return (
                <div key={i.id} className="flex between" style={{ alignItems: 'center', gap: 10 }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 28, borderRadius: 2, background: t?.c || ACCENT }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{i.title}</div>
                      <div className="faint" style={{ fontSize: 11.5 }}>{tr(i.category || (i.area === 'fiscale' ? 'Fiscale' : i.area === 'legale' ? 'Legale' : i.area))}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{i.amount ? fmtMoney(i.amount) : '—'}</div>
                    <div style={{ fontSize: 11, color: t?.c }}>{fmtDate(i.due_date)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {perCat.length > 0 && (
        <div className="card">
          <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 12 }}>{tr('Dove sono andati i soldi')}</div>
          <div className="grid" style={{ gap: 9 }}>
            {perCat.map(([cat, v]) => {
              const pct = speso > 0 ? Math.round((v / speso) * 100) : 0
              return (
                <div key={cat}>
                  <div className="flex between" style={{ fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{tr(cat)}</span>
                    <span className="faint">{fmtMoney(v)} · {pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 900, marginTop: 2,
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

function ItemForm({ value, playerId, onClose, onSaved }: {
  value: Partial<TaxItem>; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
  const [f, setF] = useState<Partial<TaxItem>>(value)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [atts, setAtts] = useState(value.attachments || [])
  const set = (k: keyof TaxItem, v: any) => setF(p => ({ ...p, [k]: v }))

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const path = `${playerId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { toast(up.error.message, 'err'); continue }
      setAtts(prev => [...prev, { name: file.name, path }])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    if (!f.title) return
    setBusy(true)
    const payload = {
      player_id: playerId, area: f.area || 'fiscale', kind: f.kind || 'pagamento',
      category: f.category || null, title: f.title, description: f.description || null,
      amount: f.amount ? Number(f.amount) : null, due_date: f.due_date || null,
      status: f.status || 'aperto', period: f.period || null,
      attachments: atts, updated_at: new Date().toISOString(),
    }
    if (f.id) await updateRow('crm_tax_items', f.id, payload)
    else await insertRow('crm_tax_items', payload)
    setBusy(false); onSaved()
  }

  const cats = CATEGORIES[f.area || 'fiscale'] || []

  return (
    <Modal title={f.id ? tr('Modifica voce') : tr('Nuova voce')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !f.title} onClick={save}>{busy ? tr('Salvo…') : tr('Salva')}</button>
      </>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Area')}>
          <Select value={f.area || 'fiscale'} onChange={e => { set('area', e.target.value); set('category', '') }}>
            <option value="fiscale">{tr('Fiscale')}</option>
            <option value="legale">{tr('Legale')}</option>
          </Select>
        </Field>
        <Field label={tr('Tipo')}>
          <Select value={f.kind || 'pagamento'} onChange={e => set('kind', e.target.value)}>
            {KINDS.map(k => <option key={k.k} value={k.k}>{tr(k.l)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={tr('Titolo')}><Input value={f.title || ''} onChange={e => set('title', e.target.value)}
        placeholder={f.kind === 'richiesta' ? tr('Es. Contratto di sponsorizzazione 2026') : tr('Es. F24 acconto IRPEF')} /></Field>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Categoria')}>
          <Select value={f.category || ''} onChange={e => set('category', e.target.value)}>
            <option value="">{tr('— seleziona —')}</option>
            {cats.map(c => <option key={c} value={c}>{tr(c)}</option>)}
          </Select>
        </Field>
        <Field label={tr('Periodo')}><Input value={f.period || ''} onChange={e => set('period', e.target.value)} placeholder={tr('Es. 2026')} /></Field>
        {f.kind === 'pagamento' && (
          <Field label={tr('Importo (€)')}><Input type="number" value={f.amount ?? ''} onChange={e => set('amount', e.target.value)} /></Field>
        )}
        <Field label={f.kind === 'richiesta' ? tr('Consegnare entro') : tr('Scadenza')}>
          <Input type="date" value={f.due_date || ''} onChange={e => set('due_date', e.target.value)} />
        </Field>
      </div>
      <Field label={tr('Descrizione')}><Textarea rows={2} value={f.description || ''} onChange={e => set('description', e.target.value)}
        placeholder={f.kind === 'richiesta' ? tr('Cosa serve esattamente') : tr('Note e istruzioni')} /></Field>

      <div style={{ marginTop: 4 }}>
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>{tr('Allegati')}</div>
        {atts.length > 0 && (
          <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
            {atts.map(a => (
              <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                <span className="flex gap" style={{ alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Icon name="file" size={15} />
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setAtts(prev => prev.filter(x => x.path !== a.path))}>{tr('Rimuovi')}</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> {uploading ? tr('Carico…') : tr('Aggiungi allegato')}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
      </div>
    </Modal>
  )
}

// Risposta dell'atleta a una richiesta di documenti: carica e smarca.
function RespondForm({ item, playerId, onClose, onSaved }: {
  item: TaxItem; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
  const [atts, setAtts] = useState(item.response_attachments || [])
  const [note, setNote] = useState(item.response_note || '')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const path = `${playerId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { toast(up.error.message, 'err'); continue }
      setAtts(prev => [...prev, { name: file.name, path }])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function invia() {
    setBusy(true)
    await updateRow('crm_tax_items', item.id, {
      response_attachments: atts, response_note: note || null,
      status: 'completato', completed_at: new Date().toISOString(),
    })
    setBusy(false)
    toast(tr('Richiesta smarcata'))
    onSaved()
  }

  return (
    <Modal title={`${tr('Rispondi')} · ${item.title}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || atts.length === 0} onClick={invia}>
          {busy ? tr('Invio…') : tr('Invia e smarca')}
        </button>
      </>}>
      {item.description && (
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 12, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10 }}>
          {item.description}
        </div>
      )}

      {atts.length > 0 && (
        <div className="grid" style={{ gap: 6, marginBottom: 10 }}>
          {atts.map(a => (
            <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
              <span className="flex gap" style={{ alignItems: 'center', gap: 7, minWidth: 0 }}>
                <Icon name="file" size={15} />
                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setAtts(prev => prev.filter(x => x.path !== a.path))}>{tr('Rimuovi')}</button>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={14} /> {uploading ? tr('Carico…') : tr('Carica documento')}
      </button>
      <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />

      <Field label={tr('Nota (facoltativa)')}>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={tr('Es. mancano le ultime due pagine')} />
      </Field>
    </Modal>
  )
}
