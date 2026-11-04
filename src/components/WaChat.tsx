// Telaio delle chat in stile WhatsApp, nei colori AUVI: elenco conversazioni a sinistra
// (foto, nome, anteprima, ora, non letti), conversazione a destra su fondo chiaro con
// bolle a "codina", separatori di giorno e barra di scrittura tonda. Su telefono si vede
// una colonna alla volta: l'elenco, poi la conversazione con la freccia per tornare.
// Lo usano le chat dirette (Messages) e quelle dello staff (StaffChat).
import { useLayoutEffect, useRef } from 'react'
import { useLang } from '../lib/i18n'
import { locale } from '../lib/format'
import Icon from './Icon'
import { ChatAvatar } from './ChatAvatar'
import { ChatAttachment } from './ChatAttachment'

export type WaMsg = {
  id: string; sender_id: string | null; sender_name: string | null; sender_role: string | null; body: string; created_at: string
  file_path?: string | null; file_name?: string | null; file_mime?: string | null; file_size?: number | null
  /** quando il destinatario l'ha letto (solo chat dirette): ✓ inviato, ✓✓ letto */
  read_at?: string | null
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** ora per i messaggi (14:05) */
export const hhmm = (d: string) => new Date(d).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })

/** data compatta per l'elenco: ora se oggi, "Ieri", giorno della settimana, poi la data */
export function listWhen(d: string | null | undefined, t: (s: string) => string) {
  if (!d) return ''
  const dt = new Date(d), now = new Date()
  if (sameDay(dt, now)) return hhmm(d)
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(dt, y)) return t('Ieri')
  if (now.getTime() - dt.getTime() < 6 * 86400000) return dt.toLocaleDateString(locale(), { weekday: 'long' })
  return dt.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function dayLabel(d: Date, t: (s: string) => string) {
  const now = new Date()
  if (sameDay(d, now)) return t('Oggi')
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return t('Ieri')
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

/** ultimo momento in cui questo utente ha visto la conversazione (solo su questo dispositivo) */
export function seenAt(key: string): string | null {
  try { return localStorage.getItem('wa_seen:' + key) } catch { return null }
}
export function markSeen(key: string, at: string) {
  try { if ((seenAt(key) || '') < at) localStorage.setItem('wa_seen:' + key, at) } catch { /* modalità privata */ }
}

/** Una riga dell'elenco conversazioni */
export function WaItem({ active, avatar, title, preview, when, unread, onClick }: {
  active?: boolean; avatar: React.ReactNode; title: string; preview?: React.ReactNode; when?: string; unread?: number; onClick: () => void
}) {
  return (
    <button className={`wa-item ${active ? 'on' : ''} ${unread ? 'unread' : ''}`} onClick={onClick}>
      {avatar}
      <span className="wa-item-body">
        <span className="wa-item-top">
          <span className="wa-item-t">{title}</span>
          {when && <span className="wa-item-when">{when}</span>}
        </span>
        <span className="wa-item-bot">
          <span className="wa-item-p">{preview}</span>
          {!!unread && <span className="wa-badge">{unread > 99 ? '99+' : unread}</span>}
        </span>
      </span>
    </button>
  )
}

/** Messaggi con separatori di giorno e bolle raggruppate per mittente */
export function WaMessages({ msgs, me, photoOf, names, decorate, empty, receipts }: {
  msgs: WaMsg[]; me?: string
  photoOf: (id: string | null | undefined, role: string | null | undefined) => string | null
  /** etichetta sotto il nome di chi scrive (es. il ruolo); se assente i nomi non compaiono */
  names?: (m: WaMsg) => string | null
  /** contenuto extra in testa alla bolla e bolla evidenziata (es. tag dello staff) */
  decorate?: (m: WaMsg) => { pre?: React.ReactNode; highlight?: boolean } | null
  empty?: React.ReactNode
  /** mostra le spunte di lettura sui propri messaggi (chat dirette) */
  receipts?: boolean
}) {
  const { t } = useLang()
  const endRef = useRef<HTMLDivElement>(null)
  // all'apertura si parte dal fondo, senza animazione; poi ogni nuovo messaggio scorre dolcemente
  const firstId = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    if (!msgs.length) return
    const fresh = firstId.current !== msgs[0].id
    firstId.current = msgs[0].id
    endRef.current?.scrollIntoView({ behavior: fresh ? 'auto' : 'smooth', block: 'end' })
  }, [msgs.length, msgs[0]?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // in una conversazione a due non serve ripetere il nome: compare solo se scrivono più persone
  const senders = new Set(msgs.filter(m => m.sender_id !== me).map(m => m.sender_id))
  const showNames = !!names && senders.size > 1

  return (
    <div className="wa-wall">
      {msgs.length === 0 ? <div className="wa-empty">{empty}</div> : (
        <div className="wa-msgs">
          {msgs.map((m, i) => {
            const prev = msgs[i - 1]
            const d = new Date(m.created_at)
            const newDay = !prev || !sameDay(new Date(prev.created_at), d)
            const mine = m.sender_id === me
            // nuova "raffica": cambia chi scrive, cambia giorno o passano più di 5 minuti
            const head = newDay || !prev || prev.sender_id !== m.sender_id || d.getTime() - new Date(prev.created_at).getTime() > 5 * 60000
            const deco = decorate?.(m) || null
            const onlyFile = !!m.file_path && m.body === m.file_name
            return (
              <div key={m.id}>
                {newDay && <div className="wa-day"><span>{dayLabel(d, t)}</span></div>}
                <div className={`wa-row ${mine ? 'out' : 'in'} ${head ? 'head' : ''}`}>
                  {!mine && showNames && (head
                    ? <ChatAvatar size={28} name={m.sender_name} role={m.sender_role} photo={photoOf(m.sender_id, m.sender_role)} />
                    : <span className="wa-av-gap" />)}
                  <div className={`wa-bubble ${mine ? 'out' : 'in'} ${head ? 'tail' : ''} ${deco?.highlight ? 'hl' : ''} ${m.file_path && !onlyFile ? '' : m.file_path ? 'media' : ''}`}>
                    {!mine && showNames && head && (
                      <div className="wa-name">{m.sender_name}{names!(m) && <span> · {names!(m)}</span>}</div>
                    )}
                    {deco?.pre}
                    {m.file_path && <ChatAttachment path={m.file_path} name={m.file_name} mime={m.file_mime} size={m.file_size} mine={false} />}
                    {!onlyFile && <span className="wa-text">{m.body}</span>}
                    <span className="wa-time">{hhmm(m.created_at)}
                      {receipts && mine && (
                        <span className={`wa-tick ${m.read_at ? 'read' : ''}`} title={m.read_at ? t('Letto') : t('Inviato')} aria-label={m.read_at ? t('Letto') : t('Inviato')}>
                          <Icon name="check" size={12} strokeWidth={2.4} />{m.read_at && <Icon name="check" size={12} strokeWidth={2.4} />}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
      )}
    </div>
  )
}

/** Barra di scrittura: graffetta, campo tondo che cresce con il testo, tasto invio giallo */
export function WaComposer({ value, onChange, onSend, placeholder, busy, canSend, attach, extra, above, onKeyDown }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string
  busy?: boolean; canSend: boolean
  attach: { button: React.ReactNode; chip: React.ReactNode }
  extra?: React.ReactNode; above?: React.ReactNode
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useLang()
  const ref = useRef<HTMLTextAreaElement>(null)
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // cresce con il testo, mai più basso di una riga intera (44) e mai oltre 140; +2 = bordo
    el.style.height = 'auto'
    el.style.height = Math.min(Math.max(el.scrollHeight + 2, 44), 140) + 'px'
  }, [value])
  return (
    <div className="wa-comp-wrap">
      {above}
      {attach.chip && <div className="wa-chip">{attach.chip}</div>}
      <div className="wa-comp">
        <span className="wa-attach">{attach.button}</span>
        {extra}
        <textarea ref={ref} rows={1} className="wa-input" placeholder={placeholder} value={value} enterKeyHint={touch ? 'enter' : 'send'}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            onKeyDown?.(e)
            if (e.defaultPrevented) return
            // come WhatsApp: su telefono e iPad Invio va a capo (si manda col tasto giallo), su PC Invio manda
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touch) { e.preventDefault(); if (canSend && !busy) onSend() }
          }} />
        <button className="wa-send" disabled={busy || !canSend} onClick={onSend} aria-label={t('Invia')} title={t('Invia')}>
          {busy ? <span className="wa-spin" /> : <Icon name="send" size={19} strokeWidth={2} />}
        </button>
      </div>
    </div>
  )
}

export const WA_CSS = `
.wa { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); max-width: 100%; height: calc(100vh - 210px); min-height: 460px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; }
.wa-list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); background: var(--surface); }
.wa-list-head { padding: 16px 16px 10px; display: grid; gap: 10px; }
.wa-list-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wa-list-title h3 { font-family: var(--font-display); font-weight: 800; font-size: 22px; letter-spacing: -.2px; font-stretch: 125%; }
.wa-search { display: flex; align-items: center; gap: 8px; background: var(--bg-2); border-radius: 12px; padding: 0 12px; height: 38px; color: var(--text-faint); }
.wa-search input { border: 0; background: transparent; outline: none; flex: 1; font: inherit; font-size: 14px; color: var(--text); min-width: 0; }
.wa-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.wa-chipf { border: 0; background: var(--bg-2); color: var(--text-dim); border-radius: 999px; padding: 6px 13px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.wa-chipf.on { background: var(--yellow); color: var(--ink); font-weight: 700; }
.wa-items { flex: 1; overflow-y: auto; min-height: 0; }
.wa-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 16px; border: 0; background: transparent; cursor: pointer; text-align: left; color: var(--text); font: inherit; position: relative; }
.wa-item::after { content: ''; position: absolute; left: 76px; right: 0; bottom: 0; height: 1px; background: var(--border); }
.wa-item:hover { background: var(--surface-2); }
.wa-item.on { background: var(--bg-2); }
.wa-item-body { flex: 1; min-width: 0; display: grid; gap: 2px; }
.wa-item-top, .wa-item-bot { display: flex; align-items: center; gap: 8px; min-width: 0; }
.wa-item-t { flex: 1; min-width: 0; font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wa-item-when { font-size: 12.5px; color: var(--text-faint); flex-shrink: 0; }
.wa-item.unread .wa-item-when { color: var(--ink); font-weight: 800; }
.wa-item-p { flex: 1; min-width: 0; font-size: 12.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px; }
.wa-item.unread .wa-item-p { color: var(--text); font-weight: 600; }
.wa-badge { min-width: 21px; height: 21px; padding: 0 6px; border-radius: 999px; background: var(--yellow); color: var(--ink); font-size: 12.5px; font-weight: 800; display: grid; place-items: center; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(10,10,10,.08); }
.wa-ico { width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: var(--ink); color: var(--yellow); }

.wa-thread { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: #EFEEE9; }
.wa-head { display: flex; align-items: center; gap: 12px; padding: 10px 16px; min-height: 64px; background: var(--surface); border-bottom: 1px solid var(--border); }
.wa-head-t { font-weight: 800; font-size: 15px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wa-head-s { font-size: 12.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wa-back { display: none; border: 0; background: transparent; color: var(--text); padding: 6px; margin-left: -8px; border-radius: 50%; cursor: pointer; }
.wa-wall { flex: 1; overflow-y: auto; min-height: 0; padding: 14px 6% 10px;
  background-color: #EFEEE9;
  background-image: radial-gradient(rgba(10,10,10,.06) 1px, transparent 1.2px), radial-gradient(rgba(255,236,0,.22) 1.4px, transparent 1.6px);
  background-size: 22px 22px, 66px 66px; background-position: 0 0, 11px 11px; }
.wa-empty { height: 100%; display: grid; place-items: center; }
.wa-msgs { display: flex; flex-direction: column; }
.wa-day { display: flex; justify-content: center; margin: 12px 0 8px; position: sticky; top: 0; z-index: 1; }
.wa-day span { background: var(--surface); color: var(--text-dim); font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 8px; box-shadow: 0 1px 1px rgba(10,10,10,.08); text-transform: capitalize; }
.wa-row { display: flex; align-items: flex-end; gap: 6px; margin-top: 2px; }
.wa-row.head { margin-top: 8px; }
.wa-row.out { justify-content: flex-end; }
.wa-row.in > :first-child:not(.wa-bubble) { align-self: flex-start; }
.wa-av-gap { width: 28px; flex-shrink: 0; }
.wa-bubble { position: relative; max-width: min(72%, 560px); padding: 6px 9px 7px 10px; border-radius: 12px; font-size: 14.2px; line-height: 1.4;
  box-shadow: 0 1px 1px rgba(10,10,10,.1); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ink); }
.wa-bubble.in { background: #fff; }
.wa-bubble.out { background: #FFF27A; }
.wa-bubble.tail.in { border-top-left-radius: 0; }
.wa-bubble.tail.out { border-top-right-radius: 0; }
.wa-bubble.tail::before { content: ''; position: absolute; top: 0; width: 9px; height: 13px; }
.wa-bubble.tail.in::before { left: -8px; background: #fff; clip-path: polygon(100% 0, 0 0, 100% 100%); }
.wa-bubble.tail.out::before { right: -8px; background: #FFF27A; clip-path: polygon(0 0, 100% 0, 0 100%); }
.wa-bubble.hl { box-shadow: 0 0 0 2px var(--ink), 0 1px 1px rgba(10,10,10,.1); }
.wa-name { font-size: 12.5px; font-weight: 800; color: var(--ink); margin-bottom: 1px; }
.wa-name span { color: var(--text-faint); font-weight: 600; }
.wa-time { float: right; font-size: 11px; color: rgba(10,10,10,.5); margin: 8px 0 -4px 10px; line-height: 1; position: relative; top: 2px; }
.wa-tick { display: inline-flex; margin-left: 3px; vertical-align: -2px; color: rgba(10,10,10,.42); }
.wa-tick svg + svg { margin-left: -7px; }
.wa-tick.read { color: var(--ink); }
.wa-bubble.media .wa-time { float: none; display: block; text-align: right; margin: 2px 0 0; }
.wa-comp-wrap { background: var(--surface); border-top: 1px solid var(--border); position: relative; }
.wa-chip { padding-top: 2px; }
.wa-comp { display: flex; align-items: flex-end; gap: 6px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); }
.wa-attach .btn, .wa-tagbtn { width: 42px; height: 42px; padding: 0 !important; border-radius: 50%; display: grid; place-items: center; border: 0; background: transparent; color: var(--text-dim); flex-shrink: 0; cursor: pointer; }
.wa-attach .btn:hover, .wa-tagbtn:hover { background: var(--surface-2); color: var(--text); }
.wa-tagbtn.on { background: var(--yellow); color: var(--ink); font-weight: 800; width: auto; min-width: 42px; padding: 0 10px !important; border-radius: 999px; display: inline-flex; gap: 3px; }
.wa-input { field-sizing: content; flex: 1; min-width: 0; box-sizing: border-box; display: block; white-space: pre-wrap; overflow-wrap: anywhere; resize: none; border: 1px solid var(--border); background: var(--bg); border-radius: 22px; padding: 11px 16px; font: inherit; font-size: 14px; line-height: 20px; min-height: 44px; color: var(--text); outline: none; max-height: 140px; overflow-y: auto; }
.wa-input:focus { border-color: var(--ink); background: var(--surface); }
.wa-send { width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--yellow); color: var(--ink); display: grid; place-items: center; cursor: pointer; flex-shrink: 0; transition: transform .12s, opacity .12s; }
.wa-send:not(:disabled):active { transform: scale(.94); }
.wa-send:disabled { opacity: .45; cursor: default; }
.wa-send svg { transform: translateX(-1px); }
.wa-spin { width: 18px; height: 18px; border: 2px solid rgba(10,10,10,.25); border-top-color: var(--ink); border-radius: 50%; animation: spin .7s linear infinite; }
.wa-blank { flex: 1; display: grid; place-items: center; text-align: center; padding: 30px; color: var(--text-dim); }
.wa-blank-mark { width: 74px; height: 74px; border-radius: 50%; background: var(--ink); display: grid; place-items: center; margin: 0 auto 14px; }
.wa-blank-mark img { width: 38px; }
.wa-readonly { padding: 12px; text-align: center; font-size: 12.5px; color: var(--text-faint); background: var(--surface); border-top: 1px solid var(--border); }
@media (max-width: 760px) {
  /* Telefono: la chat è a tutto schermo come WhatsApp. Va dalla barra in alto al fondo dello schermo
     visibile (o alla barra in basso nell'elenco), senza bordi né angoli; con la tastiera aperta si accorcia
     (--vvh = schermo visibile) e il campo di scrittura resta subito sopra. Misure da Shell. */
  .wa { position: fixed; left: 0; right: 0; z-index: 30; min-height: 0; border: 0; border-radius: 0;
    grid-template-columns: minmax(0, 1fr);
    top: calc(var(--vvtop, 0px) + var(--topbar-real, 64px));
    height: calc(var(--vvh, 100dvh) - var(--topbar-real, 64px) - var(--tabbar-real, 0px)); }
  .wa.open { height: calc(var(--vvh, 100dvh) - var(--topbar-real, 64px)); }
  .wa.open .wa-comp { padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
  body.kb-open .wa.open .wa-comp { padding-bottom: 8px; }
  /* iOS ingrandisce la pagina se il campo è sotto 16px: qui 16px, niente zoom quando tocchi */
  .wa-input { font-size: 16px; line-height: 22px; }
  .wa.open .wa-list { display: none; }
  .wa:not(.open) .wa-thread { display: none; }
  .wa-list { border-right: 0; }
  .wa-back { display: inline-flex; }
  .wa-wall { padding: 10px 10px 8px; }
  .wa-bubble { max-width: 84%; }
}
`
