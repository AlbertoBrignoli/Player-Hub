import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { timeAgo } from '../lib/format'
import type { NotificationItem } from '../lib/types'

export default function NotificationBell({ goto }: { goto: (route: string) => void }) {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const role = isAdmin ? 'admin' : 'player'

  async function load() {
    const { data } = await supabase.from('crm_notifications')
      .select('*').order('created_at', { ascending: false }).limit(25)
    setItems((data as NotificationItem[]) || [])
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('crm_notifications_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_notifications' }, payload => {
        const n = payload.new as NotificationItem
        if (n.recipient_role === role) setItems(prev => [n, ...prev].slice(0, 25))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const unread = items.filter(n => !n.read_at).length

  async function markAllRead() {
    if (!unread) return
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    await supabase.from('crm_notifications').update({ read_at: now }).is('read_at', null)
  }

  function onItem(n: NotificationItem) {
    setOpen(false)
    if (n.route) goto(n.route)
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button className="btn-ghost bell" title="Notifiche" onClick={() => { setOpen(o => !o); if (!open) markAllRead() }}>
        🔔{unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="notif-head">Notifiche</div>
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
