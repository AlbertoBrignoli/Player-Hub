// Brand › Gifting dedicato (es. CiaoGym): un brand regala una selezione di capi a giocatori precisi.
// Il giocatore apre Brand → CiaoGym, sceglie capi e taglie (1), controlla l'indirizzo in
// Profilo → Spedizioni (2) e invia (3). La richiesta arriva al suo AUVI Advisor, che conferma
// la disponibilità e aggiorna lo stato. Offerta, capi e richieste sono protetti lato server:
// li vedono solo i destinatari e AUVI; l'invio passa da crm_gift_submit (scadenza, taglie, indirizzo).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { goto } from '../lib/route'
import { Spinner, Empty, Field, Input, Select, Textarea } from './ui'
import Icon from './Icon'
import type { ShippingInfo } from '../lib/types'

export type GiftOffer = {
  id: string; deal_id: string | null; brand_name: string; title: string; description: string | null
  recipients: number[]; deadline: string | null; deadline_tz: string; active: boolean
}
type GiftItem = {
  id: string; offer_id: string; sort: number; name: string; color: string | null; url: string
  image_url: string | null; sizes: string[]; needs_confirm: boolean; admin_note: string | null
}
type ReqItem = { id: string; name: string; color: string | null; url: string; image_url: string | null; size: string; size_to_confirm: boolean; needs_confirm: boolean }
export type GiftRequest = {
  id: string; offer_id: string; player_id: number; items: ReqItem[]; notes: string | null
  address: ShippingInfo; status: GiftStatus; created_at: string; updated_at: string
}
type GiftStatus = 'da_verificare' | 'confermata' | 'spedita' | 'completata'
type Draft = { sel: Record<string, string>; notes: string }

export const GIFT_STATUS: Record<GiftStatus, { l: string; c: string }> = {
  da_verificare: { l: 'Da verificare', c: 'var(--gold)' },
  confermata: { l: 'Confermata', c: 'var(--blue, #2F6FED)' },
  spedita: { l: 'Spedita', c: 'var(--accent, #7C5CFF)' },
  completata: { l: 'Completata', c: 'var(--green)' },
}

// la route dell'offerta: ci si torna anche dal Profilo dopo aver salvato l'indirizzo
export const giftRoute = (id: string) => `services?tab=brand&gift=${id}`

// --- scadenza: sempre nel fuso dell'offerta (Europe/Rome) ---
export const isExpired = (o: GiftOffer) => !!o.deadline && Date.now() > new Date(o.deadline).getTime()
function fmtDeadline(o: GiftOffer, lang: string, withTime = false) {
  if (!o.deadline) return ''
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'it-IT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: o.deadline_tz || 'Europe/Rome',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(o.deadline))
}
// "2026-11-15T23:59" nel fuso tz → ISO UTC (due passaggi bastano anche a cavallo dell'ora legale)
function wallToUtc(wall: string, tz: string): string {
  const [d, h] = wall.split('T'); const [y, m, day] = d.split('-').map(Number); const [hh, mm] = (h || '00:00').split(':').map(Number)
  const target = Date.UTC(y, m - 1, day, hh, mm)
  let ts = target
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ts)).map(x => [x.type, x.value]))
    ts += target - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  }
  return new Date(ts + 59_999).toISOString()   // fino alle hh:mm:59 incluse
}
function utcToWall(iso: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
const fmtWhen = (iso: string, lang: string) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'it-IT',
  { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(iso))

// --- indirizzo: campi obbligatori per spedire (stessi controlli di crm_gift_submit) ---
const isItaly = (c?: string) => ['italia', 'italy', 'it'].includes((c || '').trim().toLowerCase())
export function missingAddress(s: ShippingInfo | null | undefined): string[] {
  const v = (k: keyof ShippingInfo) => (s?.[k] || '').trim()
  const out: string[] = []
  if (!v('recipient_name')) out.push('Nome e cognome del destinatario')
  if (!v('address')) out.push('Via e numero civico')
  if (!v('cap')) out.push('CAP')
  if (!v('city')) out.push('Città')
  if (isItaly(s?.country) && !v('province')) out.push('Provincia')
  if (!v('country')) out.push('Paese')
  if (!v('phone')) out.push('Telefono per la consegna')
  return out
}
function AddressLines({ a }: { a: ShippingInfo }) {
  const { t } = useLang()
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
      <div style={{ fontWeight: 800 }}>{a.recipient_name}</div>
      <div>{a.address}{a.address2 ? ` · ${a.address2}` : ''}</div>
      <div>{[a.cap, a.city, a.province ? `(${a.province})` : ''].filter(Boolean).join(' ')}</div>
      <div>{a.country}</div>
      {a.phone && <div><span className="faint">{t('Telefono')}:</span> {a.phone}</div>}
      {a.delivery_notes && <div><span className="faint">{t('Note di consegna')}:</span> {a.delivery_notes}</div>}
    </div>
  )
}

