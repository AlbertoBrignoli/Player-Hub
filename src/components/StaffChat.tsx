// Chat dello staff: i professionisti dello stesso atleta si scrivono tra loro, a due o in gruppo.
// Ogni conversazione la leggono solo i partecipanti (più AUVI). L'atleta le legge tutte, ci scrive
// e ne apre di nuove; sceglie lui se ricevere le notifiche (spente di base). In ogni messaggio si
// possono taggare persone del team: entrano nella conversazione e ricevono la notifica.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { fmtDateTime, initials } from '../lib/format'
import { Modal, Spinner, Empty } from './ui'
import Icon from './Icon'
import { ChatAvatar, useChatPhotos } from './ChatAvatar'
import { ChatAttachment, useAttach } from './ChatAttachment'

type Member = { user_id: string; role: string | null; name: string | null }
type Thread = { id: string; player_id: number; title: string | null; created_by: string; last_at: string; crm_staff_members: Member[] }
type Msg = { id: string; thread_id: string; sender_id: string; sender_name: string | null; sender_role: string | null; body: string; created_at: string
  file_path?: string | null; file_name?: string | null; file_mime?: string | null; file_size?: number | null
  mentions?: string[] | null; mention_auvi?: boolean | null }
type Pro = { pro_id: string; role: string; name: string | null; photo_url: string | null }

export const STAFF_ROLE: Record<string, string> = {
  admin: 'AUVI', creator: 'AUVI', agente: 'Procuratore', preparatore: 'Preparatore', assicuratore: 'Assicuratore',
  commercialista: 'Commercialista', fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager',
  player: 'Atleta',
}
const AUVI_TAG = 'auvi'
const TAG_C = '#FFE600'

