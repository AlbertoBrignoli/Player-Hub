import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, fmtMoney } from '../lib/format'
import { useLang } from '../lib/i18n'
import { WEALTH_ACCENT as ACCENT } from './WealthProfile'

// Area patrimonio del wealth manager (es. Delian & Co.), sul modello di "Fisco e legale":
// quadro del patrimonio, task e richieste da smarcare per l'atleta, scadenze, documenti e report.
// Lo vedono solo l'atleta, AUVI e il wealth manager collegato (RLS su crm_wealth_*).
const WARN = '#8A6D00'
const DANGER = '#E53F00'
const OK = '#12A150'
const BUCKET = 'wealth-docs'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

const TABS = [
  { k: 'riepilogo', l: 'Riepilogo', icon: 'activity' },
  { k: 'todo', l: 'Da fare', icon: 'check' },
  { k: 'docs', l: 'Documenti', icon: 'archive' },
] as const

const KINDS = [
  { k: 'task', l: 'Task per l\'atleta', tab: 'todo' },
  { k: 'richiesta', l: 'Richiesta di documenti', tab: 'todo' },
  { k: 'scadenza', l: 'Scadenza', tab: 'todo' },
  { k: 'report', l: 'Report', tab: 'docs' },
  { k: 'documento', l: 'Documento', tab: 'docs' },
]
const CATEGORIES = ['Investimenti', 'Liquidità', 'Immobili', 'Previdenza', 'Protezione', 'Fiscalità', 'Successione', 'Bancario', 'Altro']
const RISK = ['Conservativo', 'Moderato', 'Bilanciato', 'Dinamico', 'Aggressivo']

type File_ = { name: string; path: string }
export type WealthItem = {
  id: string; player_id: number; kind: string; category: string | null; title: string; description: string | null
  amount: number | null; due_date: string | null; period: string | null; status: string
  attachments: File_[] | null; response_attachments: File_[] | null; response_note: string | null
  created_at: string
}
type Overview = {
  player_id: number; total_assets: number | null; liquidity: number | null; invested: number | null
  real_estate: number | null; other_assets: number | null; currency: string
  risk_profile: string | null; horizon: string | null; goals: string | null; next_meeting: string | null
  notes: string | null; updated_at: string
}

