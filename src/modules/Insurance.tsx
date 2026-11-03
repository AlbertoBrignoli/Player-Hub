import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton, Section } from '../components/ui'
import { useRouteParam } from '../lib/route'
import Icon from '../components/Icon'
import { OffersTab, EditorialTab, EDITORIAL_DEFAULTS } from './InsuranceStore'
import { fmtDate, fmtMoney } from '../lib/format'
import { useItemPeople, PeopleRow, ItemPeopleModal } from '../components/ItemPeople'

// Area assicurativa dell'atleta: una sola pagina a sezioni (niente schede interne).
// Prima ciò che scade, poi le polizze (sport e personale), poi spesa e coperture,
// anagrafica e, in fondo, i contenuti del broker. I documenti li carica l'assicuratore.
const ACCENT = '#0A0A0A'      // accento unico AUVI: le aree si distinguono per titolo e icona, non per colore
const WARN = '#8A6D00'
const DANGER = '#E53F00'
const OK = '#12A150'
const BUCKET = 'insurance-docs'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

// I due mondi delle polizze, ciascuno con la sua sezione.
const POLICY_AREAS = [
  { k: 'sport', l: 'Polizze sport', hint: 'Coperture legate alla carriera' },
  { k: 'personale', l: 'Polizze personali', hint: 'Casa, veicoli, famiglia' },
]

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
  // l è la chiave di traduzione: {n} si sostituisce al momento del render
  if (n < 0) return { c: DANGER, l: 'Scaduta', n }
  if (n <= 30) return { c: DANGER, l: 'Scade tra {n} g', n }
  if (n <= 60) return { c: WARN, l: 'Scade tra {n} g', n }
  return { c: OK, l: 'Scade tra {n} g', n }
}

async function openDoc(path: string, errMsg = 'Impossibile aprire il documento') {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error || !data?.signedUrl) { toast(errMsg, 'err'); return }
  window.open(data.signedUrl, '_blank')
}