// --- foto del capo: proporzioni fisse, capo intero (contain); senza foto un segnaposto ---
function ItemPhoto({ item, onFail }: { item: { name: string; image_url: string | null }; onFail?: () => void }) {
  const { t } = useLang()
  const [bad, setBad] = useState(!item.image_url)
  useEffect(() => { if (bad) onFail?.() }, [bad]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="gf-photo">
      {bad ? (
        <div className="gf-ph"><Icon name="image" size={26} strokeWidth={1.3} /><span>{t('Foto in arrivo')}</span></div>
      ) : (
        <img src={item.image_url!} alt={item.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />
      )}
    </div>
  )
}

// Hook condiviso: le offerte visibili a chi è collegato (RLS: destinatari + AUVI)
export function useGiftOffers() {
  const [offers, setOffers] = useState<GiftOffer[]>([])
  useEffect(() => {
    supabase.from('crm_gift_offers').select('*').order('created_at').then(({ data }) => setOffers((data as GiftOffer[]) || []))
  }, [])
  return offers
}

// ====================================================================================
// Pagina dell'offerta
// ====================================================================================
export function GiftOfferView({ offerId, onBack }: { offerId: string; onBack: () => void }) {
  const { t, lang } = useLang()
  const { isAdmin } = useAuth()
  const { athleteId, athletes } = useAthlete()
  const [offer, setOffer] = useState<GiftOffer | null | undefined>(undefined)
  const [items, setItems] = useState<GiftItem[]>([])
  const [ship, setShip] = useState<ShippingInfo | null>(null)
  const [mine, setMine] = useState<GiftRequest | null>(null)
  const [all, setAll] = useState<GiftRequest[]>([])
  const [badPhotos, setBadPhotos] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [tried, setTried] = useState(false)
  const [justSent, setJustSent] = useState(false)

  // l'atleta per cui si sceglie: quello selezionato in alto, se è destinatario
  const pid = offer && athleteId && offer.recipients.includes(athleteId) ? athleteId : null
  const draftKey = pid ? `gift_draft:${offerId}:${pid}` : ''
  const [draft, setDraft] = useState<Draft>({ sel: {}, notes: '' })
  useEffect(() => {
    if (!draftKey) return
    try { const d = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (d?.sel) setDraft(d) } catch { /* bozza illeggibile */ }
  }, [draftKey])
  useEffect(() => {
    if (!draftKey) return
    try { localStorage.setItem(draftKey, JSON.stringify(draft)) } catch { /* storage pieno o bloccato */ }
  }, [draft, draftKey])

  async function load() {
    const [o, it] = await Promise.all([
      supabase.from('crm_gift_offers').select('*').eq('id', offerId).maybeSingle(),
      supabase.from('crm_gift_items').select('*').eq('offer_id', offerId).order('sort'),
    ])
    setOffer((o.data as GiftOffer) || null)
    setItems((it.data as GiftItem[]) || [])
    const rq = await supabase.from('crm_gift_requests').select('*').eq('offer_id', offerId).order('created_at', { ascending: false })
    setAll((rq.data as GiftRequest[]) || [])
  }
  useEffect(() => { load() }, [offerId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pid) { setShip(null); setMine(null); return }
    supabase.from('player').select('shipping').eq('api_player_id', pid).maybeSingle()
      .then(({ data }) => setShip(((data as any)?.shipping as ShippingInfo) || {}))
    setMine(all.find(r => r.player_id === pid) || null)
  }, [pid, all])

  if (offer === undefined) return <Spinner />
  if (!offer) return (
    <div className="grid" style={{ gap: 14 }}>
      <button className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={onBack}><Icon name="chevron-left" size={14} /> Brand</button>
      <div className="card"><Empty icon={<Icon name="lock" size={28} />} title={t('Offerta non disponibile')}
        hint={t('Questa offerta è riservata ai giocatori a cui è dedicata.')} /></div>
    </div>
  )

  const expired = isExpired(offer)
  const nameOf = (p: number) => athletes.find(a => a.api_player_id === p)?.name || `#${p}`
  const chosen = items.filter(i => draft.sel[i.id] !== undefined)
  const missingSize = chosen.filter(i => !draft.sel[i.id]?.trim())
  const missAddr = missingAddress(ship)
  const problems = [
    ...(chosen.length === 0 ? [t('Seleziona almeno un capo')] : []),
    ...missingSize.map(i => t('Indica la taglia per {name}').replace('{name}', i.name)),
    ...(missAddr.length ? [t("Completa l'indirizzo: {list}").replace('{list}', missAddr.map(m => t(m)).join(', '))] : []),
  ]

  const toggle = (i: GiftItem) => setDraft(d => {
    const sel = { ...d.sel }
    if (sel[i.id] !== undefined) delete sel[i.id]; else sel[i.id] = ''
    return { ...d, sel }
  })
  const setSize = (i: GiftItem, size: string) => setDraft(d => ({ ...d, sel: { ...d.sel, [i.id]: size } }))

  async function send() {
    setTried(true)
    if (!pid || sending || problems.length || expired) return
    setSending(true)
    const payload = chosen.map(i => ({ id: i.id, size: draft.sel[i.id].trim() }))
    const { error } = await supabase.rpc('crm_gift_submit', { p_offer: offer!.id, p_player: pid, p_items: payload, p_notes: draft.notes })
    setSending(false)
    if (error) { toast(t(error.message), 'err'); load(); return }
    try { localStorage.removeItem(draftKey) } catch { /* niente */ }
    setDraft({ sel: {}, notes: '' })
    setJustSent(true)
    await load()
    document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addrBack = encodeURIComponent(giftRoute(offer.id))
  const canChoose = !!pid && !mine && !expired

  return (
    <div className="grid" style={{ gap: 16 }}>
      <style>{GF_CSS}</style>
      <button className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={onBack}><Icon name="chevron-left" size={14} /> Brand</button>

      {/* --- testata --- */}
      <div className="gf-hero">
        <div className="gf-kick">{offer.brand_name} · {t('Gifting')}</div>
        <div className="gf-title">{offer.title}</div>
        {offer.description && <div className="gf-desc">{t(offer.description)}</div>}
        {offer.deadline && (expired
          ? <div className="gf-deadline gf-expired"><Icon name="lock" size={14} /> {t('Offerta scaduta')}</div>
          : <div className="gf-deadline"><Icon name="clock" size={14} /> {t('Invia la tua scelta entro il {date}.').replace('{date}', fmtDeadline(offer, lang))}</div>)}
      </div>

      {/* --- AUVI: scadenza, problemi foto/colore, richieste ricevute --- */}
      {isAdmin && <AdminPanel offer={offer} items={items} badPhotos={badPhotos} requests={all} onChanged={load} />}

      {/* --- inviata --- */}
      {mine && (
        <div className="grid" style={{ gap: 10 }}>
          {justSent && (
            <div className="gf-ok"><Icon name="check" size={16} />
              {t('La tua scelta è stata inviata al tuo AUVI Advisor. Riceverai conferma della disponibilità e aggiornamenti sulla spedizione.')}</div>
          )}
          <GiftRequestCard req={mine} offer={offer} playerName={nameOf(mine.player_id)} onChanged={load} />
        </div>
      )}

      {!pid && !isAdmin && (
        <div className="card"><Empty icon={<Icon name="lock" size={28} />} title={t('Offerta non disponibile')}
          hint={t('Questa offerta è riservata ai giocatori a cui è dedicata.')} /></div>
      )}
      {!pid && isAdmin && (
        <div className="gf-note">{t('Per vedere il percorso del giocatore seleziona in alto {names}.').replace('{names}', offer.recipients.map(nameOf).join(t(' o ')))}</div>
      )}

      {/* --- 1 · scegli i capi --- */}
      <section className="grid" style={{ gap: 12 }}>
        <StepHead n={1} title={t('Scegli i capi')} hint={canChoose ? t('Tocca un capo per selezionarlo e indica la taglia.') : undefined}
          right={canChoose && chosen.length > 0 ? <span className="gf-count">{t('{n} selezionati').replace('{n}', String(chosen.length))}</span> : undefined} />
        <div className="gf-grid">
          {items.map(i => {
            const on = draft.sel[i.id] !== undefined
            const needSize = tried && on && !draft.sel[i.id]?.trim()
            return (
              <div key={i.id} className={`gf-item${on ? ' on' : ''}${needSize ? ' warn' : ''}`}>
                <button className="gf-pick" disabled={!canChoose} onClick={() => toggle(i)} aria-pressed={on}>
                  <ItemPhoto item={i} onFail={() => setBadPhotos(b => b.includes(i.id) ? b : [...b, i.id])} />
                  {canChoose && <span className="gf-check">{on ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}</span>}
                </button>
                <div className="gf-info">
                  <div className="gf-name">{i.name}</div>
                  {i.color && <div className="gf-color">{i.color}</div>}
                  {i.needs_confirm && <div className="gf-tbc">{t('Disponibilità per questo gifting da confermare con AUVI')}</div>}
                  {canChoose && on && (i.sizes.length ? (
                    <div className="gf-sizes" role="group" aria-label={t('Taglia')}>
                      {i.sizes.map(s => (
                        <button key={s} className={draft.sel[i.id] === s ? 'on' : ''} onClick={() => setSize(i, s)}>{s}</button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 4 }}>
                      <Input value={draft.sel[i.id]} placeholder={t('Taglia desiderata')} onChange={e => setSize(i, e.target.value)} />
                      <span className="gf-tbc">{t('Taglia da confermare')}</span>
                    </div>
                  ))}
                  {needSize && <div className="gf-err">{t('Scegli la taglia')}</div>}
                  <a className="gf-link" href={i.url} target="_blank" rel="noopener noreferrer">{t('Scopri il capo')} ↗</a>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* --- 2 · indirizzo --- */}
      {pid && !mine && (
        <section className="grid" style={{ gap: 12 }}>
          <StepHead n={2} title={t("Controlla l'indirizzo di spedizione")} />
          <div className="card grid" style={{ gap: 12 }}>
            <div className="gf-note">
              {t('Prima di inviare la tua scelta, inserisci o verifica il tuo indirizzo nella sezione dedicata di Player Hub. Dopo averlo salvato, torna qui per completare la richiesta.')}
              <div style={{ marginTop: 4 }}><b>{t('Dove si trova')}:</b> {t('Profilo → Spedizioni')}</div>
            </div>
            {ship && (ship.recipient_name || ship.address || ship.city)
              ? <AddressLines a={ship} />
              : <div className="faint" style={{ fontSize: 13 }}>{t('Nessun indirizzo salvato.')}</div>}
            {tried && missAddr.length > 0 && (
              <div className="gf-err">{t('Mancano')}: {missAddr.map(m => t(m)).join(', ')}</div>
            )}
            <button className="btn" style={{ justifySelf: 'start' }} onClick={() => goto(`profile?tab=spedizioni&back=${addrBack}`)}>
              <Icon name="pin" size={14} /> {t('Inserisci o aggiorna indirizzo di spedizione')}
            </button>
            <div className="faint" style={{ fontSize: 11.5 }}>{t('La tua selezione resta salvata mentre aggiorni l\'indirizzo.')}</div>
          </div>
        </section>
      )}

      {/* --- 3 · riepilogo e invio --- */}
      {pid && !mine && (
        <section className="grid" style={{ gap: 12 }}>
          <StepHead n={3} title={t('Riepiloga e invia')} />
          <div className="card grid" style={{ gap: 14 }}>
            {chosen.length === 0
              ? <div className="faint" style={{ fontSize: 13 }}>{t('Nessun capo selezionato.')}</div>
              : <div className="gf-sum">{chosen.map(i => (
                  <div key={i.id} className="gf-sum-row">
                    <div className="gf-sum-ph"><ItemPhoto item={i} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{i.name}</div>
                      <div className="faint" style={{ fontSize: 12 }}>{[i.color, draft.sel[i.id] ? `${t('Taglia')} ${draft.sel[i.id]}` : null].filter(Boolean).join(' · ')}</div>
                      {!draft.sel[i.id]?.trim() && <div className="gf-err">{t('Taglia mancante')}</div>}
                    </div>
                  </div>))}
                </div>}
            <Field label={t('Note (facoltative)')}>
              <Textarea rows={2} value={draft.notes} disabled={!canChoose}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder={t('Es. vestibilità, preferenze…')} />
            </Field>
            {ship && missAddr.length === 0 && (
              <div><div className="gf-lab">{t('Indirizzo di spedizione')}</div><AddressLines a={ship} /></div>
            )}
            {tried && problems.length > 0 && (
              <div className="gf-problems">
                <b>{t('Per inviare completa:')}</b>
                <ul>{problems.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            {expired
              ? <div className="gf-deadline gf-expired"><Icon name="lock" size={14} /> {t('Offerta scaduta')}</div>
              : <>
                  <div className="faint" style={{ fontSize: 12 }}>{t('Verifica capi, taglie e indirizzo prima di confermare.')}</div>
                  <button className="btn btn-primary gf-send" disabled={sending} onClick={send}>
                    <Icon name="send" size={15} /> {sending ? t('Invio…') : t('Invia la tua scelta')}
                  </button>
                </>}
            <div className="faint" style={{ fontSize: 11.5 }}>
              {t('La richiesta è soggetta a conferma di disponibilità da parte di AUVI. Eventuali contenuti social si concordano con AUVI.')}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function StepHead({ n, title, hint, right }: { n: number; title: string; hint?: string; right?: React.ReactNode }) {
  const { t } = useLang()
  return (
    <div className="flex between" style={{ alignItems: 'flex-end', gap: 10 }}>
      <div>
        <div className="gf-step"><b>{n}</b> {t('Passaggio {n}').replace('{n}', String(n))}</div>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.3 }}>{title}</div>
        {hint && <div className="faint" style={{ fontSize: 12.5 }}>{hint}</div>}
      </div>
      {right}
    </div>
  )
}

// --- pannello AUVI: scadenza modificabile e segnalazioni ---
function AdminPanel({ offer, items, badPhotos, requests, onChanged }: {
  offer: GiftOffer; items: GiftItem[]; badPhotos: string[]; requests: GiftRequest[]; onChanged: () => void
}) {
  const { t, lang } = useLang()
  const tz = offer.deadline_tz || 'Europe/Rome'
  const [wall, setWall] = useState(offer.deadline ? utcToWall(offer.deadline, tz) : '')
  const [saving, setSaving] = useState(false)
  const notes = items.filter(i => i.admin_note || badPhotos.includes(i.id))
  const waiting = offer.recipients.filter(p => !requests.some(r => r.player_id === p))
  const { athletes } = useAthlete()
  const nameOf = (p: number) => athletes.find(a => a.api_player_id === p)?.name || `#${p}`

  async function saveDeadline() {
    setSaving(true)
    const { error } = await supabase.from('crm_gift_offers').update({ deadline: wall ? wallToUtc(wall, tz) : null }).eq('id', offer.id)
    setSaving(false)
    if (error) toast(error.message, 'err'); else { toast(t('Scadenza salvata')); onChanged() }
  }

  return (
    <div className="card grid gf-admin" style={{ gap: 12 }}>
      <div className="gf-lab">{t('Solo AUVI')}</div>
      <div className="flex gap" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label={t('Scadenza invii ({tz})').replace('{tz}', tz)}>
          <Input type="datetime-local" value={wall} onChange={e => setWall(e.target.value)} />
        </Field>
        <button className="btn btn-sm" disabled={saving} onClick={saveDeadline}>{t('Salva')}</button>
        {wall && <button className="btn btn-sm btn-ghost" onClick={() => setWall('')}>{t('Nessuna scadenza')}</button>}
      </div>
      {offer.deadline && <div className="faint" style={{ fontSize: 12 }}>
        {t('Invii aperti fino al {date} (ora di Roma), poi bloccati anche lato server.').replace('{date}', fmtDeadline(offer, lang, true))}</div>}
      <div style={{ fontSize: 12.5 }}>
        <b>{t('Destinatari')}:</b> {offer.recipients.map(p => `${nameOf(p)}${requests.some(r => r.player_id === p) ? ' ✓' : ''}`).join(' · ')}
        {waiting.length > 0 && <span className="faint"> — {t('in attesa: {names}').replace('{names}', waiting.map(nameOf).join(', '))}</span>}
      </div>
      {notes.map(i => (
        <div key={i.id} className="gf-problems">
          <b>{i.name}</b>
          {badPhotos.includes(i.id) && <div>{t('Foto non disponibile: viene mostrato un segnaposto. Controlla la pagina prodotto.')}</div>}
          {i.admin_note && <div>{i.admin_note}</div>}
        </div>
      ))}
    </div>
  )
}

// ====================================================================================
// Una richiesta (giocatore: sola lettura dello stato; AUVI: advisor e stato)
// ====================================================================================
export function GiftRequestCard({ req, offer, playerName, onChanged, highlight }: {
  req: GiftRequest; offer?: Pick<GiftOffer, 'brand_name' | 'title'> | null; playerName: string; onChanged?: () => void; highlight?: boolean
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useAuth()
  const [adv, setAdv] = useState<{ id: string; name: string } | null | undefined>(undefined)
  const [admins, setAdmins] = useState<{ id: string; full_name: string | null }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('crm_gift_advisors', { p_players: [req.player_id] }).then(({ data }) => {
      const r = ((data as any[]) || [])[0]
      setAdv(r ? { id: r.advisor_id, name: r.advisor_name } : null)
    })
    if (isAdmin) supabase.from('crm_profiles').select('id, full_name').eq('role', 'admin').order('full_name')
      .then(({ data }) => setAdmins((data as any[]) || []))
  }, [req.player_id, isAdmin])

  async function setStatus(s: string) {
    setBusy(true)
    const { error } = await supabase.rpc('crm_gift_set_status', { p_req: req.id, p_status: s })
    setBusy(false)
    if (error) toast(t(error.message), 'err'); else { toast(t('Stato aggiornato')); onChanged?.() }
  }
  async function assign(id: string) {
    const { error } = id
      ? await supabase.from('crm_player_advisors').upsert({ player_id: req.player_id, advisor_id: id, assigned_at: new Date().toISOString() })
      : await supabase.from('crm_player_advisors').delete().eq('player_id', req.player_id)
    if (error) { toast(error.message, 'err'); return }
    const a = admins.find(x => x.id === id)
    setAdv(id ? { id, name: a?.full_name || 'AUVI Advisor' } : null)
    toast(t('Advisor assegnato'))
  }

  const st = GIFT_STATUS[req.status]
  return (
    <div id={`gift-${req.id}`} className={`card gf-req${highlight ? ' hl' : ''}`}>
      <style>{GF_CSS}</style>
      <div className="flex between" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="gf-kick">{offer?.brand_name || 'Brand'} · {offer?.title ? t(offer.title) : t('Gifting')}</div>
          <div style={{ fontSize: 17, fontWeight: 900 }}>{playerName}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            {t('Inviata il {date}').replace('{date}', fmtWhen(req.created_at, lang))}
            {' · '}{adv === undefined ? '…' : adv ? `${t('Advisor')}: ${adv.name}` : <span className="gf-warn-t">{t('Advisor da assegnare')}</span>}
          </div>
        </div>
        <span className="gf-status" style={{ background: st.c }}>{t(st.l)}</span>
      </div>

      {/* avanzamento dello stato */}
      <div className="gf-track">
        {(Object.keys(GIFT_STATUS) as GiftStatus[]).map((k, i, arr) => {
          const done = arr.indexOf(req.status) >= i
          return <div key={k} className={done ? 'on' : ''}><span />{t(GIFT_STATUS[k].l)}</div>
        })}
      </div>

      <div className="gf-sum">
        {req.items.map(i => (
          <div key={i.id} className="gf-sum-row">
            <div className="gf-sum-ph"><ItemPhoto item={i} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{i.name}</div>
              <div className="faint" style={{ fontSize: 12 }}>
                {[i.color, `${t('Taglia')} ${i.size}${i.size_to_confirm ? ` (${t('da confermare')})` : ''}`].filter(Boolean).join(' · ')}
              </div>
              {i.needs_confirm && <div className="gf-tbc">{t('Disponibilità per questo gifting da confermare con AUVI')}</div>}
              <a className="gf-link" href={i.url} target="_blank" rel="noopener noreferrer">{t('Scopri il capo')} ↗</a>
            </div>
          </div>
        ))}
      </div>

      {req.notes && <div><div className="gf-lab">{t('Note del giocatore')}</div><div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{req.notes}</div></div>}
      <div>
        <div className="gf-lab">{t('Indirizzo confermato all\'invio')}</div>
        <AddressLines a={req.address} />
      </div>

      {isAdmin && (
        <div className="gf-admin-row">
          <Field label={t('Stato')}>
            <Select value={req.status} disabled={busy} onChange={e => setStatus(e.target.value)}>
              {(Object.keys(GIFT_STATUS) as GiftStatus[]).map(k => <option key={k} value={k}>{t(GIFT_STATUS[k].l)}</option>)}
            </Select>
          </Field>
          <Field label={t('AUVI Advisor')}>
            <Select value={adv?.id || ''} onChange={e => assign(e.target.value)}>
              <option value="">{t('Da assegnare')}</option>
              {admins.map(a => <option key={a.id} value={a.id}>{a.full_name || a.id.slice(0, 8)}</option>)}
            </Select>
          </Field>
        </div>
      )}
    </div>
  )
}

// Elenco richieste gifting (Servizi → Richieste e scheda atleta lato AUVI)
export function GiftRequestsList({ playerId, openId, title }: { playerId?: number | null; openId?: string | null; title?: string }) {
  const { t } = useLang()
  const { athletes } = useAthlete()
  const [reqs, setReqs] = useState<GiftRequest[] | null>(null)
  const [offers, setOffers] = useState<Record<string, GiftOffer>>({})

  async function load() {
    let q = supabase.from('crm_gift_requests').select('*').order('created_at', { ascending: false })
    if (playerId) q = q.eq('player_id', playerId)
    const [{ data }, o] = await Promise.all([q, supabase.from('crm_gift_offers').select('*')])
    setReqs((data as GiftRequest[]) || [])
    setOffers(Object.fromEntries(((o.data as GiftOffer[]) || []).map(x => [x.id, x])))
  }
  useEffect(() => { load() }, [playerId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (openId && reqs?.length) setTimeout(() => document.getElementById(`gift-${openId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [openId, reqs])

  const sorted = useMemo(() => reqs || [], [reqs])
  if (!reqs || reqs.length === 0) return null
  const nameOf = (p: number) => athletes.find(a => a.api_player_id === p)?.name || `#${p}`
  return (
    <section className="grid" style={{ gap: 10 }}>
      <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 800 }}>{title || t('Richieste brand')}</div>
      {sorted.map(r => <GiftRequestCard key={r.id} req={r} offer={offers[r.offer_id]} playerName={nameOf(r.player_id)}
        highlight={r.id === openId} onChanged={load} />)}
    </section>
  )
}

const GF_CSS = `
.gf-hero { border-radius: 20px; padding: 20px 18px; background: #111; color: #fff; display: grid; gap: 8px; }
.gf-kick { font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 800; opacity: .7; }
.gf-title { font-size: 24px; font-weight: 900; letter-spacing: -.5px; line-height: 1.15; }
.gf-desc { font-size: 14px; line-height: 1.5; opacity: .85; max-width: 640px; }
.gf-deadline { display: inline-flex; align-items: center; gap: 7px; justify-self: start; margin-top: 4px; padding: 7px 12px; border-radius: 999px; background: var(--yellow, #F5D400); color: #111; font-weight: 800; font-size: 13px; }
.gf-expired { background: #E5484D; color: #fff; }
.gf-step { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; color: var(--text-dim); margin-bottom: 2px; }
.gf-step b { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--text); color: var(--bg, #fff); font-size: 11px; letter-spacing: 0; }
.gf-count { font-size: 12px; font-weight: 800; padding: 5px 10px; border-radius: 999px; background: var(--text); color: var(--bg, #fff); white-space: nowrap; }
.gf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 12px; }
@media (max-width: 520px) { .gf-grid { grid-template-columns: 1fr 1fr; gap: 10px; } .gf-title { font-size: 21px; } }
.gf-item { border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--surface); display: flex; flex-direction: column; transition: border-color .15s, box-shadow .15s; }
.gf-item.on { border-color: var(--text); box-shadow: 0 0 0 1px var(--text); }
.gf-item.warn { border-color: #E5484D; box-shadow: 0 0 0 1px #E5484D; }
.gf-pick { position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
.gf-pick:disabled { cursor: default; }
.gf-photo { aspect-ratio: 2000 / 2460; background: #F2F2F0; display: grid; place-items: center; overflow: hidden; }
.gf-photo img { width: 100%; height: 100%; object-fit: contain; display: block; }
.gf-ph { display: grid; justify-items: center; gap: 6px; color: #9a9a96; font-size: 11.5px; font-weight: 700; }
.gf-check { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.92); color: #111; border: 1px solid rgba(0,0,0,.12); }
.gf-item.on .gf-check { background: #111; color: #fff; border-color: #111; }
.gf-info { padding: 10px 12px 12px; display: grid; gap: 6px; align-content: start; flex: 1; }
.gf-name { font-weight: 900; font-size: 14px; line-height: 1.2; }
.gf-color { font-size: 12px; color: var(--text-dim); font-weight: 600; }
.gf-tbc { font-size: 11px; line-height: 1.35; font-weight: 700; color: #8a6d00; background: rgba(245,212,0,.18); border-radius: 8px; padding: 4px 7px; }
.gf-sizes { display: flex; flex-wrap: wrap; gap: 5px; }
.gf-sizes button { min-width: 38px; padding: 7px 8px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-2, transparent); color: var(--text); font-weight: 800; font-size: 12.5px; cursor: pointer; }
.gf-sizes button.on { background: var(--text); color: var(--bg, #fff); border-color: var(--text); }
.gf-link { font-size: 12.5px; font-weight: 800; color: var(--text); text-decoration: underline; text-underline-offset: 3px; margin-top: auto; }
.gf-err { font-size: 12px; font-weight: 700; color: #E5484D; }
.gf-note { font-size: 13px; line-height: 1.5; padding: 10px 12px; border-radius: 12px; background: var(--bg-2); border: 1px solid var(--border); }
.gf-lab { font-size: 11px; letter-spacing: 1.3px; text-transform: uppercase; font-weight: 800; color: var(--text-dim); margin-bottom: 4px; }
.gf-problems { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 12px; background: rgba(229,72,77,.08); border: 1px solid rgba(229,72,77,.35); }
.gf-problems ul { margin: 4px 0 0 18px; padding: 0; }
.gf-send { width: 100%; justify-content: center; padding: 14px 16px; font-size: 15px; }
.gf-ok { display: flex; gap: 10px; align-items: flex-start; padding: 14px; border-radius: 14px; background: rgba(48,164,108,.12); border: 1px solid rgba(48,164,108,.4); font-weight: 700; font-size: 14px; line-height: 1.45; }
.gf-sum { display: grid; gap: 10px; }
.gf-sum-row { display: grid; grid-template-columns: 62px 1fr; gap: 12px; align-items: center; }
.gf-sum-ph { width: 62px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
.gf-req { display: grid; gap: 14px; scroll-margin-top: 80px; }
.gf-req.hl { box-shadow: 0 0 0 2px var(--yellow, #F5D400); }
.gf-status { color: #fff; font-weight: 800; font-size: 12px; padding: 6px 11px; border-radius: 999px; white-space: nowrap; }
.gf-track { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.gf-track div { display: grid; gap: 5px; font-size: 10.5px; font-weight: 700; color: var(--text-faint, var(--text-dim)); }
.gf-track span { height: 4px; border-radius: 4px; background: var(--border); }
.gf-track div.on { color: var(--text); }
.gf-track div.on span { background: var(--text); }
.gf-warn-t { color: #E5484D; font-weight: 800; }
.gf-admin { border-style: dashed; }
.gf-admin-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 10px; border-top: 1px solid var(--border); padding-top: 12px; }
`