const daysTo = (d?: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null
function dueTone(i: WealthItem) {
  if (i.status !== 'aperto') return { c: OK, l: 'Completato', n: 0 }
  const n = daysTo(i.due_date)
  if (n === null) return null
  if (n < 0) return { c: DANGER, l: 'Scaduto da {n} g', n: -n }
  if (n <= 7) return { c: DANGER, l: 'Tra {n} g', n }
  if (n <= 30) return { c: WARN, l: 'Tra {n} g', n }
  return { c: 'var(--text-dim)', l: 'Tra {n} g', n }
}

async function openDoc(path: string, errMsg: string) {
  const w = window.open('', '_blank')   // aperta subito, legata al tocco (iPhone)
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (data?.signedUrl && w) w.location.href = data.signedUrl
  else { w?.close(); toast(errMsg, 'err') }
}

async function uploadFiles(playerId: number, list: FileList | null) {
  const out: File_[] = []
  for (const file of Array.from(list || [])) {
    const path = `${playerId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (up.error) { toast(up.error.message, 'err'); continue }
    out.push({ name: file.name, path })
  }
  return out
}

export default function Wealth() {
  const { role } = useAuth()
  const { t: tr } = useLang()
  const { athleteId } = useAthlete()
  const [tab, setTab] = useState<string>('riepilogo')
  const [edit, setEdit] = useState<Partial<WealthItem> | null>(null)
  const [respond, setRespond] = useState<WealthItem | null>(null)
  const [editOv, setEditOv] = useState(false)
  const [ov, setOv] = useState<Overview | null>(null)
  const [advisor, setAdvisor] = useState<{ name: string | null; agency_logo_url: string | null } | null>(null)

  const canManage = role === 'wealth' || role === 'admin'
  const isPlayer = role === 'player'

  const { rows, loading, reload } = useCollection<WealthItem>('crm_wealth_items', {
    orderBy: 'due_date', ascending: true,
    match: athleteId ? { player_id: athleteId } : undefined,
  })

  async function loadOv() {
    if (!athleteId) return
    const [{ data: o }, { data: l }] = await Promise.all([
      supabase.from('crm_wealth_overview').select('*').eq('player_id', athleteId).maybeSingle(),
      supabase.from('crm_wealth_athletes').select('advisor_id').eq('player_id', athleteId).limit(1),
    ])
    setOv((o as Overview) || null)
    const aid = (l as any[])?.[0]?.advisor_id
    if (aid) {
      const { data: p } = await supabase.from('crm_wealth_profile').select('name, agency_logo_url').eq('advisor_id', aid).maybeSingle()
      setAdvisor((p as any) || null)
    } else setAdvisor(null)
  }
  useEffect(() => { loadOv() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = useMemo(() => rows.filter(i => ['task', 'richiesta'].includes(i.kind) && i.status === 'aperto'), [rows])
  const todo = useMemo(() => rows.filter(i => ['task', 'richiesta', 'scadenza'].includes(i.kind)), [rows])
  const docs = useMemo(() => [...rows.filter(i => ['report', 'documento'].includes(i.kind))]
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [rows])

  async function complete(i: WealthItem) {
    await updateRow('crm_wealth_items', i.id, { status: 'completato', completed_at: new Date().toISOString() })
    toast(tr('Fatto')); reload()
  }

  if (loading) return <Spinner />

  const list = tab === 'todo' ? todo : docs

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="flex gap" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="pill-tabs" style={{ alignSelf: 'start' }}>
          {TABS.map(t => (
            <button key={t.k} className={`pill-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}
              style={tab === t.k ? { background: ACCENT, color: '#fff', borderColor: ACCENT } : undefined}>
              <Icon name={t.icon} size={13} /> {tr(t.l)}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {advisor?.agency_logo_url && (
          <span className="flex gap" style={{ alignItems: 'center', gap: 8 }}>
            <span className="faint" style={{ fontSize: 11.5 }}>{tr('Seguito da')}</span>
            <span style={{ background: '#fff', borderRadius: 8, padding: '4px 8px', display: 'flex', border: '1px solid var(--border)' }}>
              <img src={advisor.agency_logo_url} alt={advisor.name || ''} style={{ height: 18, objectFit: 'contain' }} />
            </span>
          </span>
        )}
      </div>

      {/* task e richieste per l'atleta: sempre in evidenza */}
      {open.length > 0 && (
        <div className="card" style={{ borderColor: `${WARN}55` }}>
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...kicker, color: WARN }}>{isPlayer ? tr('Il tuo wealth manager ti chiede') : tr("In attesa dell'atleta")}</div>
            <span className="faint" style={{ fontSize: 12 }}>{open.length}</span>
          </div>
          <div className="grid" style={{ gap: 9 }}>
            {open.map(i => (
              <div key={i.id} className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{i.title}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {i.description || (i.category && tr(i.category)) || tr(KINDS.find(k => k.k === i.kind)?.l || '')}
                    {i.due_date ? ' · ' + tr('entro il {date}').replace('{date}', fmtDate(i.due_date)) : ''}
                  </div>
                </div>
                {isPlayer && (i.kind === 'richiesta'
                  ? <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: 'var(--ink)', fontWeight: 800, border: 'none' }}
                      onClick={() => setRespond(i)}><Icon name="upload" size={13} /> {tr('Rispondi')}</button>
                  : <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: 'var(--ink)', fontWeight: 800, border: 'none' }}
                      onClick={() => setRespond(i)}><Icon name="check" size={13} /> {tr('Fatto')}</button>)}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'riepilogo'
        ? <Summary ov={ov} rows={rows} canManage={canManage} onEdit={() => setEditOv(true)} />
        : (
          <div>
            <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
              <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
                <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
                <span style={{ ...kicker, color: 'var(--text)' }}>{tr(TABS.find(t => t.k === tab)?.l || '')}</span>
              </div>
              {canManage && (
                <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff', fontWeight: 800, border: 'none' }}
                  onClick={() => setEdit({ kind: tab === 'todo' ? 'task' : 'report', status: 'aperto' })}>
                  <Icon name="plus" size={13} /> {tr('Aggiungi')}
                </button>
              )}
            </div>

            {list.length === 0 ? (
              <div className="card">
                <Empty icon={<Icon name={tab === 'todo' ? 'check' : 'archive'} size={30} strokeWidth={1.4} />}
                  title={tab === 'todo' ? tr('Niente da fare') : tr('Nessun documento')}
                  hint={canManage
                    ? (tab === 'todo' ? tr("Aggiungi un task, una richiesta di documenti o una scadenza per l'atleta.") : tr('Carica un report o un documento per l\'atleta.'))
                    : tr('Il tuo wealth manager caricherà qui task, scadenze e report.')} />
              </div>
            ) : (
              <div className="grid g2" style={{ gap: 12 }}>
                {list.map(i => <ItemCard key={i.id} i={i} canManage={canManage} isPlayer={isPlayer}
                  onEdit={() => setEdit(i)} onRespond={() => setRespond(i)} onComplete={() => complete(i)}
                  onDelete={async () => { await deleteRow('crm_wealth_items', i.id); reload() }} />)}
              </div>
            )}
          </div>
        )}

      {edit && athleteId && (
        <ItemForm value={edit} playerId={athleteId}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />
      )}
      {respond && athleteId && (
        <RespondForm item={respond} playerId={athleteId}
          onClose={() => setRespond(null)} onSaved={() => { setRespond(null); reload() }} />
      )}
      {editOv && athleteId && (
        <OverviewForm value={ov} playerId={athleteId}
          onClose={() => setEditOv(false)} onSaved={() => { setEditOv(false); loadOv() }} />
      )}
    </div>
  )
}