export default function StaffChat({ openThread }: { openThread?: string | null }) {
  const { t } = useLang()
  const { session, profile, role, isAdmin } = useAuth()
  const { athleteId, athletes } = useAthlete()
  const me = session?.user.id
  const isPlayer = role === 'player'
  const isTeam = role === 'admin' || role === 'creator'
  const [threads, setThreads] = useState<Thread[]>([])
  const [team, setTeam] = useState<Pro[]>([])
  const [active, setActive] = useState<string | null>(openThread || null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [notify, setNotify] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const athlete = athletes.find(a => a.api_player_id === athleteId)
  const photoOf = useChatPhotos()
  const attach = useAttach(me)
  const [tags, setTags] = useState<string[]>([])     // pro_id taggati (o AUVI_TAG)
  const [picking, setPicking] = useState(false)

  async function loadThreads() {
    if (!athleteId) { setThreads([]); setLoading(false); return }
    const { data } = await supabase.from('crm_staff_threads')
      .select('id, player_id, title, created_by, last_at, crm_staff_members(user_id, role, name)')
      .eq('player_id', athleteId).order('last_at', { ascending: false })
    setThreads((data as Thread[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true); loadThreads()
    if (!athleteId) return
    supabase.from('crm_athlete_team').select('pro_id, role, name, photo_url').eq('player_id', athleteId)
      .then(({ data }) => setTeam(((data as Pro[]) || []).filter(p => p.pro_id && p.pro_id !== me)))
    if (isPlayer || isAdmin) supabase.from('crm_athlete_prefs').select('staff_notify').eq('player_id', athleteId).maybeSingle()
      .then(({ data }) => setNotify(!!(data as any)?.staff_notify))
  }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (openThread) setActive(openThread) }, [openThread])

  async function loadMsgs(id: string) {
    const { data } = await supabase.from('crm_staff_messages').select('*').eq('thread_id', id).order('created_at')
    setMsgs((data as Msg[]) || [])
  }
  useEffect(() => {
    if (!active) { setMsgs([]); return }
    loadMsgs(active)
    const ch = supabase.channel('staff_' + active)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_staff_messages', filter: `thread_id=eq.${active}` },
        () => { loadMsgs(active); loadThreads() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  const thread = threads.find(x => x.id === active) || null
  const isMember = (th: Thread) => th.crm_staff_members.some(m => m.user_id === me)
  const canWrite = !!thread && (isMember(thread) || isAdmin || isPlayer)
  // chi si può taggare: il team dell'atleta, più AUVI per chi non è AUVI
  const tagOpts = [
    ...(isTeam ? [] : [{ id: AUVI_TAG, name: 'AUVI', role: 'admin' }]),
    ...team.map(p => ({ id: p.pro_id, name: p.name || t(STAFF_ROLE[p.role] || p.role), role: p.role })),
  ]
  const nameOf = (uid: string) => team.find(p => p.pro_id === uid)?.name
    || thread?.crm_staff_members.find(m => m.user_id === uid)?.name || t('Professionista')
  const others = (th: Thread) => th.crm_staff_members.filter(m => isMember(th) ? m.user_id !== me : true)
  const titleOf = (th: Thread) => th.title || others(th).map(m => m.name || t(STAFF_ROLE[m.role || ''] || 'Professionista')).join(' · ')
  const subOf = (th: Thread) => others(th).map(m => t(STAFF_ROLE[m.role || ''] || 'Professionista')).join(' · ')

  async function send() {
    if ((!text.trim() && !attach.pending) || !thread || !me) return
    setBusy(true)
    const att = await attach.take()
    if (att === false) { setBusy(false); return }
    const name = profile?.full_name || profile?.email || ''
    const { error } = await supabase.from('crm_staff_messages').insert({
      thread_id: thread.id, sender_id: me, sender_role: role,
      sender_name: isTeam ? `AUVI · ${name}` : name, body: text.trim() || att?.file_name || '',
      mentions: tags.filter(x => x !== AUVI_TAG), mention_auvi: tags.includes(AUVI_TAG),
      ...(att || {}),
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    if (tags.length) toast(t('Taggati: {names}').replace('{names}', tags.map(x => x === AUVI_TAG ? 'AUVI' : nameOf(x)).join(', ')))
    setText(''); setTags([]); loadMsgs(thread.id); loadThreads()
  }

  async function toggleNotify() {
    if (!athleteId) return
    const next = !notify
    const { error } = await supabase.rpc('crm_set_staff_notify', { p_player: athleteId, p_on: next })
    if (error) { toast(t(error.message), 'err'); return }
    setNotify(next)
    toast(next ? t('Notifiche dello staff attive') : t('Notifiche dello staff spente'))
  }

  if (!athleteId) return <div className="card"><Empty icon={<Icon name="users" size={30} strokeWidth={1.4} />} title={t('Scegli un atleta')} hint="" /></div>
  if (loading) return <Spinner />

  const canCreate = isTeam || team.length > 0

  return (
    <div className={`sc ${thread ? 'sc-open' : ''}`}>
      <style>{SC_CSS}</style>

      {/* elenco conversazioni */}
      <div className="sc-list card">
        {isPlayer ? (
          <div className="sc-note">
            <div className="flex between" style={{ alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{t('Il tuo staff')}</div>
              {canCreate && <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> {t('Nuova')}</button>}
            </div>
            <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {t('Qui i tuoi professionisti si coordinano tra loro. Puoi scrivere anche tu e taggare chi deve occuparsene.')}
            </div>
            <button className={`sc-toggle ${notify ? 'on' : ''}`} onClick={toggleNotify}>
              <span className="sc-knob" /> {notify ? t('Notifiche attive') : t('Notifiche spente')}
            </button>
          </div>
        ) : (
          <div className="sc-note">
            <div className="flex between" style={{ alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{t('Staff di {name}').replace('{name}', athlete?.name || t('atleta'))}</div>
              {canCreate && <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> {t('Nuova')}</button>}
            </div>
            <div className="faint" style={{ fontSize: 12, lineHeight: 1.45 }}>
              <Icon name="eye" size={12} /> {t('Ogni chat la leggono solo i partecipanti, AUVI e l\'atleta, per trasparenza.')}
            </div>
            {isAdmin && (
              <button className={`sc-toggle ${notify ? 'on' : ''}`} onClick={toggleNotify} title={t('Scelta dell\'atleta')}>
                <span className="sc-knob" /> {notify ? t('Atleta: notifiche attive') : t('Atleta: notifiche spente')}
              </button>
            )}
          </div>
        )}

        {threads.length === 0 ? (
          <div style={{ padding: 18 }}>
            <Empty icon={<Icon name="message" size={28} strokeWidth={1.4} />} title={t('Nessuna conversazione')}
              hint={isPlayer ? t('Apri una conversazione con il tuo staff con «Nuova».') : t('Scrivi a un collega o crea un gruppo con chi segue l\'atleta.')} />
          </div>
        ) : threads.map(th => (
          <button key={th.id} className={`sc-item ${active === th.id ? 'on' : ''}`} onClick={() => setActive(th.id)}>
            {th.title
              ? <div className="sc-av"><Icon name="users" size={16} /></div>
              : <ChatAvatar size={38} name={titleOf(th)} role={others(th)[0]?.role} photo={photoOf(others(th)[0]?.user_id, others(th)[0]?.role)} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sc-t">{titleOf(th)}</div>
              <div className="sc-s">{th.title ? subOf(th) : subOf(th)}</div>
            </div>
            <div className="sc-d">{fmtDateTime(th.last_at)}</div>
          </button>
        ))}
      </div>

      {/* conversazione */}
      <div className="sc-thread card">
        {!thread ? (
          <div style={{ margin: 'auto', padding: 24 }}>
            <Empty icon={<Icon name="message" size={30} strokeWidth={1.4} />} title={t('Scegli una conversazione')} hint="" />
          </div>
        ) : (
          <>
            <div className="sc-head">
              <button className="btn btn-sm btn-ghost sc-back" onClick={() => setActive(null)}><Icon name="chevron-left" size={16} /></button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{titleOf(thread)}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>
                  {thread.crm_staff_members.map(m => `${m.name || ''} (${t(STAFF_ROLE[m.role || ''] || 'Professionista')})`).join(' · ')}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
              {msgs.length === 0 ? (
                <Empty icon={<Icon name="message" size={28} strokeWidth={1.4} />} title={t('Nessun messaggio')} hint={canWrite ? t('Scrivi il primo messaggio.') : ''} />
              ) : (
                <div className="chat">
                  {msgs.map(m => {
                    const mine = m.sender_id === me
                    const tagged = (m.mentions || []).map(nameOf).concat(m.mention_auvi ? ['AUVI'] : [])
                    const meTagged = !!me && ((m.mentions || []).includes(me) || (!!m.mention_auvi && isTeam))
                    return (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                        {!mine && <div className="flex gap" style={{ marginBottom: 4, gap: 7, alignItems: 'center' }}>
                          <ChatAvatar name={m.sender_name} role={m.sender_role} photo={photoOf(m.sender_id, m.sender_role)} />
                          <span className="faint" style={{ fontSize: 11 }}>{m.sender_name} · {t(STAFF_ROLE[m.sender_role || ''] || 'Professionista')}</span>
                        </div>}
                        <div className={`bubble ${mine ? 'bubble-out' : 'bubble-in'}`}
                          style={{ whiteSpace: 'pre-wrap', ...(meTagged ? { boxShadow: `0 0 0 2px ${TAG_C}` } : {}) }}>
                          {tagged.length > 0 && <div className="sc-tagrow">
                            {meTagged && <span className="sc-tag me">{t('Ti ha taggato')}</span>}
                            {tagged.map((n, i) => <span key={i} className="sc-tag">@{n}</span>)}
                          </div>}
                          {m.file_path && <ChatAttachment path={m.file_path} name={m.file_name} mime={m.file_mime} size={m.file_size} mine={mine} />}
                          {(!m.file_path || m.body !== m.file_name) && m.body}
                          <div className="bubble-meta">{fmtDateTime(m.created_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={endRef} />
                </div>
              )}
            </div>
            {canWrite ? (
              <div style={{ borderTop: '1px solid var(--border)', position: 'relative' }}>
                {attach.chip}
                {tags.length > 0 && (
                  <div className="sc-tagbar">
                    <Icon name="at-sign" size={14} />
                    <span style={{ fontWeight: 800 }}>{t('Stai taggando')}:</span>
                    {tags.map(x => (
                      <span key={x} className="sc-tag big">
                        @{x === AUVI_TAG ? 'AUVI' : nameOf(x)}
                        <button onClick={() => setTags(ts => ts.filter(y => y !== x))} aria-label={t('Rimuovi')}><Icon name="x" size={11} /></button>
                      </span>
                    ))}
                    <span className="faint" style={{ fontSize: 11.5 }}>{t('riceveranno una notifica')}</span>
                  </div>
                )}
                {picking && (
                  <div className="sc-picker">
                    <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px 6px' }}>{t('Tagga una persona')}</div>
                    {tagOpts.length === 0 && <div className="faint" style={{ padding: 8, fontSize: 12.5 }}>{t('Nessun altro professionista collegato a questo atleta.')}</div>}
                    {tagOpts.map(o => {
                      const on = tags.includes(o.id)
                      return (
                        <button key={o.id} className={`sc-opt ${on ? 'on' : ''}`}
                          onClick={() => { setTags(ts => on ? ts.filter(y => y !== o.id) : [...ts, o.id]); setText(x => x.replace(/@$/, '')); setPicking(false) }}>
                          <span className="sc-av" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(o.name)}</span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontWeight: 800, fontSize: 13 }}>{o.name}</span>
                            <span className="faint" style={{ display: 'block', fontSize: 11 }}>{t(STAFF_ROLE[o.role] || o.role)}</span>
                          </span>
                          {on && <Icon name="check" size={14} />}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="flex gap" style={{ padding: 12, gap: 6 }}>
                  {attach.button}
                  <button type="button" className={`btn ${tags.length ? '' : 'btn-ghost'}`} title={t('Tagga una persona')} onClick={() => setPicking(v => !v)}
                    style={{ padding: '0 10px', flexShrink: 0, fontWeight: 800, ...(tags.length ? { background: TAG_C, color: '#0A0A0A', borderColor: TAG_C } : {}) }}>
                    <Icon name="at-sign" size={17} />{tags.length > 0 && <span style={{ marginLeft: 3 }}>{tags.length}</span>}
                  </button>
                  <input className="input" placeholder={t('Scrivi allo staff… (@ per taggare)')} value={text}
                    onChange={e => { const v = e.target.value; setText(v); if (v.endsWith('@') && !picking) setPicking(true) }}
                    onKeyDown={e => { if (e.key === 'Escape') setPicking(false); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
                  <button className="btn btn-primary" disabled={busy || (!text.trim() && !attach.pending)} onClick={send}>{busy && attach.uploading ? t('Carico…') : t('Invia')}</button>
                </div>
              </div>
            ) : (
              <div className="faint" style={{ padding: 12, borderTop: '1px solid var(--border)', fontSize: 12.5, textAlign: 'center' }}>
                <Icon name="eye" size={12} /> {isPlayer ? t('Puoi leggere: scrivono solo i professionisti.') : t('Sola lettura')}
              </div>
            )}
          </>
        )}
      </div>

      {creating && <NewThread team={team} onClose={() => setCreating(false)}
        onCreate={async (ids, title) => {
          const { data, error } = await supabase.rpc('crm_staff_open', { p_player: athleteId, p_members: ids, p_title: title || null })
          if (error) { toast(t(error.message), 'err'); return }
          setCreating(false)
          await loadThreads()
          setActive(String(data))
        }} />}
    </div>
  )
}

function NewThread({ team, onClose, onCreate }: { team: Pro[]; onClose: () => void; onCreate: (ids: string[], title: string) => void }) {
  const { t } = useLang()
  const [sel, setSel] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const group = sel.length > 1
  const toggle = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  return (
    <Modal title={t('Nuova conversazione')} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={!sel.length || (group && !title.trim())} onClick={() => onCreate(sel, group ? title.trim() : '')}>
          {group ? t('Crea gruppo') : t('Apri chat')}
        </button>
      </>}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="faint" style={{ fontSize: 12.5 }}>{t('Scegli una persona per una chat a due, più persone per un gruppo.')}</div>
        {team.length === 0 && <div className="faint">{t('Nessun altro professionista collegato a questo atleta.')}</div>}
        <div className="grid" style={{ gap: 6 }}>
          {team.map(p => (
            <label key={p.pro_id} className={`sc-pick ${sel.includes(p.pro_id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.includes(p.pro_id)} onChange={() => toggle(p.pro_id)} />
              {p.photo_url ? <img src={p.photo_url} alt="" /> : <span className="sc-av" style={{ width: 34, height: 34 }}>{initials(p.name)}</span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name || '—'}</div>
                <div className="faint" style={{ fontSize: 12 }}>{t(STAFF_ROLE[p.role] || p.role)}</div>
              </div>
            </label>
          ))}
        </div>
        {group && (
          <div className="field"><label>{t('Nome del gruppo')}</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Es. Rientro dall\'infortunio')} /></div>
        )}
      </div>
    </Modal>
  )
}

const SC_CSS = `
.sc { display: grid; grid-template-columns: 320px 1fr; gap: 12px; height: calc(100vh - 250px); min-height: 420px; }
.sc-list { padding: 0; overflow-y: auto; display: flex; flex-direction: column; }
.sc-thread { padding: 0; display: flex; flex-direction: column; min-height: 0; }
.sc-note { padding: 14px; border-bottom: 1px solid var(--border); display: grid; gap: 8px; }
.sc-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 0; border-bottom: 1px solid var(--border); background: transparent; text-align: left; cursor: pointer; color: var(--text); width: 100%; }
.sc-item.on { background: var(--bg-2); }
.sc-av { width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--bg-2); border: 1px solid var(--border); font-weight: 800; font-size: 13px; }
.sc-t { font-weight: 800; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-s { font-size: 11.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-d { font-size: 10.5px; color: var(--text-faint, var(--text-dim)); flex-shrink: 0; align-self: flex-start; }
.sc-head { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.sc-back { display: none; }
.sc-toggle { display: inline-flex; align-items: center; gap: 8px; justify-self: start; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); border-radius: 999px; padding: 5px 12px 5px 5px; font-weight: 700; font-size: 12.5px; cursor: pointer; }
.sc-knob { width: 30px; height: 18px; border-radius: 999px; background: var(--border); position: relative; transition: background .2s; }
.sc-knob::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.sc-toggle.on { color: var(--text); }
.sc-toggle.on .sc-knob { background: var(--green, #1a9e55); }
.sc-toggle.on .sc-knob::after { transform: translateX(12px); }
.sc-tagrow { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.sc-tag { display: inline-flex; align-items: center; gap: 4px; background: #FFE600; color: #0A0A0A; border-radius: 999px; padding: 2px 8px; font-size: 11.5px; font-weight: 800; white-space: nowrap; }
.sc-tag.me { background: #0A0A0A; color: #FFE600; }
.sc-tag.big { font-size: 12.5px; padding: 3px 6px 3px 10px; }
.sc-tag button { border: 0; background: rgba(0,0,0,.12); color: inherit; border-radius: 50%; width: 17px; height: 17px; display: grid; place-items: center; cursor: pointer; padding: 0; }
.sc-tagbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 14px 0; font-size: 12.5px; }
.sc-picker { position: absolute; bottom: 100%; left: 12px; margin-bottom: 6px; width: 280px; max-height: 300px; overflow-y: auto; background: var(--card, #fff); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,.16); padding: 6px; z-index: 5; }
.sc-opt { display: flex; align-items: center; gap: 9px; width: 100%; border: 0; background: transparent; color: var(--text); text-align: left; padding: 7px 8px; border-radius: 10px; cursor: pointer; }
.sc-opt:hover, .sc-opt.on { background: var(--bg-2); }
.sc-pick { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer; }
.sc-pick.on { border-color: var(--text); background: var(--bg-2); }
.sc-pick img { width: 34px; height: 34px; border-radius: 10px; object-fit: cover; }
@media (max-width: 760px) {
  .sc { grid-template-columns: 1fr; height: calc(100vh - 230px); }
  .sc.sc-open .sc-list { display: none; }
  .sc:not(.sc-open) .sc-thread { display: none; }
  .sc-back { display: inline-flex; }
}
`
