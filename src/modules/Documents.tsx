import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, deleteRow } from '../lib/useData'
import { toast } from '../lib/toast'
import { Empty, Spinner, Badge, Select, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { goto } from '../lib/route'
import { fmtDate } from '../lib/format'
import type { Doc } from '../lib/types'
import { useLang } from '../lib/i18n'

const CATS: Record<string, string> = { contratto: 'Contratto', identita: 'Identità', medico: 'Medico', fiscale: 'Fiscale', altro: 'Altro' }
const BUCKET = 'crm-documents'

export default function Documents() {
  const { athleteId } = useAthlete()
  const { session, isAdmin } = useAuth()
  const { t } = useLang()
  const { rows, loading, reload } = useCollection<Doc>('crm_documents', { orderBy: 'created_at', match: { player_id: athleteId } })
  const [uploading, setUploading] = useState(false)
  const [cat, setCat] = useState('altro')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setErr('')
    const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (up.error) { setErr(up.error.message); setUploading(false); return }
    const ins = await insertRow('crm_documents', {
      name: file.name, category: cat, file_path: path, size: file.size, mime: file.type,
      uploaded_by: session?.user.id, player_id: athleteId,
    })
    if (ins.error) setErr(ins.error.message)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    reload()
  }

  async function open(d: Doc) {
    if (!d.file_path) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // Possono eliminare: gli admin, oppure chi ha caricato il file.
  function canDelete(d: Doc) {
    return isAdmin || (d.uploaded_by != null && d.uploaded_by === session?.user.id)
  }

  async function remove(d: Doc) {
    const { error, count } = await supabase.from('crm_documents')
      .delete({ count: 'exact' }).eq('id', d.id)
    if (error) { toast(error.message, 'err'); return }
    if (!count) { toast(t('Non hai i permessi per eliminare questo documento.'), 'err'); return }
    if (d.file_path) await supabase.storage.from(BUCKET).remove([d.file_path])
    toast(t('"{name}" eliminato').replace('{name}', d.name))
    reload()
  }

  const [sel, setSel] = useState('archivio')
  const { archive, files, groups } = useProFiles(athleteId, rows)

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flex between wrap gap">
        <div>
          <div style={{ fontWeight: 650 }}>{t('Carica un documento')}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>{t('Archivio cifrato e privato · visibile solo a te e ad AUVI')}</div>
        </div>
        <div className="flex gap">
          <Select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 150 }}>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </Select>
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} /> {uploading ? t('Carico…') : t('Carica file')}
          </button>
          <input ref={fileRef} type="file" hidden onChange={onFile} />
        </div>
      </div>
      {err && <div className="msg-err">{err}</div>}

      <ProBoxes groups={groups} sel={sel} onSel={setSel} />

      {sel === 'archivio' ? (
        <div className="card">
          {archive.length === 0 ? <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />} title={t('Archivio vuoto')} hint={t("Carica contratti, documenti d'identità, referti medici…")} /> : (
            <div className="list">
              {archive.map(d => (
                <div className="row" key={d.id}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 17 }}>{fileIcon(d.mime)}</div>
                  <div className="row-main">
                    <div className="row-title">{d.name}</div>
                    <div className="row-sub">{humanSize(d.size)} · {t('caricato {date}').replace('{date}', fmtDate(d.created_at))}</div>
                  </div>
                  <Badge>{CATS[d.category] ? t(CATS[d.category]) : d.category}</Badge>
                  <button className="btn btn-sm" onClick={() => open(d)}>{t('Apri')}</button>
                  {canDelete(d) && <ConfirmButton onConfirm={() => remove(d)}>{t('Elimina')}</ConfirmButton>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          {(files[sel] || []).length === 0
            ? <Empty icon={<Icon name="folder" size={30} strokeWidth={1.4} />} title={t('Nessun documento')}
                hint={t('I documenti caricati da questo professionista o mandati nella vostra chat compaiono qui.')} />
            : <div className="list">
                {files[sel].map(f => (
                  <div className="row" key={f.key}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 17 }}>{fileIcon(f.mime || null)}</div>
                    <div className="row-main">
                      <div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <div className="row-sub">{[f.sub && t(f.sub), f.date && fmtDate(f.date), f.size ? humanSize(f.size) : null].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button className="btn btn-sm" onClick={() => openIn(f.bucket, f.path)}>{t('Apri')}</button>
                  </div>
                ))}
              </div>}
          {CHAT_OF[sel] && <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => { try { sessionStorage.setItem('chat_channel', CHAT_OF[sel]) } catch { /* no-op */ } goto('messages') }}>
              <Icon name="message" size={13} /> {t('Apri la chat')}
            </button>
          </div>}
        </div>
      )}
    </div>
  )
}

// ---------- archivio diviso per professionista ----------
type PFile = { key: string; name: string; sub?: string; date?: string | null; size?: number | null; mime?: string | null; bucket: string; path: string }
type Group = { key: string; label: string; name?: string | null; icon: string; count: number }

const PRO: Record<string, { l: string; icon: string }> = {
  archivio: { l: 'Archivio', icon: 'archive' },
  team: { l: 'AUVI · Management', icon: 'briefcase' },
  agente: { l: 'Procuratore', icon: 'briefcase' },
  commercialista: { l: 'Commercialista', icon: 'briefcase' },
  assicuratore: { l: 'Assicuratore', icon: 'lock' },
  wealth: { l: 'Wealth manager', icon: 'briefcase' },
  fisioterapista: { l: 'Fisioterapista', icon: 'activity' },
  nutrizionista: { l: 'Nutrizionista', icon: 'layers' },
  preparatore: { l: 'Preparatore', icon: 'dumbbell' },
  brand: { l: 'Brand', icon: 'award' },
}
// canale della chat di ciascun professionista
const CHAT_OF: Record<string, string> = {
  team: 'team', agente: 'agente', commercialista: 'commercialista', assicuratore: 'assicuratore',
  wealth: 'wealth', fisioterapista: 'fisioterapista', nutrizionista: 'nutrizionista', preparatore: 'fitness',
}
const chanGroup = (c: string | null) => !c || c === 'team' ? 'team' : c === 'fitness' ? 'preparatore' : c.startsWith('brand:') ? 'brand' : c