function Summary({ ov, rows, canManage, onEdit }: { ov: Overview | null; rows: WealthItem[]; canManage: boolean; onEdit: () => void }) {
  const { t: tr } = useLang()
  const cur = ov?.currency || 'EUR'
  const parts = ov ? [
    { k: 'Liquidità', v: Number(ov.liquidity || 0), c: '#5B8DB8' },
    { k: 'Investimenti', v: Number(ov.invested || 0), c: ACCENT },
    { k: 'Immobili', v: Number(ov.real_estate || 0), c: '#9A8600' },
    { k: 'Altro', v: Number(ov.other_assets || 0), c: '#8A8A8A' },
  ].filter(p => p.v > 0) : []
  const sumParts = parts.reduce((s, p) => s + p.v, 0)
  const total = Number(ov?.total_assets || 0) || sumParts
  const scadenze = rows.filter(i => i.status === 'aperto' && i.due_date && ['task', 'richiesta', 'scadenza'].includes(i.kind))
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5)
  const lastReport = rows.filter(i => i.kind === 'report').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const meetDays = daysTo(ov?.next_meeting)

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ ...kicker, color: ACCENT }}>{tr('Quadro del patrimonio')}</div>
          {canManage && <button className="btn btn-ghost btn-sm" onClick={onEdit}><Icon name="edit" size={13} /> {ov ? tr('Aggiorna') : tr('Compila')}</button>}
        </div>
        {!ov ? (
          <div className="faint" style={{ fontSize: 13, marginTop: 10 }}>
            {canManage ? tr('Compila il quadro: patrimonio seguito, ripartizione, profilo di rischio e obiettivi.')
                       : tr('Il tuo wealth manager compilerà qui il quadro del tuo patrimonio.')}
          </div>
        ) : <>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1, marginTop: 6 }}>{total ? fmtMoney(total, cur) : '—'}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
            {tr('patrimonio seguito')} · {tr('aggiornato il {date}').replace('{date}', fmtDate(ov.updated_at))}
          </div>

          {parts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--border)' }}>
                {parts.map(p => <div key={p.k} title={tr(p.k)} style={{ width: `${(p.v / sumParts) * 100}%`, background: p.c }} />)}
              </div>
              <div className="flex gap" style={{ gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                {parts.map(p => (
                  <span key={p.k} className="flex gap" style={{ alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: p.c }} />
                    <b>{tr(p.k)}</b> <span className="faint">{fmtMoney(p.v, cur)} · {Math.round((p.v / sumParts) * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap" style={{ gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
            <Metric label={tr('Profilo di rischio')} value={ov.risk_profile ? tr(ov.risk_profile) : '—'} tone={ACCENT} />
            <Metric label={tr('Orizzonte')} value={ov.horizon || '—'} />
            <Metric label={tr('Prossimo incontro')} value={ov.next_meeting ? fmtDate(ov.next_meeting) : '—'}
              tone={meetDays !== null && meetDays >= 0 && meetDays <= 7 ? WARN : undefined} />
          </div>
          {ov.goals && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{tr('Obiettivi')}</div>
              <div style={{ fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{ov.goals}</div>
            </div>
          )}
          {ov.notes && <div className="faint" style={{ fontSize: 12.5, marginTop: 10, whiteSpace: 'pre-wrap' }}>{ov.notes}</div>}
        </>}
      </div>

      {(scadenze.length > 0 || lastReport) && (
        <div className="grid g2" style={{ gap: 12 }}>
          {scadenze.length > 0 && (
            <div className="card">
              <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
                <div style={{ ...kicker, color: 'var(--text-dim)' }}>{tr('Prossime scadenze')}</div>
                <span className="faint" style={{ fontSize: 11.5 }}>{tr('Sono anche in agenda')}</span>
              </div>
              <div className="grid" style={{ gap: 8 }}>
                {scadenze.map(i => {
                  const t = dueTone(i)
                  return (
                    <div key={i.id} className="flex between" style={{ alignItems: 'center', gap: 10 }}>
                      <div className="flex gap" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 3, height: 28, borderRadius: 2, background: t?.c || ACCENT }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{i.title}</div>
                          <div className="faint" style={{ fontSize: 11.5 }}>{tr(KINDS.find(k => k.k === i.kind)?.l || '')}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: t?.c, whiteSpace: 'nowrap', fontWeight: 700 }}>{fmtDate(i.due_date)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {lastReport && (
            <div className="card">
              <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 10 }}>{tr('Ultimo report')}</div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{lastReport.title}</div>
              <div className="faint" style={{ fontSize: 12 }}>{lastReport.period || fmtDate(lastReport.created_at)}</div>
              <div className="flex gap" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                {(lastReport.attachments || []).map(a => (
                  <button key={a.path} className="btn btn-sm" onClick={() => openDoc(a.path, tr('Impossibile aprire il documento'))}>
                    <Icon name="download" size={13} /> {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ItemCard({ i, canManage, isPlayer, onEdit, onRespond, onComplete, onDelete }: {
  i: WealthItem; canManage: boolean; isPlayer: boolean
  onEdit: () => void; onRespond: () => void; onComplete: () => void; onDelete: () => Promise<void>
}) {
  const { t: tr } = useLang()
  const t = ['task', 'richiesta', 'scadenza'].includes(i.kind) ? dueTone(i) : null
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
          {t && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: t.c, whiteSpace: 'nowrap' }}>
            {tr(t.l).replace('{n}', String(t.n))}</span>}
        </div>
        {i.description && <div className="faint" style={{ fontSize: 12.5, marginTop: 9, whiteSpace: 'pre-wrap' }}>{i.description}</div>}
        {(i.amount || i.due_date) && (
          <div className="grid g2" style={{ gap: 8, marginTop: 12 }}>
            {i.amount ? <Info k={tr('Importo')} v={fmtMoney(i.amount)} /> : null}
            {i.due_date ? <Info k={tr('Scadenza')} v={fmtDate(i.due_date)} /> : null}
          </div>
        )}
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
        {((i.response_attachments && i.response_attachments.length > 0) || i.response_note) && (
          <div style={{ marginTop: 11, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ ...kicker, fontSize: 9.5, color: OK, marginBottom: 6 }}>{tr("Risposta dell'atleta")}</div>
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>
              {(i.response_attachments || []).map(a => (
                <button key={a.path} className="btn btn-ghost btn-sm" onClick={() => openDoc(a.path, tr('Impossibile aprire il documento'))}>
                  <Icon name="download" size={12} /> {a.name}
                </button>
              ))}
            </div>
            {i.response_note && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{i.response_note}</div>}
          </div>
        )}
        <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
          {isPlayer && i.status === 'aperto' && ['task', 'richiesta'].includes(i.kind) && (
            <button className="btn btn-sm" onClick={onRespond}>
              <Icon name={i.kind === 'richiesta' ? 'upload' : 'check'} size={12} /> {i.kind === 'richiesta' ? tr('Rispondi') : tr('Fatto')}
            </button>
          )}
          {canManage && i.status === 'aperto' && ['task', 'scadenza'].includes(i.kind) && (
            <button className="btn btn-sm" style={{ background: OK, color: '#fff', fontWeight: 800, border: 'none' }} onClick={onComplete}>{tr('Segna completato')}</button>
          )}
          {canManage && <button className="btn btn-ghost btn-sm" onClick={onEdit}>{tr('Modifica')}</button>}
          {canManage && <ConfirmButton onConfirm={onDelete}>{tr('Elimina')}</ConfirmButton>}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, marginTop: 2,
                    borderBottom: `2px solid ${tone || 'var(--border)'}`, display: 'inline-block', paddingBottom: 2 }}>{value}</div>
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

function FileList({ files, onRemove }: { files: File_[]; onRemove: (p: string) => void }) {
  const { t: tr } = useLang()
  if (!files.length) return null
  return (
    <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
      {files.map(a => (
        <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
          <span className="flex gap" style={{ alignItems: 'center', gap: 7, minWidth: 0 }}>
            <Icon name="file" size={15} />
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => onRemove(a.path)}>{tr('Rimuovi')}</button>
        </div>
      ))}
    </div>
  )
}

function ItemForm({ value, playerId, onClose, onSaved }: {
  value: Partial<WealthItem>; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
  const [f, setF] = useState<Partial<WealthItem>>(value)
  const [atts, setAtts] = useState<File_[]>(value.attachments || [])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof WealthItem, v: any) => setF(p => ({ ...p, [k]: v }))
  const isDoc = f.kind === 'report' || f.kind === 'documento'

  async function save() {
    if (!f.title) return
    setBusy(true)
    const payload = {
      player_id: playerId, kind: f.kind || 'task', category: f.category || null, title: f.title,
      description: f.description || null, amount: f.amount ? Number(f.amount) : null,
      due_date: isDoc ? null : (f.due_date || null), period: f.period || null,
      status: f.status || 'aperto', attachments: atts, updated_at: new Date().toISOString(),
    }
    const { error } = f.id ? await updateRow('crm_wealth_items', f.id, payload) : await insertRow('crm_wealth_items', payload)
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    onSaved()
  }

  return (
    <Modal title={f.id ? tr('Modifica voce') : tr('Nuova voce')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !f.title} onClick={save}>{busy ? tr('Salvo…') : tr('Salva')}</button>
      </>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Tipo')}>
          <Select value={f.kind || 'task'} onChange={e => set('kind', e.target.value)}>
            {KINDS.map(k => <option key={k.k} value={k.k}>{tr(k.l)}</option>)}
          </Select>
        </Field>
        <Field label={tr('Categoria')}>
          <Select value={f.category || ''} onChange={e => set('category', e.target.value)}>
            <option value="">{tr('— seleziona —')}</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{tr(c)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={tr('Titolo')}><Input value={f.title || ''} onChange={e => set('title', e.target.value)}
        placeholder={isDoc ? tr('Es. Report trimestrale Q3 2026') : f.kind === 'richiesta' ? tr('Es. Estratti conto 2025') : tr('Es. Firma mandato di consulenza')} /></Field>
      <div className="grid g2" style={{ gap: 10 }}>
        {isDoc
          ? <Field label={tr('Periodo')}><Input value={f.period || ''} onChange={e => set('period', e.target.value)} placeholder={tr('Es. Q3 2026')} /></Field>
          : <Field label={f.kind === 'scadenza' ? tr('Scadenza') : tr('Entro il')}>
              <Input type="date" value={f.due_date || ''} onChange={e => set('due_date', e.target.value)} />
            </Field>}
        <Field label={tr('Importo (€)')}><Input type="number" value={f.amount ?? ''} onChange={e => set('amount', e.target.value)} placeholder={tr('facoltativo')} /></Field>
      </div>
      <Field label={tr('Descrizione')}><Textarea rows={3} value={f.description || ''} onChange={e => set('description', e.target.value)}
        placeholder={f.kind === 'richiesta' ? tr('Cosa serve esattamente') : tr('Note e istruzioni')} /></Field>
      <div style={{ marginTop: 4 }}>
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>{tr('Allegati')}</div>
        <FileList files={atts} onRemove={p => setAtts(prev => prev.filter(x => x.path !== p))} />
        <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> {uploading ? tr('Carico…') : tr('Aggiungi allegato')}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={async e => {
          setUploading(true); const up = await uploadFiles(playerId, e.target.files); setAtts(p => [...p, ...up])
          setUploading(false); e.target.value = ''
        }} />
      </div>
    </Modal>
  )
}

// Risposta dell'atleta: task fatto (con nota) o documenti caricati per una richiesta.
function RespondForm({ item, playerId, onClose, onSaved }: {
  item: WealthItem; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
  const [atts, setAtts] = useState<File_[]>(item.response_attachments || [])
  const [note, setNote] = useState(item.response_note || '')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const needsFiles = item.kind === 'richiesta'

  async function send() {
    setBusy(true)
    const { error } = await updateRow('crm_wealth_items', item.id, {
      response_attachments: atts, response_note: note || null,
      status: 'completato', completed_at: new Date().toISOString(),
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Fatto, il tuo wealth manager riceve una notifica'))
    onSaved()
  }

  return (
    <Modal title={item.title} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || (needsFiles && atts.length === 0)} onClick={send}>
          {busy ? tr('Invio…') : needsFiles ? tr('Invia e smarca') : tr('Segna come fatto')}
        </button>
      </>}>
      {item.description && (
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 12, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10, whiteSpace: 'pre-wrap' }}>
          {item.description}
        </div>
      )}
      <FileList files={atts} onRemove={p => setAtts(prev => prev.filter(x => x.path !== p))} />
      <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={14} /> {uploading ? tr('Carico…') : needsFiles ? tr('Carica documento') : tr('Allega un file (facoltativo)')}
      </button>
      <input ref={fileRef} type="file" multiple hidden onChange={async e => {
        setUploading(true); const up = await uploadFiles(playerId, e.target.files); setAtts(p => [...p, ...up])
        setUploading(false); e.target.value = ''
      }} />
      <Field label={tr('Nota (facoltativa)')}>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
      </Field>
    </Modal>
  )
}

function OverviewForm({ value, playerId, onClose, onSaved }: {
  value: Overview | null; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
  const { session } = useAuth()
  const [f, setF] = useState<Partial<Overview>>(value || { currency: 'EUR' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Overview, v: any) => setF(p => ({ ...p, [k]: v }))
  const num = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v))

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('crm_wealth_overview').upsert({
      player_id: playerId, currency: f.currency || 'EUR',
      total_assets: num(f.total_assets), liquidity: num(f.liquidity), invested: num(f.invested),
      real_estate: num(f.real_estate), other_assets: num(f.other_assets),
      risk_profile: f.risk_profile || null, horizon: f.horizon || null, goals: f.goals || null,
      next_meeting: f.next_meeting || null, notes: f.notes || null,
      updated_by: session?.user.id, updated_at: new Date().toISOString(),
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Quadro aggiornato')); onSaved()
  }

  return (
    <Modal title={tr('Quadro del patrimonio')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? tr('Salvo…') : tr('Salva')}</button>
      </>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Patrimonio seguito')}><Input type="number" value={f.total_assets ?? ''} onChange={e => set('total_assets', e.target.value)} placeholder={tr('vuoto = somma delle voci')} /></Field>
        <Field label={tr('Valuta')}>
          <Select value={f.currency || 'EUR'} onChange={e => set('currency', e.target.value)}>
            {['EUR', 'CHF', 'USD', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={tr('Liquidità')}><Input type="number" value={f.liquidity ?? ''} onChange={e => set('liquidity', e.target.value)} /></Field>
        <Field label={tr('Investimenti')}><Input type="number" value={f.invested ?? ''} onChange={e => set('invested', e.target.value)} /></Field>
        <Field label={tr('Immobili')}><Input type="number" value={f.real_estate ?? ''} onChange={e => set('real_estate', e.target.value)} /></Field>
        <Field label={tr('Altro')}><Input type="number" value={f.other_assets ?? ''} onChange={e => set('other_assets', e.target.value)} /></Field>
        <Field label={tr('Profilo di rischio')}>
          <Select value={f.risk_profile || ''} onChange={e => set('risk_profile', e.target.value)}>
            <option value="">{tr('— seleziona —')}</option>
            {RISK.map(r => <option key={r} value={r}>{tr(r)}</option>)}
          </Select>
        </Field>
        <Field label={tr('Orizzonte')}><Input value={f.horizon || ''} onChange={e => set('horizon', e.target.value)} placeholder={tr('Es. 10+ anni')} /></Field>
        <Field label={tr('Prossimo incontro')}><Input type="date" value={f.next_meeting || ''} onChange={e => set('next_meeting', e.target.value)} /></Field>
      </div>
      <Field label={tr('Obiettivi')}><Textarea rows={3} value={f.goals || ''} onChange={e => set('goals', e.target.value)}
        placeholder={tr('Es. reddito dopo la carriera, casa, protezione della famiglia')} /></Field>
      <Field label={tr('Note')}><Textarea rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}
