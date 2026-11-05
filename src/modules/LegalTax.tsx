import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton, Section } from '../components/ui'
import Icon from '../components/Icon'
import ChatDocs from '../components/ChatDocs'
import { fmtDate, fmtMoney } from '../lib/format'
import { useLang } from '../lib/i18n'
import { useItemPeople, PeopleRow, ItemPeopleModal } from '../components/ItemPeople'
import { useRouteParam } from '../lib/route'
import { RequestSteps, useRequesters } from '../components/DocRequests'

// Area legale e fiscale: pagamenti, documenti del commercialista
// e sue richieste che l'atleta deve smarcare.
const ACCENT = '#0A0A0A'   // accento unico AUVI: le aree si distinguono per titolo e icona, non per colore
const WARN = '#8A6D00'
const DANGER = '#E53F00'
const OK = '#12A150'
const BUCKET = 'tax-docs'

const kicker: React.CSSProperties = {
  fontSize: 11, fontWeight: 800,
}

// id delle sezioni della pagina (una sola pagina che scorre, niente tab interni)
const secId = (k: string) => `legaltax-${k}`
const scrollToSec = (k: string) =>
  document.getElementById(secId(k))?.scrollIntoView({ behavior: 'smooth', block: 'start' })

// Categoria = l'oggetto fiscale. Nomi generali, validi anche per posizioni estere;
// il dettaglio (F24, IRPEF, IMU…) va nel titolo.
const CATEGORIES: Record<string, string[]> = {
  fiscale: ['Dichiarazioni fiscali', 'Imposte e versamenti', 'Certificazioni fiscali', 'Comunicazioni fiscali', 'Altri documenti fiscali'],
  legale: ['Contratti', 'Pratiche', 'Altro'],
}

// Azione = cosa si vuole fare con la voce
export const KINDS = [
  { k: 'pagamento', l: 'Pagamento da effettuare', hint: "Un'imposta da versare: indica importo e scadenza. L'atleta paga e carica la ricevuta qui." },
  { k: 'documento', l: 'Condivisione documento', hint: 'Un documento già pronto da mettere a disposizione, senza chiedere niente.' },
  { k: 'richiesta', l: 'Richiesta documentale', hint: "Chiedi documenti all'atleta o a un professionista del team, con una scadenza." },
  { k: 'approvazione', l: 'Richiesta di approvazione', hint: "Carica la bozza: l'atleta la approva o chiede modifiche prima che tu proceda." },
]

const COUNTRIES = ['Italia', 'Grecia', 'Spagna', 'Francia', 'Germania', 'Regno Unito', 'Portogallo', 'Svizzera',
  'Paesi Bassi', 'Belgio', 'Turchia', 'Arabia Saudita', 'Emirati Arabi Uniti', 'Stati Uniti']

/** "Certificazioni fiscali · Italia · 2025": categoria, Paese e anno fiscale della voce */
export function taxMeta(i: { category?: string | null; country?: string | null; tax_year?: number | null }, tr: (s: string) => string) {
  return [i.category ? tr(i.category) : null, i.country ? tr(i.country) : null, i.tax_year ? String(i.tax_year) : null]
    .filter(Boolean).join(' · ')
}

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
  country?: string | null
  tax_year?: number | null
  /** richiesta documentale: a chi è chiesta (null = all'atleta) */
  assignee_id?: string | null
  attachments: { name: string; path: string }[] | null
  response_attachments: { name: string; path: string }[] | null
  response_note: string | null
  created_by?: string | null
  created_at?: string | null
  completed_at?: string | null
  updated_at?: string | null
}