async function openIn(bucket: string, path: string) {
  const w = window.open('', '_blank')
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (data?.signedUrl && w) w.location.href = data.signedUrl
  else { w?.close(); toast('File non disponibile', 'err') }
}

function useProFiles(playerId: number | null, docs: Doc[]) {
  const [roles, setRoles] = useState<Record<string, string | null>>({})
  const [byGroup, setByGroup] = useState<Record<string, PFile[]>>({})
  const [team, setTeam] = useState<{ role: string; name: string | null }[]>([])

  useEffect(() => {
    if (!playerId) return
    let ok = true
    ;(async () => {
      const [r, chat, w, tx, tm] = await Promise.all([
        supabase.rpc('crm_doc_uploader_roles', { p_player: playerId }),
        supabase.from('crm_messages').select('id, channel, sender_name, created_at, file_path, file_name, file_mime, file_size')
          .eq('player_id', playerId).not('file_path', 'is', null).order('created_at', { ascending: false }),
        supabase.from('crm_wealth_items').select('id, title, created_at, attachments, response_attachments').eq('player_id', playerId),
        supabase.from('crm_tax_items').select('id, title, created_at, attachments, response_attachments').eq('player_id', playerId),
        supabase.from('crm_athlete_team').select('role, name').eq('player_id', playerId),
      ])
      if (!ok) return
      const g: Record<string, PFile[]> = {}
      const push = (k: string, f: PFile) => { (g[k] ||= []).push(f) }
      for (const m of (chat.data as any[]) || [])
        push(chanGroup(m.channel), { key: 'm' + m.id, name: m.file_name || 'file', sub: m.sender_name ? `${m.sender_name} · chat` : 'Chat',
          date: m.created_at, size: m.file_size, mime: m.file_mime, bucket: 'chat-files', path: m.file_path })
      const items = (k: string, bucket: string, rows: any[]) => rows.forEach(i => {
        for (const a of i.attachments || []) if (a?.path) push(k, { key: a.path, name: a.name, sub: i.title, date: i.created_at, bucket, path: a.path })
        for (const a of i.response_attachments || []) if (a?.path) push(k, { key: a.path, name: a.name, sub: i.title, date: i.created_at, bucket, path: a.path })
      })
      items('wealth', 'wealth-docs', (w.data as any[]) || [])
      items('commercialista', 'tax-docs', (tx.data as any[]) || [])
      setByGroup(g)
      setRoles(Object.fromEntries(((r.data as any[]) || []).map(x => [x.id, x.role])))
      setTeam((tm.data as any[]) || [])
    })()
    return () => { ok = false }
  }, [playerId])

  // i documenti caricati qui dai professionisti vanno nel loro box; i nostri restano nell'archivio
  const docGroup = (d: Doc) => {
    const r = roles[d.id]
    return !r || r === 'admin' || r === 'player' ? 'archivio' : r
  }
  const archive = docs.filter(d => docGroup(d) === 'archivio')
  const files: Record<string, PFile[]> = { ...byGroup }
  for (const d of docs) {
    const k = docGroup(d)
    if (k === 'archivio' || !d.file_path) continue
    files[k] = [{ key: 'd' + d.id, name: d.name, sub: 'Caricato da lui', date: d.created_at, size: d.size, mime: d.mime, bucket: BUCKET, path: d.file_path }, ...(files[k] || [])]
  }
  const keys = new Set<string>([...team.map(x => x.role), ...Object.keys(files)].filter(k => PRO[k]))
  const groups: Group[] = [
    { key: 'archivio', label: PRO.archivio.l, icon: PRO.archivio.icon, count: archive.length },
    ...Object.keys(PRO).filter(k => k !== 'archivio' && keys.has(k)).map(k => ({
      key: k, label: PRO[k].l, icon: PRO[k].icon, count: (files[k] || []).length,
      name: team.find(x => x.role === k)?.name || null,
    })),
  ]
  return { archive, files, groups }
}

function ProBoxes({ groups, sel, onSel }: { groups: Group[]; sel: string; onSel: (k: string) => void }) {
  const { t } = useLang()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
      {groups.map(g => {
        const on = g.key === sel
        return (
          <button key={g.key} onClick={() => onSel(g.key)} style={{
            textAlign: 'left', cursor: 'pointer', borderRadius: 14, padding: '14px 14px 12px', color: on ? 'var(--bg, #fff)' : 'var(--text)',
            background: on ? 'var(--text)' : 'var(--card)', border: '1px solid ' + (on ? 'var(--text)' : 'var(--border)'),
            display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
          }}>
            <span className="flex between" style={{ alignItems: 'center' }}>
              <Icon name={g.icon} size={17} />
              <span style={{ fontSize: 12, fontWeight: 800, opacity: .75 }}>{g.count}</span>
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, opacity: .7 }}>{t(g.label)}</span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.name || (g.key === 'archivio' ? t('I tuoi documenti') : t(g.label))}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function fileIcon(mime: string | null) {
  if (!mime) return <Icon name="file" size={17} strokeWidth={1.5} />
  if (mime.includes('image')) return <Icon name="image" size={17} strokeWidth={1.5} />
  return <Icon name="file" size={17} strokeWidth={1.5} />
}
function humanSize(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}