export default function Insurance() {
  const { role, session } = useAuth()
  const { athleteId } = useAthlete()
  const { t: tr } = useLang()
  // L'assicuratore vede solo i suoi contenuti (Proposte · Il broker · Perché); l'atleta anche le sue polizze.
  const isInsurerRole = role === 'assicuratore'
  const [edit, setEdit] = useState<Partial<Policy> | null>(null)
  // Contenuti del broker: per l'atleta sono secondari, si aprono a richiesta in fondo alla pagina.
  const [showStore, setShowStore] = useState(false)

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
  const { people, reload: reloadPeople } = useItemPeople('insurance', rows.map(r => r.id))
  const [thread, setThread] = useState<Policy | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const uploadArea = useRef<string>('sport')
  const [quickBusy, setQuickBusy] = useState(false)

  // apertura diretta di una polizza (insurance?item=<id>): scorre fino alla scheda e la evidenzia
  const itemParam = useRouteParam('item')
  useEffect(() => {
    if (!itemParam || loading) return
    const t = setTimeout(() => document.getElementById(`ins-${itemParam}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [itemParam, loading])

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
      area: uploadArea.current,
      status: 'attiva',
      title: file.name.replace(/\.[^.]+$/, ''),
      attachments: [{ name: file.name, path, size: file.size, mime: file.type }],
    })
    toast(tr('Documento caricato: completa i dati'))
  }

  // Da sistemare: polizze scadute o in scadenza entro 60 giorni, dalla più urgente.
  const urgenti = useMemo(
    () => rows.filter(p => { const n = daysTo(p.expiry_date); return p.status !== 'disdetta' && n !== null && n <= 60 })
              .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || '')),
    [rows])

  if (loading) return <Spinner />

  const uid = session?.user.id || null
  const storeBlocks = (
    <div className="grid" style={{ gap: 18 }}>
      <OffersTab athleteId={athleteId} isInsurer={isInsurerRole} canInterest={role === 'player'} uid={uid} />
      <EditorialTab slug="broker" isInsurer={isInsurerRole} uid={uid}
        defaultTitle={EDITORIAL_DEFAULTS.broker.title} defaultBody={EDITORIAL_DEFAULTS.broker.body} />
      <EditorialTab slug="why" isInsurer={isInsurerRole} uid={uid}
        defaultTitle={EDITORIAL_DEFAULTS.why.title} defaultBody={EDITORIAL_DEFAULTS.why.body} />
    </div>
  )

  // Assicuratore: la pagina è il suo "negozio" (proposte e testi) più l'anagrafica dell'atleta scelto.
  if (isInsurerRole) {
    return (
      <div className="grid" style={{ gap: 22 }}>
        {storeBlocks}
        {athleteId && <AnagraficaCard athleteId={athleteId} canEdit={false} />}
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 22 }}>
      <input ref={quickRef} type="file" hidden onChange={quickUpload} />

      {/* --- 1. da sistemare: scadute e in scadenza --- */}
      {urgenti.length > 0 && (
        <Section title={tr('Prossime scadenze')} sub={tr('Sono anche in agenda')}>
          <div className="card grid" style={{ gap: 8 }}>
            {urgenti.map(p => {
              const t = expiryTone(p.expiry_date)
              return (
                <div key={p.id} className="flex between" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onClick={() => document.getElementById(`ins-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 28, borderRadius: 2, background: t?.c || ACCENT }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t-item" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div className="t-meta">
                        {[p.category && tr(p.category), p.company].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div className="t-body">{fmtDate(p.expiry_date)}</div>
                    {t && <div className="t-meta" style={{ fontWeight: 800, color: t.c }}>{tr(t.l).replace('{n}', String(t.n))}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* --- 2. le polizze, una sezione per mondo --- */}
      {POLICY_AREAS.map(a => {
        const list = rows.filter(p => p.area === a.k)
        const attive = list.filter(p => p.status === 'attiva').length
        return (
          <Section key={a.k} title={tr(a.l)}
            sub={`${tr(a.hint)} · ${tr('Polizze attive')}: ${attive}`}
            action={canManage ? (
              <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-sm" disabled={quickBusy}
                  onClick={() => { uploadArea.current = a.k; quickRef.current?.click() }}>
                  <Icon name="upload" size={13} /> {quickBusy ? tr('Carico…') : tr('Carica polizza')}
                </button>
                <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff', fontWeight: 800, border: 'none' }}
                  onClick={() => setEdit({ area: a.k, status: 'attiva' })}>
                  <Icon name="plus" size={13} /> {tr('Nuova polizza')}
                </button>
              </div>
            ) : undefined}>
            {list.length === 0 ? (
              <div className="card">
                <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />}
                  title={tr('Nessuna polizza in questa area')}
                  hint={canManage
                    ? tr('Carica il documento della polizza o inseriscila a mano.')
                    : tr('Il tuo assicuratore le caricherà qui.')} />
              </div>
            ) : (
              <div className="grid g2" style={{ gap: 12 }}>
                {list.map(p => (
                  <PolicyCard key={p.id} p={p} highlight={p.id === itemParam} canManage={canManage}
                    people={people[p.id] || []}
                    onThread={() => setThread(p)} onPay={() => setPayFor(p)} onEdit={() => setEdit(p)}
                    onDelete={async () => { await deleteRow('crm_insurance_policies', p.id); reload() }} />
                ))}
              </div>
            )}
          </Section>
        )
      })}

      {/* --- 3. spesa e coperture (riepilogo) --- */}
      <Overview rows={rows} pays={pays} />

      {/* --- 4. anagrafica (dati bancari e identità) --- */}
      <AnagraficaCard athleteId={athleteId} canEdit={role === 'admin' || role === 'player'} />

      {/* --- 5. contenuti del broker: secondari, aperti a richiesta --- */}
      <Section title={tr('Dal tuo assicuratore')} sub={tr('Proposte, il broker e perché assicurarti')}
        action={
          <button className="btn btn-sm" onClick={() => setShowStore(v => !v)}>
            <Icon name={showStore ? 'x' : 'eye'} size={13} /> {showStore ? tr('Nascondi') : tr('Mostra')}
          </button>
        }>
        {showStore && storeBlocks}
      </Section>

      {payFor && athleteId && (
        <PaymentForm policy={payFor} playerId={athleteId}
          onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); reloadPays() }} />
      )}

      {thread && athleteId && (
        <ItemPeopleModal kind="insurance" itemId={thread.id} playerId={athleteId} title={thread.title}
          sub={[thread.category && tr(thread.category), thread.company].filter(Boolean).join(' · ')}
          people={people[thread.id] || []} onPeople={reloadPeople} onClose={() => setThread(null)} />
      )}
      {edit && athleteId && (
        <PolicyForm value={edit} playerId={athleteId}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />
      )}
    </div>
  )
}

