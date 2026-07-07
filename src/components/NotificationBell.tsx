import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { timeAgo } from '../lib/format'
import { enablePush, getPushState, isIosBrowser } from '../lib/push'
import Icon from './Icon'
import type { NotificationItem } from '../lib/types'

export default function NotificationBell({ goto }: { goto: (route: string) => void }) {
  const { role, session } = useAuth()
  const { athleteId } = useAthlete()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const [pushState, setPushState] = useState<'on' | 'off' | 'unsupported'>('unsupported')
  const [pushMsg, setPushMsg] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getPushState().then(setPushState)
    // Tap su una push col telefono: il service worker ci dice dove andare.
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'push-route' && e.data.route) goto(e.data.route) }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function activatePush() {
    if (!session || !role) return
    if (isIosBrowser()) {
      setPushMsg('Su iPhone: prima aggiungi l\'app alla schermata Home (Condividi → Aggiungi a Home), poi attiva da lì.')
      return
    }
    setPushMsg('')
    const err = await enablePush(session.user.id, role)
    if (err) setPushMsg(err)
    else { setPushState('on'); setPushMsg('Notifiche attive su questo dispositivo ✓') }
  }

  async function load() {
    if (!athleteId) { setItems([]); return }
    const { data } = await supabase.from('crm_notifications')
      .select('*').eq('player_id', athleteId).order('created_at', { ascending: false }).limit(25)
    setItems((data as NotificationItem[]) || [])
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('crm_notifications_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_notifications' }, payload => {
        const n = payload.new as NotificationItem
        const forThisAthlete = n.player_id === athleteId
        const mine = forThisAthlete && (n.recipient_role === role || (n.recipient_role === 'team' && (role === 'admin' || role === 'creator')))
        if (mine) setItems(prev => [n, ...prev].slice(0, 25))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [role, athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const unread = items.filter(n => !n.read_at).length

  async function markAllRead() {
    if (!unread || !athleteId) return
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    await supabase.from('crm_notifications').update({ read_at: now }).eq('player_id', athleteId).is('read_at', null)
  }

  function onItem(n: NotificationItem) {
    setOpen(false)
    if (n.route) goto(n.route)
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button className="btn-ghost bell" title="Notifiche" onClick={() => { setOpen(o => !o); if (!open) markAllRead() }}>
        <Icon name="bell" size={18} />{unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="notif-head flex between" style={{ alignItems: 'center' }}>
            <span>Notifiche</span>
            {pushState !== 'on' && (
              <button className="btn btn-sm" onClick={activatePush}><Icon name="smartphone" size={13} /> Attiva sul dispositivo</button>
            )}
          </div>
          {pushMsg && <div className="faint" style={{ padding: '8px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{pushMsg}</div>}
          {items.length === 0 ? (
            <div className="faint" style={{ padding: '14px 16px', fontSize: 13 }}>Nessuna notifica.</div>
          ) : items.map(n => (
            <button className={`notif-item ${!n.read_at ? 'notif-new' : ''}`} key={n.id} onClick={() => onItem(n)}>
              <div className="notif-title">{n.title}</div>
              {n.body && <div className="notif-body">{n.body}</div>}
              <div className="notif-time">{timeAgo(n.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
