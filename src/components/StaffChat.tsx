// Chat dello staff: i professionisti dello stesso atleta si scrivono tra loro, a due o in gruppo.
// Ogni conversazione la leggono solo i partecipanti (più AUVI). L'atleta le legge tutte, ci scrive
// e ne apre di nuove; sceglie lui se ricevere le notifiche (spente di base). In ogni messaggio si
// possono taggare persone del team: entrano nella conversazione e ricevono la notifica.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { initials } from '../lib/format'
import { Modal, Spinner, Empty } from './ui'
import Icon from './Icon'
import { ChatAvatar, useChatPhotos } from './ChatAvatar'
import { useAttach } from './ChatAttachment'
import { WA_CSS, WaItem, WaMessages, WaComposer, listWhen, seenAt, markSeen } from './WaChat'

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

export default function StaffChat({ openThread, switcher }: { openThread?: string | null; switcher?: React.ReactNode }) {
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
  const [q, setQ] = useState('')
  const [unread, setUnread] = useState<Record<string, number>>({})
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
    const list = (data as Thread[]) || []
    setThreads(list)
    setLoading(false)
    // non letti (su questo dispositivo): conversazioni mosse dopo l'ultima apertura
    const u: Record<string, number> = {}
    for (const th of list) {
      const k = `staff:${me}:${th.id}`
      const seen = seenAt(k)
      if (!seen) markSeen(k, th.last_at)
      else if (th.last_at > seen) u[th.id] = 1
    }
    setUnread(u)
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
    const list = (data as Msg[]) || []
    setMsgs(list)
    if (list.length) markSeen(`staff:${me}:${id}`, list[list.length - 1].created_at)
    setUnread(u => ({ ...u, [id]: 0 }))
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
  const threadAvatar = (th: Thread, size = 48) => th.title
    ? <span className="wa-ico" style={{ width: size, height: size }}><Icon name="users" size={Math.round(size * .42)} /></span>
    : <ChatAvatar size={size} name={titleOf(th)} role={others(th)[0]?.role} photo={photoOf(others(th)[0]?.user_id, others(th)[0]?.role)} />
  const shown = threads.filter(th => !q.trim() || (titleOf(th) + ' ' + subOf(th)).toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className={`wa ${thread ? 'open' : ''}`}>
      <style>{WA_CSS + SC_CSS}</style>

      {/* elenco conversazioni */}
      <div className="wa-list">
        <div className="wa-list-head">
          <div className="wa-list-title">
            <h3>{isPlayer ? t('Il tuo staff') : t('Staff')}</h3>
            {canCreate && <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> {t('Nuova')}</button>}
          </div>
          {threads.length > 4 && (
            <label className="wa-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Cerca')} />
            </label>
          )}
          {switcher}
          <div className="sc-note">
            {isPlayer
              ? t('Qui i tuoi professionisti si coordinano tra loro. Puoi scrivere anche tu e taggare chi deve occuparsene.')
              : <><Icon name="eye" size={12} /> {t('Ogni chat la leggono solo i partecipanti, AUVI e l\'atleta, per trasparenza.')}</>}
            {(isPlayer || isAdmin) && (
              <button className={`sc-toggle ${notify ? 'on' : ''}`} onClick={toggleNotify} title={isAdmin ? t('Scelta dell\'atleta') : undefined}>
                <span className="sc-knob" /> {isPlayer
                  ? (notify ? t('Notifiche attive') : t('Notifiche spente'))
                  : (notify ? t('Atleta: notifiche attive') : t('Atleta: notifiche spente'))}
              </button>
            )}
          </div>
        </div>
        <div className="wa-items">
          {threads.length === 0 ? (
            <div style={{ padding: 18 }}>
              <Empty icon={<Icon name="message" size={28} strokeWidth={1.4} />} title={t('Nessuna conversazione')}
                hint={isPlayer ? t('Apri una conversazione con il tuo staff con «Nuova».') : t('Scrivi a un collega o crea un gruppo con chi segue l\'atleta.')} />
            </div>
          ) : shown.map(th => (
            <WaItem key={th.id} active={active === th.id} avatar={threadAvatar(th)} title={titleOf(th)}
              when={listWhen(th.last_at, t)} unread={active === th.id ? 0 : unread[th.id]}
              preview={<span>{subOf(th)}</span>} onClick={() => setActive(th.id)} />
          ))}
        </div>
      </div>

      {/* conversazione */}
      <div className="wa-thread">
        {!thread ? (
          <div className="wa-blank">
            <div>
              <div className="wa-blank-mark"><img src="/brand/auvi-mark-yellow.svg" alt="" /></div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{t('Scegli una conversazione')}</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>{t('Ogni chat la leggono solo i partecipanti, AUVI e l\'atleta, per trasparenza.')}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="wa-head">
              <button className="wa-back" onClick={() => setActive(null)} aria-label={t('Indietro')}><Icon name="chevron-left" size={22} /></button>
              {threadAvatar(thread, 40)}
              <div style={{ minWidth: 0 }}>
                <div className="wa-head-t">{titleOf(thread)}</div>
                <div className="wa-head-s">
                  {thread.crm_staff_members.map(m => `${m.name || ''} (${t(STAFF_ROLE[m.role || ''] || 'Professionista')})`).join(', ')}
                </div>
              </div>
            </div>
            <WaMessages msgs={msgs} me={me} photoOf={photoOf}
              names={m => t(STAFF_ROLE[m.sender_role || ''] || 'Professionista')}
              decorate={m0 => {
                const m = m0 as Msg
                const tagged = (m.mentions || []).map(nameOf).concat(m.mention_auvi ? ['AUVI'] : [])
                const meTagged = !!me && ((m.mentions || []).includes(me) || (!!m.mention_auvi && isTeam))
                if (!tagged.length) return null
                return {
                  highlight: meTagged,
                  pre: <div className="sc-tagrow">
                    {meTagged && <span className="sc-tag me">{t('Ti ha taggato')}</span>}
                    {tagged.map((n, i) => <span key={i} className="sc-tag">@{n}</span>)}
                  </div>,
                }
              }}
              empty={<Empty icon={<Icon name="message" size={28} strokeWidth={1.4} />} title={t('Nessun messaggio')} hint={canWrite ? t('Scrivi il primo messaggio.') : ''} />} />
            {canWrite ? (
              <WaComposer value={text} placeholder={t('Scrivi allo staff… (@ per taggare)')}
                onChange={v => { setText(v); if (v.endsWith('@') && !picking) setPicking(true) }}
                onSend={send} busy={busy} canSend={!!text.trim() || !!attach.pending} attach={attach}
                onKeyDown={e => { if (e.key === 'Escape') setPicking(false) }}
                extra={
                  <button type="button" className={`wa-tagbtn ${tags.length ? 'on' : ''}`} title={t('Tagga una persona')} onClick={() => setPicking(v => !v)}>
                    <Icon name="at-sign" size={19} />{tags.length > 0 && <span>{tags.length}</span>}
                  </button>
                }
                above={<>
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
                      <span className="faint" style={{ fontSize: 12.5 }}>{t('riceveranno una notifica')}</span>
                    </div>
                  )}
                  {picking && (
                    <div className="sc-picker">
                      <div className="t-label" style={{ padding: '4px 8px 6px', color: 'inherit' }}>{t('Tagga una persona')}</div>
                      {tagOpts.length === 0 && <div className="faint" style={{ padding: 8, fontSize: 12.5 }}>{t('Nessun altro professionista collegato a questo atleta.')}</div>}
                      {tagOpts.map(o => {
                        const on = tags.includes(o.id)
                        return (
                          <button key={o.id} className={`sc-opt ${on ? 'on' : ''}`}
                            onClick={() => { setTags(ts => on ? ts.filter(y => y !== o.id) : [...ts, o.id]); setText(x => x.replace(/@$/, '')); setPicking(false) }}>
                            <span className="sc-av" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(o.name)}</span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: 'block', fontWeight: 800, fontSize: 12.5 }}>{o.name}</span>
                              <span className="faint" style={{ display: 'block', fontSize: 11 }}>{t(STAFF_ROLE[o.role] || o.role)}</span>
                            </span>
                            {on && <Icon name="check" size={14} />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>} />
            ) : (
              <div className="wa-readonly">
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
                <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name || '-'}</div>
                <div className="faint" style={{ fontSize: 12.5 }}>{t(STAFF_ROLE[p.role] || p.role)}</div>
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
.sc-note { display: grid; gap: 8px; font-size: 12.5px; line-height: 1.45; color: var(--text-dim); }
.sc-av { width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--bg-2); border: 1px solid var(--border); font-weight: 800; font-size: 12.5px; }
.sc-toggle { display: inline-flex; align-items: center; gap: 8px; justify-self: start; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); border-radius: 999px; padding: 5px 12px 5px 5px; font-weight: 700; font-size: 12.5px; cursor: pointer; }
.sc-knob { width: 30px; height: 18px; border-radius: 999px; background: var(--border); position: relative; transition: background .2s; }
.sc-knob::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.sc-toggle.on { color: var(--text); }
.sc-toggle.on .sc-knob { background: var(--green, #1a9e55); }
.sc-toggle.on .sc-knob::after { transform: translateX(12px); }
.sc-tagrow { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.sc-tag { display: inline-flex; align-items: center; gap: 4px; background: #FFE600; color: #0A0A0A; border-radius: 999px; padding: 2px 8px; font-size: 12.5px; font-weight: 800; white-space: nowrap; }
.sc-tag.me { background: #0A0A0A; color: #FFE600; }
.sc-tag.big { font-size: 12.5px; padding: 3px 6px 3px 10px; }
.sc-tag button { border: 0; background: rgba(0,0,0,.12); color: inherit; border-radius: 50%; width: 17px; height: 17px; display: grid; place-items: center; cursor: pointer; padding: 0; }
.sc-tagbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 14px 0; font-size: 12.5px; }
.sc-tagrow .sc-tag { font-size: 11px; }
.sc-picker { position: absolute; bottom: 100%; left: 12px; margin-bottom: 6px; width: 280px; max-height: 300px; overflow-y: auto; background: var(--card, #fff); border: 1px solid var(--border); border-radius: 20px; box-shadow: 0 12px 32px rgba(0,0,0,.16); padding: 6px; z-index: 5; }
.sc-opt { display: flex; align-items: center; gap: 9px; width: 100%; border: 0; background: transparent; color: var(--text); text-align: left; padding: 7px 8px; border-radius: 12px; cursor: pointer; }
.sc-opt:hover, .sc-opt.on { background: var(--bg-2); }
.sc-pick { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer; }
.sc-pick.on { border-color: var(--text); background: var(--bg-2); }
.sc-pick img { width: 34px; height: 34px; border-radius: 12px; object-fit: cover; }
`