// Scheda di una polizza: dati essenziali, allegati, persone coinvolte e azioni.
function PolicyCard({ p, highlight, canManage, people, onThread, onPay, onEdit, onDelete }: {
  p: Policy; highlight: boolean; canManage: boolean; people: Parameters<typeof PeopleRow>[0]['people']
  onThread: () => void; onPay: () => void; onEdit: () => void; onDelete: () => void
}) {
  const { t: tr } = useLang()
  const t = expiryTone(p.expiry_date)
  return (
    <div id={`ins-${p.id}`} className="card"
      style={{ padding: 0, overflow: 'hidden', scrollMarginTop: 80, ...(highlight ? { boxShadow: `0 0 0 2px ${ACCENT}` } : {}) }}>
      <div style={{ height: 3, background: t?.c || ACCENT }} />
      <div style={{ padding: 16 }}>
        <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="t-item">{p.title}</div>
            <div className="t-meta" style={{ marginTop: 2 }}>
              {[p.category && tr(p.category), p.company].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          {t && (
            <span className="t-meta" style={{ fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase',
                           color: t.c, whiteSpace: 'nowrap' }}>{tr(t.l).replace('{n}', String(t.n))}</span>
          )}
        </div>

        <div className="grid g2" style={{ gap: 8, marginTop: 13 }}>
          <Info k={tr('Numero polizza')} v={p.policy_number} />
          <Info k={tr('Scadenza')} v={p.expiry_date ? fmtDate(p.expiry_date) : null} />
          <Info k={tr('Assicurato')} v={p.insured_party} />
          <Info k={tr('Massimale')} v={p.coverage_amount ? fmtMoney(p.coverage_amount) : null} />
          <Info k={tr('Premio')} v={p.premium ? `${fmtMoney(p.premium)}${p.payment_frequency ? ' · ' + tr(p.payment_frequency) : ''}` : null} />
          <Info k={tr('Franchigia')} v={p.deductible} />
        </div>

        {p.attachments && p.attachments.length > 0 && (
          <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
            {p.attachments.map(a => (
              <button key={a.path} className="btn btn-sm" title={a.name}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 230 }}
                onClick={() => openDoc(a.path, tr('Impossibile aprire il documento'))}>
                <Icon name="download" size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              </button>
            ))}
          </div>
        )}

        {p.notes && <div className="t-meta" style={{ marginTop: 11 }}>{p.notes}</div>}
        <PeopleRow people={people} onOpen={onThread} />

        {canManage && (
          <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={onPay}>
              <Icon name="plus" size={12} /> {tr('Pagamento')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>{tr('Modifica')}</button>
            <ConfirmButton onConfirm={onDelete}>{tr('Elimina')}</ConfirmButton>
          </div>
        )}
      </div>
    </div>
  )
}


