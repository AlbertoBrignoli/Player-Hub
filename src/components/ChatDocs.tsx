// I documenti mandati in chat finiscono anche nell'area documenti del professionista:
// legge gli allegati di crm_messages per atleta e canale (stesse regole di chi vede la chat).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { fileUrl, fmtSize, isImage } from '../lib/chatFiles'
import { fmtDate } from '../lib/format'
import { goto } from '../lib/route'
import { toast } from '../lib/toast'
import Icon from './Icon'

type Row = { id: string; channel: string | null; sender_name: string | null; created_at: string
  file_path: string; file_name: string | null; file_mime: string | null; file_size: number | null }

const CHAN_L: Record<string, string> = {
  team: 'Management', agente: 'Procuratore', assicuratore: 'Assicuratore', commercialista: 'Commercialista',
  fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager', fitness: 'Preparatore',
}
const chanLabel = (c: string | null) => !c ? 'Management' : c.startsWith('brand:') ? 'Brand' : CHAN_L[c] || c

// channel assente = tutte le chat dell'atleta (archivio dell'atleta e di AUVI)
export default function ChatDocs({ channel, playerId, accent }: { channel?: string; playerId?: number; accent?: string }) {
  const { t } = useLang()
  const { athleteId } = useAthlete()
  const pid = playerId ?? athleteId
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    if (!pid) { setRows([]); return }
    let ok = true
    let q = supabase.from('crm_messages')
      .select('id, channel, sender_name, created_at, file_path, file_name, file_mime, file_size')
      .eq('player_id', pid).not('file_path', 'is', null).order('created_at', { ascending: false })
    if (channel) q = channel === 'team' ? q.or('channel.is.null,channel.eq.team') : q.eq('channel', channel)
    q.then(({ data }) => { if (ok) setRows((data as Row[]) || []) })
    return () => { ok = false }
  }, [pid, channel])

  if (!rows || rows.length === 0) return null

  async function open(r: Row) {
    const w = window.open('', '_blank')
    const u = await fileUrl(r.file_path)
    if (u && w) w.location.href = u
    else { w?.close(); toast(t('File non disponibile'), 'err') }
  }
  function toChat(ch: string | null) {
    try { sessionStorage.setItem('chat_channel', ch || 'team') } catch { /* storage non disponibile */ }
    goto('messages')
  }

  return (
    <div className="card">
      <div className="flex between" style={{ alignItems: 'center', marginBottom: 10, gap: 10 }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
          <span style={{ width: 3, height: 15, background: accent || 'var(--text)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800 }}>{t('Dalla chat')}</span>
          <span className="faint" style={{ fontSize: 12 }}>{rows.length}</span>
        </div>
        {channel && <button className="btn btn-sm btn-ghost" onClick={() => toChat(channel)}><Icon name="message" size={13} /> {t('Apri la chat')}</button>}
      </div>
      <div className="list">
        {rows.map(r => {
          const ext = (r.file_name || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'
          return (
            <div className="row" key={r.id}>
              <span style={{ width: 34, height: 38, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 900,
                background: ext === 'PDF' ? '#E5484D' : 'var(--text-dim)', color: '#fff' }}>
                {isImage(r.file_mime) ? <Icon name="image" size={15} /> : ext}
              </span>
              <div className="row-main">
                <div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.file_name || 'file'}</div>
                <div className="row-sub">
                  {[r.sender_name, channel ? null : t(chanLabel(r.channel)), fmtDate(r.created_at), fmtSize(r.file_size)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => open(r)}>{t('Apri')}</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
