// Foto di chi scrive nelle chat: atleta (foto giocatore), professionisti (foto del profilo,
// da "Il mio team"), AUVI (marchio). Se la foto non c'è restano le iniziali.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { initials } from '../lib/format'

export function useChatPhotos() {
  const { athleteId, athletes } = useAthlete()
  const [pros, setPros] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!athleteId) { setPros({}); return }
    supabase.from('crm_athlete_team').select('pro_id, photo_url').eq('player_id', athleteId)
      .then(({ data }) => {
        const m: Record<string, string> = {}
        for (const r of (data as { pro_id: string | null; photo_url: string | null }[]) || []) if (r.pro_id && r.photo_url) m[r.pro_id] = r.photo_url
        setPros(m)
      })
  }, [athleteId])
  const athletePhoto = athletes.find(a => a.api_player_id === athleteId)?.photo_url || null
  return (senderId: string | null | undefined, role: string | null | undefined): string | null => {
    if (role === 'player') return athletePhoto
    if (role === 'admin' || role === 'creator') return '/brand/auvi-mark-yellow.svg'
    return (senderId && pros[senderId]) || null
  }
}

export function ChatAvatar({ name, photo, role, size = 26 }: { name: string | null | undefined; photo: string | null; role?: string | null; size?: number }) {
  const auvi = role === 'admin' || role === 'creator'
  const logo = role === 'brand'
  const base: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0 }
  if (photo) {
    if (logo) return <span style={{ ...base, background: '#fff', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
      <img src={photo} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
    </span>
    return auvi
      ? <span style={{ ...base, background: '#111', display: 'grid', placeItems: 'center' }}>
          <img src={photo} alt="" style={{ width: '62%', height: '62%', objectFit: 'contain' }} />
        </span>
      : <img src={photo} alt={name || ''} style={{ ...base, objectFit: 'cover', border: '1px solid var(--border)' }} />
  }
  return <div className="avatar" style={{ ...base, fontSize: Math.round(size * 0.42) }}>{initials(name)}</div>
}