// Dashboard aggregata: costo annuo totale, ripartizione e mappa delle coperture.
// I dati arrivano dai campi compilati: nessuna elaborazione automatica del PDF.
function Overview({ rows, pays }: { rows: Policy[]; pays: Payment[] }) {
  const { t: tr } = useLang()
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
      const k = p.category || 'Altro' // chiave: tradotta al render
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
        `    - ${x.name}${x.amount ? ` (${tr('massimale')} ${x.amount} €)` : ''}${x.note ? ` — ${x.note}` : ''}`).join('\n')
      return [
        `${tr('POLIZZA')}: ${p.title}`,
        `  ${tr('Area')}: ${p.area === 'sport' || p.area === 'personale' ? tr(p.area === 'sport' ? 'Sport' : 'Personale') : p.area} · ${tr('Categoria')}: ${p.category ? tr(p.category) : '—'}`,
        `  ${tr('Compagnia')}: ${p.company || '—'} · ${tr('N.')} ${p.policy_number || '—'}`,
        `  ${tr('Assicurato')}: ${p.insured_party || '—'} · ${tr('Contraente')}: ${p.holder || '—'}`,
        `  ${tr('Decorrenza')}: ${p.start_date || '—'} · ${tr('Scadenza')}: ${p.expiry_date || '—'}`,
        `  ${tr('Premio')}: ${p.premium ?? '—'} € ${p.payment_frequency ? tr(p.payment_frequency) : ''} → ${tr('costo annuo')} ${annualCost(p)} €`,
        `  ${tr('Massimale')}: ${p.coverage_amount ?? '—'} € · ${tr('Franchigia')}: ${p.deductible || '—'}`,
        g ? `  ${tr('Garanzie')}:\n${g}` : `  ${tr('Garanzie')}: ${tr('non dettagliate')}`,
        p.notes ? `  ${tr('Note')}: ${p.notes}` : '',
      ].filter(Boolean).join('\n')
    }).join('\n\n')

    const testo = `${tr('RIEPILOGO ASSICURATIVO')}\n${tr('Costo annuo totale')}: ${totale} €\n${tr('Polizze attive')}: ${attive.length}\n\n${righe}`
    navigator.clipboard.writeText(testo)
      .then(() => toast(tr('Riepilogo copiato: incollalo nel tuo assistente AI')))
      .catch(() => toast(tr('Copia non riuscita'), 'err'))
  }

  // Senza polizze le sezioni sopra mostrano già il proprio stato vuoto.
  if (attive.length === 0) return null

  const anno = new Date().getFullYear()
  const speso = pays.filter(x => new Date(x.paid_on).getFullYear() === anno)
                    .reduce((s, x) => s + Number(x.amount || 0), 0)
  const pctSpeso = totale > 0 ? Math.min(100, Math.round((speso / totale) * 100)) : 0

  return <>
      {/* spesa annua prevista + spesa effettiva dell'anno */}
      <Section title={tr('Spesa assicurativa annua')}
        sub={tr('su {n} polizze · {m} al mese').replace('{n}', String(attive.length)).replace('{m}', fmtMoney(totale / 12))}>
        <div className="grid" style={{ gap: 12 }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20,
                        background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>{fmtMoney(totale)}</div>
            <div className="flex gap" style={{ gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
              {perArea.map(a => (
                <Metric key={a.area}
                  label={a.area === 'sport' ? tr('Sport') : tr('Personale')}
                  value={fmtMoney(a.costo)} tone={ACCENT} />
              ))}
            </div>
          </div>

          {pays.length > 0 && (
            <div className="card">
              <div className="flex between" style={{ alignItems: 'center', marginBottom: 10 }}>
                <div className="t-label">{tr('Speso nel {anno}').replace('{anno}', String(anno))}</div>
                <span className="t-meta">{tr('{n} pagamenti registrati').replace('{n}', String(pays.length))}</span>
              </div>
              <div className="flex gap" style={{ gap: 26, flexWrap: 'wrap', marginBottom: 12 }}>
                <Metric label={tr("Effettivo")} value={fmtMoney(speso)} tone={OK} />
                <Metric label={tr("Previsto")} value={fmtMoney(totale)} tone={ACCENT} />
                <Metric label={tr("Differenza")} value={fmtMoney(speso - totale)} tone={speso > totale ? DANGER : OK} />
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${pctSpeso}%`, height: '100%', background: OK }} />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ripartizione per categoria */}
      <Section title={tr('Dove vanno i soldi')}>
        <div className="card grid" style={{ gap: 9 }}>
          {perCat.map(([cat, costo]) => {
            const pct = totale > 0 ? Math.round((costo / totale) * 100) : 0
            return (
              <div key={cat}>
                <div className="flex between" style={{ marginBottom: 4 }}>
                  <span className="t-body" style={{ fontWeight: 600 }}>{tr(cat)}</span>
                  <span className="t-meta">{fmtMoney(costo)} · {pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* per cosa sono coperto */}
      <Section title={tr('Per cosa sei coperto')} sub={tr('{n} garanzie').replace('{n}', String(garanzie.length))}>
        <div className="card">
          {garanzie.length === 0 ? (
            <div className="t-meta">
              {tr('Le garanzie non sono ancora state dettagliate. Chiedi al tuo assicuratore di compilarle: compariranno qui, polizza per polizza.')}
            </div>
          ) : (
            <div className="grid" style={{ gap: 8 }}>
              {garanzie.map((g, i) => (
                <div key={i} className="flex between" style={{ alignItems: 'flex-start', gap: 10,
                       borderBottom: i < garanzie.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t-item">{g.name}</div>
                    <div className="t-meta">
                      {g.polizza}{g.note ? ` · ${g.note}` : ''}
                    </div>
                  </div>
                  {g.amount ? (
                    <div className="t-body" style={{ fontWeight: 800, color: ACCENT, whiteSpace: 'nowrap' }}>
                      {fmtMoney(g.amount)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* esportazione per analisi AI */}
      <Section title={tr('Analisi con AI')}
        sub={tr('Copia il riepilogo completo delle tue polizze e incollalo in ChatGPT o Claude per farti spiegare coperture, sovrapposizioni e buchi di tutela.')}
        action={
          <button className="btn btn-sm" onClick={copiaRiepilogo}>
            <Icon name="copy" size={13} /> {tr('Copia riepilogo per AI')}
          </button>
        }>
        {null}
      </Section>
  </>
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 11, color: 'var(--text-dim)' }}>{label}</div>
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
      <div className="t-label">{k}</div>
      <div style={{ fontSize: 12.5, marginTop: 1 }}>{v || '—'}</div>
    </div>
  )
}

// Registrazione di un pagamento: alimenta la spesa effettiva dell'anno.
function PaymentForm({ policy, playerId, onClose, onSaved }: {
  policy: Policy; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
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
    <Modal title={`${tr('Pagamento')} · ${policy.title}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !amount} onClick={save}>{busy ? tr('Salvo…') : tr('Registra')}</button>
      </>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Importo (€)')}><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label={tr('Data')}><Input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></Field>
      </div>
      <Field label={tr('Metodo')}>
        <Select value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">—</option>
          <option value="bonifico">{tr('Bonifico')}</option>
          <option value="carta">{tr('Carta')}</option>
          <option value="RID">{tr('Addebito automatico')}</option>
          <option value="contanti">{tr('Contanti')}</option>
        </Select>
      </Field>
      <Field label={tr('Note')}><Input value={note} onChange={e => setNote(e.target.value)} placeholder={tr('Es. prima rata 2026')} /></Field>
    </Modal>
  )
}

function PolicyForm({ value, playerId, onClose, onSaved }: {
  value: Partial<Policy>; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
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
    <Modal wide title={f.id ? tr('Modifica polizza') : tr('Nuova polizza')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !f.title} onClick={save}>{busy ? tr('Salvo…') : tr('Salva')}</button>
      </>}>
      {!f.id && (f.attachments?.length ?? 0) > 0 && (
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 10, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10 }}>
          {tr('Documento allegato. Compila i dati essenziali:')} <b>{tr('area')}</b>, <b>{tr('categoria')}</b>,
          <b> {tr('importo')}</b> {tr('e')} <b>{tr('scadenza')}</b> — {tr('bastano per la dashboard dei costi.')}
        </div>
      )}
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Area')}>
          <Select value={f.area || 'sport'} onChange={e => { set('area', e.target.value); set('category', '') }}>
            <option value="sport">{tr('Sport')}</option>
            <option value="personale">{tr('Personale')}</option>
          </Select>
        </Field>
        <Field label={tr('Categoria')}>
          <Select value={f.category || ''} onChange={e => set('category', e.target.value)}>
            <option value="">{tr('— seleziona —')}</option>
            {cats.map(c => <option key={c} value={c}>{tr(c)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={tr('Titolo')}><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder={tr('Es. Infortuni professionali')} /></Field>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Compagnia')}><Input value={f.company || ''} onChange={e => set('company', e.target.value)} /></Field>
        <Field label={tr('Intermediario')}><Input value={f.broker || ''} onChange={e => set('broker', e.target.value)} /></Field>
        <Field label={tr('Numero polizza')}><Input value={f.policy_number || ''} onChange={e => set('policy_number', e.target.value)} /></Field>
        <Field label={tr('Contraente')}><Input value={f.holder || ''} onChange={e => set('holder', e.target.value)} /></Field>
        <Field label={tr('Assicurato')}><Input value={f.insured_party || ''} onChange={e => set('insured_party', e.target.value)} placeholder={tr('Es. atleta, coniuge, figlio')} /></Field>
        <Field label={tr('Stato')}>
          <Select value={f.status || 'attiva'} onChange={e => set('status', e.target.value)}>
            <option value="attiva">{tr('Attiva')}</option>
            <option value="in_rinnovo">{tr('In rinnovo')}</option>
            <option value="scaduta">{tr('Scaduta')}</option>
            <option value="disdetta">{tr('Disdetta')}</option>
          </Select>
        </Field>
        <Field label={tr('Decorrenza')}><Input type="date" value={f.start_date || ''} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label={tr('Scadenza')}><Input type="date" value={f.expiry_date || ''} onChange={e => set('expiry_date', e.target.value)} /></Field>
        <Field label={f.premium_is_annual ? tr('Premio annuo (€)') : tr('Premio per rata (€)')}>
          <Input type="number" value={f.premium ?? ''} onChange={e => set('premium', e.target.value)} />
        </Field>
        <Field label={tr('Frequenza')}>
          <Select value={f.payment_frequency || ''} onChange={e => set('payment_frequency', e.target.value)}>
            <option value="">—</option>
            <option value="annuale">{tr('Annuale')}</option>
            <option value="semestrale">{tr('Semestrale')}</option>
            <option value="trimestrale">{tr('Trimestrale')}</option>
            <option value="mensile">{tr('Mensile')}</option>
          </Select>
        </Field>
        <Field label={tr('Costo annuo')}>
          <div style={{ padding: '9px 2px' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: ACCENT }}>
              {annualCost(f) ? fmtMoney(annualCost(f)) : '—'}
            </div>
            <label className="flex gap" style={{ gap: 7, fontSize: 12.5, cursor: 'pointer', marginTop: 5 }}>
              <input type="checkbox" checked={!!f.premium_is_annual}
                onChange={e => set('premium_is_annual', e.target.checked)} />
              {tr("L'importo inserito è già il totale annuo")}
            </label>
          </div>
        </Field>
        <Field label={tr('Massimale (€)')}><Input type="number" value={f.coverage_amount ?? ''} onChange={e => set('coverage_amount', e.target.value)} /></Field>
        <Field label={tr('Franchigia')}><Input value={f.deductible || ''} onChange={e => set('deductible', e.target.value)} /></Field>
      </div>
      <Field label={tr('Note')}><Textarea rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>

      <div style={{ marginTop: 4 }}>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 8 }}>
          <div style={{ ...kicker, color: 'var(--text-dim)' }}>{tr('Garanzie · per cosa copre')}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setCov(prev => [...prev, { name: '' }])}>
            <Icon name="plus" size={12} /> {tr('Aggiungi garanzia')}
          </button>
        </div>
        {cov.length === 0 ? (
          <div className="faint" style={{ fontSize: 12.5, marginBottom: 10 }}>
            {tr('Es. "Invalidità permanente" · 500.000 € — alimentano la dashboard delle coperture.')}
          </div>
        ) : (
          <div className="grid" style={{ gap: 7, marginBottom: 10 }}>
            {cov.map((c, i) => (
              <div key={i} className="flex gap" style={{ gap: 7, alignItems: 'center' }}>
                <Input style={{ flex: 2 }} placeholder={tr('Garanzia')} value={c.name}
                  onChange={e => setCovAt(i, 'name', e.target.value)} />
                <Input style={{ flex: 1 }} type="number" placeholder={tr('Massimale €')} value={c.amount ?? ''}
                  onChange={e => setCovAt(i, 'amount', e.target.value ? Number(e.target.value) : null)} />
                <Input style={{ flex: 1.4 }} placeholder={tr('Note')} value={c.note || ''}
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
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>{tr('Documenti')}</div>
        {atts.length > 0 && (
          <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
            {atts.map(a => (
              <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' }}>
                <span className="flex gap" style={{ alignItems: 'center', minWidth: 0, gap: 7 }}>
                  <Icon name="file" size={15} />
                  <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setAtts(prev => prev.filter(x => x.path !== a.path))}>{tr('Rimuovi')}</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> {uploading ? tr('Carico…') : tr('Aggiungi documento')}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
        <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
          {tr("Polizza, condizioni, quietanze: l'atleta li apre e li scarica dal suo telefono.")}
        </div>
      </div>
    </Modal>
  )
}

// Anagrafica dell'atleta per la parte assicurativa: dati bancari e identità.
// Lettura per assicuratore/agenzia/giocatore (RLS), modifica per agenzia e giocatore.
const DOC_TYPES = ['Carta d\'identità', 'Passaporto', 'Patente']

function AnagraficaCard({ athleteId, canEdit }: { athleteId: number | null; canEdit: boolean }) {
  const { session } = useAuth()
  const { t: tr } = useLang()
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (!athleteId) { setData(null); setLoading(false); return }
    setLoading(true)
    const { data: d } = await supabase.from('crm_athlete_anagrafica').select('*').eq('player_id', athleteId).maybeSingle()
    setData(d || null); setLoading(false)
  }
  useEffect(() => { setEditing(false); load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }))
  // Unisce eventuale vecchio documento singolo alla lista multipla.
  const docsOf = (x: any): { name?: string; path: string }[] =>
    [...((x?.id_docs as any[]) || []), ...(x?.id_doc_path ? [{ name: 'Documento', path: x.id_doc_path }] : [])]

  async function save() {
    if (!athleteId) return
    setBusy(true)
    const payload = {
      player_id: athleteId,
      account_holder: form.account_holder || null, fiscal_code: form.fiscal_code || null,
      iban: form.iban || null, bic_swift: form.bic_swift || null,
      bank_name: form.bank_name || null, bank_address: form.bank_address || null,
      id_doc_type: form.id_doc_type || null, id_doc_number: form.id_doc_number || null,
      id_docs: form.id_docs || [], id_doc_path: null,
      updated_at: new Date().toISOString(), updated_by: session?.user.id,
    }
    const { error } = await supabase.from('crm_athlete_anagrafica').upsert(payload, { onConflict: 'player_id' })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Anagrafica salvata')); setEditing(false); load()
  }

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); e.target.value = ''
    if (!files.length || !athleteId) return
    setUploading(true)
    const added: { name: string; path: string }[] = []
    for (const file of files) {
      const path = `${athleteId}/anagrafica-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { toast(`${file.name}: ${up.error.message}`, 'err'); continue }
      added.push({ name: file.name, path })
    }
    setUploading(false)
    if (added.length) {
      setForm((f: any) => ({ ...f, id_docs: [...(f.id_docs || []), ...added] }))
      toast((added.length > 1 ? tr('{n} file caricati') : tr('{n} file caricato')).replace('{n}', String(added.length)))
    }
  }

  if (loading) return null
  const empty = !data
  const d = data || {}

  const Row = ({ k, v, copy }: { k: string; v?: string | null; copy?: boolean }) => (
    <div className="flex between" style={{ alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="faint" style={{ fontSize: 12.5 }}>{k}</span>
      <span className="flex gap" style={{ alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>{v || '—'}</span>
        {copy && v && (
          <button className="btn btn-ghost btn-sm" title={tr('Copia')}
            onClick={() => { navigator.clipboard.writeText(v); toast(tr('Copiato')) }}><Icon name="copy" size={12} /></button>
        )}
      </span>
    </div>
  )

  return (
    <Section title={tr('Anagrafica')} sub={tr("Dati bancari e identità dell'atleta")}
      action={canEdit && !editing ? (
        <button className="btn btn-sm" onClick={() => { setForm({ ...(data || {}), id_docs: docsOf(data) }); setEditing(true) }}>
          <Icon name={empty ? 'plus' : 'edit'} size={13} /> {empty ? tr('Compila') : tr('Modifica')}
        </button>
      ) : undefined}>
    <div className="card">
      {editing ? (
        <div className="grid" style={{ gap: 12, marginTop: 8 }}>
          <Field label={tr('Intestatario')}><Input value={form.account_holder || ''} onChange={e => set('account_holder', e.target.value)} placeholder={tr('Nome e cognome')} /></Field>
          <Field label={tr('Codice fiscale')}><Input value={form.fiscal_code || ''} onChange={e => set('fiscal_code', e.target.value.toUpperCase())} /></Field>
          <Field label="IBAN"><Input value={form.iban || ''} onChange={e => set('iban', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="IT.." /></Field>
          <Field label="BIC / SWIFT"><Input value={form.bic_swift || ''} onChange={e => set('bic_swift', e.target.value.toUpperCase())} /></Field>
          <Field label={tr('Banca')}><Input value={form.bank_name || ''} onChange={e => set('bank_name', e.target.value)} /></Field>
          <Field label={tr('Indirizzo sede della banca')}><Input value={form.bank_address || ''} onChange={e => set('bank_address', e.target.value)} /></Field>
          <div className="flex gap" style={{ gap: 10 }}>
            <Field label={tr('Tipo documento')}><Select value={form.id_doc_type || ''} onChange={e => set('id_doc_type', e.target.value)}>
              <option value="">—</option>{DOC_TYPES.map(t => <option key={t} value={t}>{tr(t)}</option>)}
            </Select></Field>
            <Field label={tr('Numero documento')}><Input value={form.id_doc_number || ''} onChange={e => set('id_doc_number', e.target.value)} /></Field>
          </div>
          <div>
            <div className="faint" style={{ fontSize: 12.5, marginBottom: 6 }}>{tr('Documenti (identità, tessera sanitaria, ecc.) — puoi caricarne più insieme')}</div>
            {(form.id_docs || []).length > 0 && (
              <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
                {(form.id_docs || []).map((doc: any, i: number) => (
                  <div key={i} className="flex between" style={{ alignItems: 'center', gap: 10,
                    border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' }}>
                    <span className="flex gap" style={{ alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Icon name="file" size={13} /> <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(doc.name || 'Documento')}</span>
                    </span>
                    <span className="flex gap" style={{ gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDoc(doc.path, tr('Impossibile aprire il documento'))}>{tr('Apri')}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setForm((f: any) => ({ ...f, id_docs: (f.id_docs || []).filter((_: any, j: number) => j !== i) }))}>{tr('Rimuovi')}</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={13} /> {uploading ? tr('Carico…') : tr('Carica file')}
            </button>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={uploadDoc} />
          </div>
          <div className="flex gap" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? tr('Salvo…') : tr('Salva')}</button>
            <button className="btn" onClick={() => setEditing(false)}>{tr('Annulla')}</button>
          </div>
        </div>
      ) : empty ? (
        <div className="faint" style={{ fontSize: 12.5, padding: '10px 0' }}>
          {tr('Anagrafica non ancora compilata.')}{canEdit ? ' ' + tr('Premi "Compila" per aggiungerla.') : ''}
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <Row k={tr('Intestatario')} v={d.account_holder} />
          <Row k={tr('Codice fiscale')} v={d.fiscal_code} copy />
          <Row k="IBAN" v={d.iban} copy />
          <Row k="BIC / SWIFT" v={d.bic_swift} copy />
          <Row k={tr('Banca')} v={d.bank_name} />
          <Row k={tr('Indirizzo sede banca')} v={d.bank_address} />
          <Row k={tr('Documento')} v={[d.id_doc_type && tr(d.id_doc_type), d.id_doc_number].filter(Boolean).join(' · ')} />
          {docsOf(d).length > 0 && (
            <div style={{ paddingTop: 12 }}>
              <div className="faint" style={{ fontSize: 12.5, marginBottom: 6 }}>{tr('Documenti allegati')}</div>
              <div className="grid" style={{ gap: 6 }}>
                {docsOf(d).map((doc, i) => (
                  <button key={i} className="btn btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => openDoc(doc.path, tr('Impossibile aprire il documento'))}>
                    <Icon name="file" size={13} /> {tr(doc.name || 'Documento')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </Section>
  )
}