const daysTo = (d?: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null

function dueTone(i: TaxItem) {
  // l è la chiave di traduzione: {n} si sostituisce al momento del render
  if (i.status === 'modifiche') return { c: WARN, l: 'Modifiche richieste', n: 0 }
  if (i.status !== 'aperto') return { c: OK, l: i.status === 'pagato' ? 'Pagato' : i.status === 'letto' ? 'Letto' : i.status === 'approvato' ? 'Approvato' : 'Completato', n: 0 }
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
  const { role, session } = useAuth()
  const uid = session?.user.id
  const { t: tr } = useLang()
  const { athleteId } = useAthlete()
  const [edit, setEdit] = useState<Partial<TaxItem> | null>(null)
  const [respond, setRespond] = useState<{ item: TaxItem; mode: RespondMode } | null>(null)

  const isAdvisor = role === 'commercialista' || role === 'admin'
  const isPlayer = role === 'player'
  // il procuratore coordina: inserisce le attività e coinvolge gli altri professionisti
  const canManage = isAdvisor || isPlayer || role === 'agente'
  const team = useTeam(athleteId)
  const nameOfUser = (id?: string | null) => team.find(m => m.pro_id === id)?.name || tr('un professionista')

  const { rows, loading, reload } = useCollection<TaxItem>('crm_tax_items', {
    orderBy: 'due_date', ascending: true,
    match: athleteId ? { player_id: athleteId } : undefined,
  })

  const { people, reload: reloadPeople } = useItemPeople('tax', rows.map(r => r.id))
  const [thread, setThread] = useState<TaxItem | null>(null)
  const itemParam = useRouteParam('item')
  useEffect(() => {
    const it = itemParam ? rows.find(r => r.id === itemParam) : null
    if (!it) return
    // richiesta ancora da consegnare aperta dall'atleta (es. dai Task): va dritta a "Rispondi"
    if (it.kind === 'richiesta' && it.status === 'aperto' && iAnswer(it)) { setRespond({ item: it, mode: 'completato' }); return }
    setThread(it)
    setTimeout(() => scrollToSec(it.area), 50)
  }, [itemParam, rows.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // documento già letto: per l'atleta non è più una voce, resta nella sezione Documenti
  const isRead = (i: TaxItem) => i.kind === 'documento' && i.status === 'letto'
  // tocca a me rispondere? richiesta all'atleta (atleta o AUVI) o a me come professionista
  function iAnswer(i: TaxItem) {
    if (i.kind !== 'richiesta') return false
    return i.assignee_id ? i.assignee_id === uid || role === 'admin' : isPlayer || role === 'admin'
  }
  const aperte = useMemo(() => rows.filter(i => i.status === 'aperto'
    && (iAnswer(i) || (i.kind === 'approvazione' && (isPlayer || role === 'admin')))), [rows, uid, role]) // eslint-disable-line react-hooks/exhaustive-deps
  // consegnate negli ultimi 60 giorni: restano visibili con la data di consegna
  const consegnate = useMemo(() => rows.filter(i => (i.kind === 'richiesta' || i.kind === 'approvazione') && i.status !== 'aperto' && i.status !== 'modifiche'
    && Date.now() - new Date(i.completed_at || i.updated_at || 0).getTime() < 60 * 86400000), [rows])
  const requesters = useRequesters([...aperte, ...consegnate])
  const whoOf = (i: TaxItem) => (i.created_by && requesters[i.created_by]) || null

  async function marcaLetto(i: TaxItem) {
    const { error } = await supabase.rpc('crm_tax_respond', { p_item: i.id, p_status: 'letto' })
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Segnato come letto · lo trovi in Documenti')); reload()
  }
  async function approva(i: TaxItem) {
    const { error } = await supabase.rpc('crm_tax_respond', { p_item: i.id, p_status: 'approvato' })
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Approvato')); reload()
  }

  // blocco di un'area (fiscale o legale): numeri, voci, aggiungi
  function renderArea(area: 'fiscale' | 'legale') {
    const ofArea = rows.filter(i => i.area === area)
    const shown = isPlayer ? ofArea.filter(i => !isRead(i)) : ofArea
    const readHidden = ofArea.length - shown.length
    return (
      <div id={secId(area)}>
        <Section
          title={area === 'fiscale' ? tr('Fiscale') : tr('Legale')}
          sub={area === 'fiscale' ? tr('Imposte, contributi, dichiarazioni') : tr('Contratti, atti, contenziosi')}
          action={canManage && (
            <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff', fontWeight: 800, border: 'none' }}
              onClick={() => setEdit({ area, kind: 'pagamento', status: 'aperto' })}>
              <Icon name="plus" size={13} /> {tr('Aggiungi')}
            </button>
          )}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20,
                        background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '18px 22px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
            <div className="flex gap" style={{ gap: 26, flexWrap: 'wrap' }}>
              <Metric label={tr('Voci aperte')} value={String(ofArea.filter(i => i.status === 'aperto').length)} tone={ACCENT} />
              <Metric label={tr('Da pagare')}
                value={fmtMoney(ofArea.filter(i => i.kind === 'pagamento' && i.status === 'aperto')
                                      .reduce((s, i) => s + Number(i.amount || 0), 0))} tone={WARN} />
              <Metric label={tr('Pagato')}
                value={fmtMoney(ofArea.filter(i => i.status === 'pagato')
                                      .reduce((s, i) => s + Number(i.amount || 0), 0))} tone={OK} />
            </div>
          </div>

          {readHidden > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => scrollToSec('documenti')}>
              <Icon name="check" size={13} /> {(readHidden === 1 ? tr('1 documento letto è in Documenti') : tr('{n} documenti letti sono in Documenti')).replace('{n}', String(readHidden))} →
            </button>
          )}

          {shown.length === 0 ? (
            <div className="card">
              <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />}
                title={tr('Niente in questa area')}
                hint={canManage ? tr('Aggiungi un pagamento, un documento, una richiesta o una bozza da approvare.')
                                : tr('Il tuo commercialista caricherà qui documenti e scadenze.')} />
            </div>
          ) : (
            <div className="grid g2" style={{ gap: 12 }}>
              {shown.map(i => {
                const t = dueTone(i)
                return (
                  <div key={i.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ height: 3, background: t?.c || ACCENT }} />
                    <div style={{ padding: 16 }}>
                      <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...kicker, fontSize: 11, color: ACCENT }}>
                            {tr(KINDS.find(k => k.k === i.kind)?.l || '')}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{i.title}</div>
                          {(taxMeta(i, tr) || i.period) && <div className="faint" style={{ fontSize: 12.5 }}>{taxMeta(i, tr) || i.period}</div>}
                          {i.kind === 'richiesta' && i.assignee_id && (
                            <div className="faint" style={{ fontSize: 12.5 }}>{tr('Chiesta a {n}').replace('{n}', nameOfUser(i.assignee_id))}</div>
                          )}
                        </div>
                        {t && <span style={{ fontSize: 11, fontWeight: 800,
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
                          <div style={{ ...kicker, fontSize: 11, color: i.status === 'modifiche' ? WARN : OK, marginBottom: 6 }}>
                            {tr(i.kind === 'pagamento' ? 'Ricevuta di pagamento' : i.status === 'modifiche' ? 'Modifiche richieste' : i.kind === 'approvazione' ? 'Risposta' : i.assignee_id ? 'Consegnato' : "Consegnato dall'atleta")}
                          </div>
                          <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                            {i.response_attachments.map(a => (
                              <button key={a.path} className="btn btn-ghost btn-sm" onClick={() => openDoc(a.path, tr('Impossibile aprire il documento'))}>
                                <Icon name="download" size={12} /> {a.name}
                              </button>
                            ))}
                          </div>
                          {i.response_note && <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{i.response_note}</div>}
                        </div>
                      )}
                      {/* modifiche richieste senza file: la nota da sola */}
                      {i.status === 'modifiche' && !(i.response_attachments || []).length && i.response_note && (
                        <div style={{ marginTop: 11, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <div style={{ ...kicker, fontSize: 11, color: WARN, marginBottom: 4 }}>{tr('Modifiche richieste')}</div>
                          <div style={{ fontSize: 12.5 }}>{i.response_note}</div>
                        </div>
                      )}

                      <PeopleRow people={people[i.id] || []} onOpen={() => setThread(i)} />
                      <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
                        {i.kind === 'pagamento' && i.status === 'aperto' && (
                          <button className="btn btn-sm" style={{ background: OK, color: '#fff', fontWeight: 800, border: 'none' }}
                            onClick={() => setRespond({ item: i, mode: 'pagato' })}>{tr('Segna pagato')}</button>
                        )}
                        {i.kind === 'approvazione' && i.status === 'aperto' && (isPlayer || role === 'admin') && <>
                          <button className="btn btn-sm" style={{ background: OK, color: '#fff', fontWeight: 800, border: 'none' }}
                            onClick={() => approva(i)}><Icon name="check" size={12} /> {tr('Approva')}</button>
                          <button className="btn btn-sm" onClick={() => setRespond({ item: i, mode: 'modifiche' })}>{tr('Chiedi modifiche')}</button>
                        </>}
                        {i.kind === 'approvazione' && i.status === 'modifiche' && canManage && !isPlayer && (
                          <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: 'var(--ink)', fontWeight: 800, border: 'none' }}
                            onClick={() => setEdit(i)}><Icon name="upload" size={12} /> {tr('Carica nuova versione')}</button>
                        )}
                        {i.kind === 'documento' && i.status === 'aperto' && (
                          <button className="btn btn-sm" style={{ background: OK, color: '#fff', fontWeight: 800, border: 'none' }}
                            onClick={() => marcaLetto(i)}><Icon name="check" size={12} /> {tr('Segna come letto')}</button>
                        )}
                        {i.kind === 'richiesta' && i.status === 'aperto' && iAnswer(i) && (
                          <button className="btn btn-sm" onClick={() => setRespond({ item: i, mode: 'completato' })}>
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
        </Section>
      </div>
    )
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* richieste da smarcare: sempre in evidenza */}
      {aperte.length > 0 && (
        <div className="card" style={{ borderColor: `${WARN}55` }}>
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...kicker, color: WARN }}>{tr('Tocca a te')}</div>
            <span className="faint" style={{ fontSize: 12.5 }}>{aperte.length}</span>
          </div>
          <div className="grid" style={{ gap: 16 }}>
            {aperte.map(i => (
              <div key={i.id}>
                <div className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{i.title}</div>
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      {tr(i.kind === 'approvazione' ? 'Da approvare' : 'Documenti da consegnare')}{taxMeta(i, tr) ? ' · ' + taxMeta(i, tr) : ''}
                    </div>
                    {i.description && <div className="faint" style={{ fontSize: 12.5 }}>{i.description}</div>}
                  </div>
                  {i.kind === 'approvazione' ? (
                    <div className="flex gap" style={{ gap: 6 }}>
                      {(i.attachments || []).slice(0, 1).map(a => (
                        <button key={a.path} className="btn btn-sm" onClick={() => openDoc(a.path)}><Icon name="download" size={13} /> {tr('Leggi')}</button>
                      ))}
                      <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: 'var(--ink)', fontWeight: 800, border: 'none' }}
                        onClick={() => approva(i)}><Icon name="check" size={13} /> {tr('Approva')}</button>
                      <button className="btn btn-sm" onClick={() => setRespond({ item: i, mode: 'modifiche' })}>{tr('Modifiche')}</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: 'var(--ink)', fontWeight: 800, border: 'none' }}
                      onClick={() => setRespond({ item: i, mode: 'completato' })}>
                      <Icon name="upload" size={13} /> {tr('Rispondi')}
                    </button>
                  )}
                </div>
                <RequestSteps item={i} who={whoOf(i)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {consegnate.length > 0 && (
        <div className="card">
          <div style={{ ...kicker, color: OK, marginBottom: 12 }}>{tr('Concluse di recente')}</div>
          <div className="grid" style={{ gap: 14 }}>
            {consegnate.map(i => (
              <div key={i.id}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{i.title}</div>
                <RequestSteps item={i} who={whoOf(i)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <Section title={tr('Riepilogo')} sub={tr('Spese, scadenze e richieste aperte')}>
        <Overview rows={rows} />
      </Section>

      {renderArea('fiscale')}
      {/* legale: chi non gestisce la vede solo se c'è qualcosa */}
      {(canManage || rows.some(i => i.area === 'legale')) && renderArea('legale')}

      <div id={secId('documenti')}>
        <Section title={tr('Archivio')} sub={tr('Documenti per adempimento, con filtri per categoria, Paese e anno')}>
          <LegalDocs rows={rows} />
        </Section>
      </div>

      {edit && athleteId && (
        <ItemForm value={edit} playerId={athleteId} team={team}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />
      )}
      {thread && athleteId && (
        <ItemPeopleModal kind="tax" itemId={thread.id} playerId={athleteId} title={thread.title}
          sub={[tr(KINDS.find(k => k.k === thread.kind)?.l || ''), taxMeta(thread, tr), thread.due_date ? fmtDate(thread.due_date) : ''].filter(Boolean).join(' · ')}
          people={people[thread.id] || []} onPeople={reloadPeople} onClose={() => setThread(null)}>
          {thread.description && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{thread.description}</div>}
        </ItemPeopleModal>
      )}
      {respond && athleteId && (
        <RespondForm item={respond.item} mode={respond.mode} playerId={athleteId}
          onClose={() => setRespond(null)} onSaved={() => { setRespond(null); reload() }} />
      )}
    </div>
  )
}

// Archivio: i documenti raggruppati per adempimento (bozza, presentata, ricevuta stanno insieme),
// già classificati con categoria, Paese e anno fiscale della voce. Sotto, i file mandati in chat.
function LegalDocs({ rows }: { rows: TaxItem[] }) {
  const { t: tr } = useLang()
  const [cat, setCat] = useState('')
  const [country, setCountry] = useState('')
  const [year, setYear] = useState('')
  const groups = rows.map(i => ({
    item: i,
    files: [
      ...(i.attachments || []).map(a => ({ ...a, reply: false })),
      ...(i.response_attachments || []).map(a => ({ ...a, reply: true })),
    ].filter(f => f.path),
  })).filter(g => g.files.length > 0)
  const opts = (f: (i: TaxItem) => any) => [...new Set(groups.map(g => f(g.item)).filter(Boolean))].sort() as string[]
  const cats = opts(i => i.category), countries = opts(i => i.country), years = opts(i => i.tax_year ? String(i.tax_year) : null).reverse()
  const shown = groups.filter(g => (!cat || g.item.category === cat) && (!country || g.item.country === country)
    && (!year || String(g.item.tax_year || '') === year))
  const nFiles = shown.reduce((n, g) => n + g.files.length, 0)
  const replyLabel = (i: TaxItem) => tr(i.kind === 'pagamento' ? 'Ricevuta' : i.kind === 'approvazione' ? 'Risposta' : 'Consegnato')
  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <div className="flex between" style={{ alignItems: 'center', gap: 9, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
            <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
            <span style={{ ...kicker, color: 'var(--text)' }}>{tr('Documenti delle voci')}</span>
            <span className="faint" style={{ fontSize: 12.5 }}>{nFiles}</span>
          </div>
        </div>
        {groups.length > 0 && (cats.length > 1 || countries.length > 0 || years.length > 0) && (
          <div className="grid g3" style={{ gap: 8, marginBottom: 12 }}>
            <Select value={cat} onChange={e => setCat(e.target.value)} aria-label={tr('Categoria')}>
              <option value="">{tr('Tutte le categorie')}</option>
              {cats.map(c => <option key={c} value={c}>{tr(c)}</option>)}
            </Select>
            <Select value={country} onChange={e => setCountry(e.target.value)} aria-label={tr('Paese')}>
              <option value="">{tr('Tutti i Paesi')}</option>
              {countries.map(c => <option key={c} value={c}>{tr(c)}</option>)}
            </Select>
            <Select value={year} onChange={e => setYear(e.target.value)} aria-label={tr('Anno fiscale')}>
              <option value="">{tr('Tutti gli anni')}</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
        )}
        {shown.length === 0
          ? <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />} title={tr('Nessun documento')}
              hint={groups.length ? tr('Nessun documento con questi filtri.') : tr('I file allegati alle voci fiscali e legali compaiono qui.')} />
          : <div className="grid" style={{ gap: 10 }}>
              {shown.map(g => (
                <div key={g.item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '9px 12px', background: 'var(--surface-2)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.item.title}</div>
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      {[tr(KINDS.find(k => k.k === g.item.kind)?.l || ''), taxMeta(g.item, tr)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="list">
                    {g.files.map(f => (
                      <div className="row" key={f.path}>
                        <span style={{ display: 'inline-flex', color: ACCENT }}><Icon name="file" size={18} /></span>
                        <div className="row-main">
                          <div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div className="row-sub">{f.reply ? replyLabel(g.item) : g.item.kind === 'approvazione' ? tr('Bozza') : tr('Documento')}</div>
                        </div>
                        <button className="btn btn-sm" onClick={() => openDoc(f.path)}>{tr('Apri')}</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>}
      </div>
      <ChatDocs channel="commercialista" accent={ACCENT} />
    </div>
  )
}

type TeamMember = { pro_id: string; role: string; name: string | null }
/** le persone del team dell'atleta (per chiedere un documento a un professionista) */
function useTeam(playerId?: number | null) {
  const [team, setTeam] = useState<TeamMember[]>([])
  useEffect(() => {
    if (!playerId) { setTeam([]); return }
    supabase.from('crm_athlete_team').select('pro_id, role, name').eq('player_id', playerId)
      .then(({ data }) => setTeam(((data as TeamMember[]) || []).filter(m => m.pro_id)))
  }, [playerId])
  return team
}
const ROLE_L: Record<string, string> = {
  agente: 'Procuratore', commercialista: 'Commercialista', wealth: 'Wealth manager', assicuratore: 'Assicuratore',
  preparatore: 'Preparatore', fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista',
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
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>{tr('Legale e fiscale')} · {anno}</div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, marginTop: 6 }}>{fmtMoney(speso)}</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{tr("versato quest'anno su {n} voci").replace('{n}', String(pagati.length))}</div>

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
            <span className="faint" style={{ fontSize: 12.5 }}>{tr('Sono anche in agenda')}</span>
          </div>
          <div className="grid" style={{ gap: 8 }}>
            {prossime.map(i => {
              const t = dueTone(i)
              return (
                <div key={i.id} className="flex between" style={{ alignItems: 'center', gap: 10 }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 28, borderRadius: 2, background: t?.c || ACCENT }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{i.title}</div>
                      <div className="faint" style={{ fontSize: 12.5 }}>{tr(i.category || (i.area === 'fiscale' ? 'Fiscale' : i.area === 'legale' ? 'Legale' : i.area))}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{i.amount ? fmtMoney(i.amount) : '-'}</div>
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
                  <div className="flex between" style={{ fontSize: 12.5, marginBottom: 4 }}>
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
      <div style={{ fontSize: 12.5, marginTop: 1 }}>{v || '-'}</div>
    </div>
  )
}

function ItemForm({ value, playerId, team, onClose, onSaved }: {
  value: Partial<TaxItem>; playerId: number; team: TeamMember[]; onClose: () => void; onSaved: () => void
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
    const kind = f.kind || 'pagamento'
    const assignee = kind === 'richiesta' ? (f.assignee_id || null) : null
    const year = Number(f.tax_year)
    const payload = {
      player_id: playerId, area: f.area || 'fiscale', kind,
      category: f.category || null, title: f.title, description: f.description || null,
      amount: kind === 'pagamento' && f.amount ? Number(f.amount) : null, due_date: f.due_date || null,
      // una bozza corretta dopo le modifiche richieste torna da approvare
      status: f.status === 'modifiche' ? 'aperto' : (f.status || 'aperto'),
      country: (f.country || '').trim() || null, tax_year: year >= 1990 && year <= 2100 ? year : null,
      assignee_id: assignee,
      attachments: atts, updated_at: new Date().toISOString(),
    }
    const { data, error } = f.id ? await updateRow('crm_tax_items', f.id, payload) : await insertRow('crm_tax_items', payload)
    if (error) { setBusy(false); toast(error.message, 'err'); return }
    // richiesta a un professionista: lo coinvolge nella voce (gli arriva la notifica e la vede)
    const m = assignee ? team.find(x => x.pro_id === assignee) : null
    if (m && data?.id && assignee !== value.assignee_id) {
      await supabase.from('crm_item_people').insert({ kind: 'tax', item_id: data.id, user_id: m.pro_id, role: m.role, name: m.name })
    }
    setBusy(false); onSaved()
  }

  const cats = CATEGORIES[f.area || 'fiscale'] || []
  const kindInfo = KINDS.find(k => k.k === (f.kind || 'pagamento'))
  const placeholder: Record<string, string> = {
    pagamento: 'Es. Imposte greche saldo 2025', documento: 'Es. Dichiarazione dei redditi presentata',
    richiesta: 'Es. Certificazioni bancarie per la dichiarazione', approvazione: 'Es. Bozza dichiarazione dei redditi 2025',
  }

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
        <Field label={tr('Azione')}>
          <Select value={f.kind || 'pagamento'} onChange={e => set('kind', e.target.value)} disabled={!!f.id && f.status !== 'aperto'}>
            {KINDS.map(k => <option key={k.k} value={k.k}>{tr(k.l)}</option>)}
          </Select>
        </Field>
      </div>
      {kindInfo && <div className="faint" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 6 }}>{tr(kindInfo.hint)}</div>}
      {f.kind === 'richiesta' && (
        <Field label={tr('A chi chiedi')}>
          <Select value={f.assignee_id || ''} onChange={e => set('assignee_id', e.target.value || null)}>
            <option value="">{tr("All'atleta")}</option>
            {team.map(m => <option key={m.pro_id} value={m.pro_id}>{(m.name || tr('Professionista')) + ' · ' + tr(ROLE_L[m.role] || m.role)}</option>)}
          </Select>
        </Field>
      )}
      <Field label={tr('Titolo')}><Input value={f.title || ''} onChange={e => set('title', e.target.value)}
        placeholder={tr(placeholder[f.kind || 'pagamento'])} /></Field>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label={tr('Categoria')}>
          <Select value={f.category || ''} onChange={e => set('category', e.target.value)}>
            <option value="">{tr('- seleziona -')}</option>
            {cats.map(c => <option key={c} value={c}>{tr(c)}</option>)}
          </Select>
        </Field>
        {f.kind === 'pagamento' && (
          <Field label={tr('Importo (€)')}><Input type="number" inputMode="decimal" value={f.amount ?? ''} onChange={e => set('amount', e.target.value)} /></Field>
        )}
        <Field label={tr('Paese (facoltativo)')}>
          <Input list="tax-countries" value={f.country || ''} onChange={e => set('country', e.target.value)} placeholder={tr('Es. Italia')} />
          <datalist id="tax-countries">{COUNTRIES.map(c => <option key={c} value={tr(c)} />)}</datalist>
        </Field>
        <Field label={tr('Anno fiscale (facoltativo)')}>
          <Input type="number" inputMode="numeric" value={f.tax_year ?? ''} onChange={e => set('tax_year', e.target.value)}
            placeholder={String(new Date().getFullYear() - 1)} />
        </Field>
        <Field label={f.kind === 'richiesta' ? tr('Consegnare entro') : f.kind === 'approvazione' ? tr('Approvare entro') : tr('Scadenza')}>
          <Input type="date" value={f.due_date || ''} onChange={e => set('due_date', e.target.value)} />
        </Field>
      </div>
      <Field label={tr('Descrizione')}><Textarea rows={2} value={f.description || ''} onChange={e => set('description', e.target.value)}
        placeholder={f.kind === 'richiesta' ? tr('Cosa serve esattamente') : tr('Note e istruzioni')} /></Field>

      <div style={{ marginTop: 4 }}>
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>{tr(f.kind === 'approvazione' ? 'Bozza da approvare' : 'Allegati')}</div>
        {atts.length > 0 && (
          <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
            {atts.map(a => (
              <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' }}>
                <span className="flex gap" style={{ alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Icon name="file" size={15} />
                  <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
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

// Risposta nella stessa voce: documenti richiesti, ricevuta di pagamento, modifiche alla bozza.
export type RespondMode = 'completato' | 'pagato' | 'modifiche'
export function RespondForm({ item, mode, playerId, onClose, onSaved }: {
  item: TaxItem; mode: RespondMode; playerId: number; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
  const [atts, setAtts] = useState(mode === 'completato' ? item.response_attachments || [] : [])
  const [note, setNote] = useState(mode === 'completato' ? item.response_note || '' : '')
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
    const { error } = await supabase.rpc('crm_tax_respond', {
      p_item: item.id, p_status: mode, p_atts: atts.length ? atts : null, p_note: note || null,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(tr(mode === 'pagato' ? 'Segnato come pagato' : mode === 'modifiche' ? 'Modifiche inviate' : 'Richiesta smarcata'))
    onSaved()
  }

  const ready = mode === 'completato' ? atts.length > 0 : mode === 'modifiche' ? note.trim().length > 0 : true
  const title = mode === 'pagato' ? tr('Segna pagato') : mode === 'modifiche' ? tr('Chiedi modifiche') : tr('Rispondi')
  return (
    <Modal title={`${title} · ${item.title}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || uploading || !ready} onClick={invia}>
          {busy ? tr('Invio…') : mode === 'pagato' ? tr('Conferma pagamento') : mode === 'modifiche' ? tr('Invia') : tr('Invia e smarca')}
        </button>
      </>}>
      {item.description && (
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 12, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10 }}>
          {item.description}
        </div>
      )}
      {mode === 'pagato' && (
        <div style={{ fontSize: 14, marginBottom: 10 }}>
          {item.amount ? <b>{fmtMoney(item.amount)}</b> : null}{item.amount ? ' · ' : ''}
          {tr('Carica la ricevuta: resta in questa voce e nell\'archivio.')}
        </div>
      )}

      {atts.length > 0 && (
        <div className="grid" style={{ gap: 6, marginBottom: 10 }}>
          {atts.map(a => (
            <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' }}>
              <span className="flex gap" style={{ alignItems: 'center', gap: 7, minWidth: 0 }}>
                <Icon name="file" size={15} />
                <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setAtts(prev => prev.filter(x => x.path !== a.path))}>{tr('Rimuovi')}</button>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={14} /> {uploading ? tr('Carico…')
          : mode === 'pagato' ? tr('Carica la ricevuta (facoltativa)') : mode === 'modifiche' ? tr('Allega un file (facoltativo)') : tr('Carica documento')}
      </button>
      <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />

      <Field label={mode === 'modifiche' ? tr('Cosa va cambiato') : tr('Nota (facoltativa)')}>
        <Textarea rows={mode === 'modifiche' ? 3 : 2} value={note} onChange={e => setNote(e.target.value)}
          placeholder={mode === 'modifiche' ? tr('Es. manca il reddito della Grecia') : tr('Es. mancano le ultime due pagine')} />
      </Field>
    </Modal>
  )
}
