// Chat dello staff: i professionisti dello stesso atleta si scrivono tra loro, a due o in gruppo.
// Ogni conversazione la leggono solo i partecipanti (più AUVI). L'atleta può leggerle tutte
// (trasparenza) ma non scrive, e sceglie lui se ricevere le notifiche (spente di base).
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
  file_path?: string | null; file_name?: string | null; file_mime?: string | null; file_size?: number | null }
type Pro = { pro_id: string; role: string; name: string | null; photo_url: string | null }

export const STAFF_ROLE: Record<string, string> = {
  admin: 'AUVI', creator: 'AUVI', agente: 'Procuratore', preparatore: 'Preparatore', assicuratore: 'Assicuratore',
  commercialista: 'Commercialista', fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager',
}

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
  const canWrite = !!thread && (isMember(thread) || isAdmin)
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
      ...(att || {}),
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    setText(''); loadMsgs(thread.id); loadThreads()
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

  const canCreate = !isPlayer && (isTeam || team.length > 0)

  return (
    <div className={`sc ${thread ? 'sc-open' : ''}`}>
      <style>{SC_CSS}</style>

      {/* elenco conversazioni */}
      <div className="sc-list card">
        {isPlayer ? (
          <div className="sc-note">
            <div style={{ fontWeight: 800, fontSize: 14 }}>{t('Il tuo staff')}</div>
            <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {t('Qui i tuoi professionisti si coordinano tra loro. Puoi leggere tutto, senza dover rispondere.')}
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
              hint={isPlayer ? t('Quando il tuo staff si scrive, le conversazioni compaiono qui.') : t('Scrivi a un collega o crea un gruppo con chi segue l\'atleta.')} />
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
                    return (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                        {!mine && <div className="flex gap" style={{ marginBottom: 4, gap: 7, alignItems: 'center' }}>
                          <ChatAvatar name={m.sender_name} role={m.sender_role} photo={photoOf(m.sender_id, m.sender_role)} />
                          <span className="faint" style={{ fontSize: 11 }}>{m.sender_name} · {t(STAFF_ROLE[m.sender_role || ''] || 'Professionista')}</span>
                        </div>}
                        <div className={`bubble ${mine ? 'bubble-out' : 'bubble-in'}`} style={{ whiteSpace: 'pre-wrap' }}>
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
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {attach.chip}
                <div className="flex gap" style={{ padding: 12, gap: 6 }}>
                  {attach.button}
                  <input className="input" placeholder={t('Scrivi allo staff…')} value={text}
                    onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
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
