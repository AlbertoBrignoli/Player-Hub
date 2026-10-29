// Persone coinvolte e conversazione su una voce di qualunque area professionale
// (patrimonio, fisco, polizze, contratti, impegni). Chi vede la voce può taggare altri membri
// del team dell'atleta: ricevono la notifica, vedono SOLO quella voce e partecipano alla
// conversazione. Per gli impegni la conversazione sono i commenti dell'impegno stesso.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { fmtDateTime, initials } from '../lib/format'
import { Modal, Select, Textarea } from './ui'
import Icon from './Icon'

export type ItemKind = 'wealth' | 'tax' | 'insurance' | 'contract' | 'event'
export type Person = { id: string; kind: ItemKind; item_id: string; user_id: string | null; role: string; name: string | null }
type File_ = { name: string; path: string }
type Msg = { id: string; author_id: string; author_name: string | null; author_role: string | null
  body: string | null; attachments?: File_[]; created_at: string }

export const ROLE_L: Record<string, string> = {
  admin: 'AUVI', player: 'Atleta', agente: 'Procuratore', assicuratore: 'Assicuratore', commercialista: 'Commercialista',
  preparatore: 'Preparatore', fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager',
}
// ruolo "titolare" di ogni area: non si tagga, è già dentro la voce
const OWNER: Record<ItemKind, string | null> = {
  wealth: 'wealth', tax: 'commercialista', insurance: 'assicuratore', contract: 'agente', event: null,
}
const ACCENT = '#1F4E79'
const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800 }

// Persone taggate per un elenco di voci dello stesso tipo
export function useItemPeople(kind: ItemKind, ids: string[]) {
  const [people, setPeople] = useState<Record<string, Person[]>>({})
  const key = ids.join(',')
  async function reload() {
    if (!ids.length) { setPeople({}); return }
    const { data } = await supabase.from('crm_item_people').select('*').eq('kind', kind).in('item_id', ids)
    const by: Record<string, Person[]> = {}
    for (const x of (data as Person[]) || []) (by[x.item_id] ||= []).push(x)
    setPeople(by)
  }
  useEffect(() => { reload() }, [kind, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { people, reload }
}

export function PersonChip({ p, onRemove }: { p: Person; onRemove?: () => void }) {
  const { t: tr } = useLang()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 3px', borderRadius: 999,
      border: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 12 }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: ACCENT, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>
        {initials(p.name || ROLE_L[p.role] || '?')}
      </span>
      <b style={{ fontWeight: 700 }}>{p.name || tr(ROLE_L[p.role] || p.role)}</b>
      {p.name && <span className="faint">{tr(ROLE_L[p.role] || p.role)}</span>}
      {onRemove && <button onClick={onRemove} aria-label={tr('Rimuovi')}
        style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}><Icon name="x" size={12} /></button>}
    </span>
  )
}

// Riga compatta per le card: chi è coinvolto + tasto per aprire la conversazione
export function PeopleRow({ people, onOpen }: { people: Person[]; onOpen: () => void }) {
  const { t: tr } = useLang()
  return (
    <div className="flex gap" style={{ marginTop: 11, gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {people.length > 0 && <span className="faint" style={{ fontSize: 11 }}>{tr('Coinvolti')}:</span>}
      {people.map(p => <PersonChip key={p.id} p={p} />)}
      <button className="btn btn-ghost btn-sm" onClick={onOpen}>
        <Icon name="users" size={12} /> {people.length ? tr('Conversazione') : tr('Coinvolgi / conversazione')}
      </button>
    </div>
  )
}

// Persone + conversazione (si usa dentro un modal o in una pagina)
export function ItemThread({ kind, itemId, playerId, people, onPeople, hideThread }: {
  kind: ItemKind; itemId: string; playerId: number; people: Person[]; onPeople: () => void; hideThread?: boolean
}) {
  const { t: tr } = useLang()
  const { session, profile, role } = useAuth()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [team, setTeam] = useState<{ pro_id: string | null; role: string; name: string | null }[]>([])
  const [pick, setPick] = useState('')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File_[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const isEvent = kind === 'event'

  async function loadMsgs() {
    if (hideThread) return
    if (isEvent) {
      const { data } = await supabase.from('crm_event_comments').select('id, author_id, author_role, body, created_at')
        .eq('event_id', itemId).order('created_at')
      setMsgs(((data as any[]) || []).map(c => ({ ...c, author_name: null })))
    } else {
      const { data } = await supabase.from('crm_item_comments').select('*').eq('kind', kind).eq('item_id', itemId).order('created_at')
      setMsgs((data as Msg[]) || [])
    }
  }
  useEffect(() => { loadMsgs() }, [kind, itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.from('crm_athlete_team').select('pro_id, role, name').eq('player_id', playerId)
      .then(({ data }) => setTeam(((data as any[]) || []).filter(x => x.role !== OWNER[kind])))
  }, [playerId, kind])

  const key = (r: string, u: string | null) => `${r}|${u || ''}`
  const taken = new Set(people.map(p => key(p.role, p.user_id)))
  const candidates = [
    ...(role !== 'admin' ? [{ pro_id: null, role: 'admin', name: 'AUVI' }] : []),
    ...team.filter(x => x.pro_id !== session?.user.id),
  ].filter(c => !taken.has(key(c.role, c.pro_id)))

  async function tag() {
    const c = candidates.find(x => key(x.role, x.pro_id) === pick)
    if (!c) return
    const { error } = await supabase.from('crm_item_people').insert({ kind, item_id: itemId, user_id: c.pro_id, role: c.role, name: c.name })
    if (error) { toast(error.message, 'err'); return }
    setPick(''); toast(tr('Coinvolto: riceve la notifica')); onPeople()
  }
  async function untag(p: Person) {
    await supabase.from('crm_item_people').delete().eq('id', p.id)
    onPeople()
  }

  async function send() {
    if (!text.trim() && !files.length) return
    setBusy(true)
    const { error } = isEvent
      ? await supabase.from('crm_event_comments').insert({ event_id: itemId, author_id: session?.user.id, kind: 'commento', body: text.trim() })
      : await supabase.from('crm_item_comments').insert({
          kind, item_id: itemId, author_id: session?.user.id,
          author_name: profile?.full_name || profile?.email, author_role: role,
          body: text.trim() || null, attachments: files,
        })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    setText(''); setFiles([]); loadMsgs()
  }

  async function openFile(path: string) {
    const w = window.open('', '_blank')   // aperta subito, legata al tocco (iPhone)
    const { data } = await supabase.storage.from('item-files').createSignedUrl(path, 300)
    if (data?.signedUrl && w) w.location.href = data.signedUrl
    else { w?.close(); toast(tr('Impossibile aprire il documento'), 'err') }
  }

  return (
    <div>
      <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>{tr('Persone coinvolte')}</div>
      <div className="flex gap" style={{ gap: 6, flexWrap: 'wrap' }}>
        {people.length === 0 && <span className="faint" style={{ fontSize: 12.5 }}>{tr('Nessuno oltre a chi segue già questa voce.')}</span>}
        {people.map(p => <PersonChip key={p.id} p={p} onRemove={() => untag(p)} />)}
      </div>
      {candidates.length > 0 && (
        <div className="flex gap" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <Select value={pick} onChange={e => setPick(e.target.value)}>
              <option value="">{tr('Coinvolgi qualcuno del team…')}</option>
              {candidates.map(c => (
                <option key={key(c.role, c.pro_id)} value={key(c.role, c.pro_id)}>
                  {c.name || tr(ROLE_L[c.role] || c.role)}{c.name ? ` · ${tr(ROLE_L[c.role] || c.role)}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff', fontWeight: 800, border: 'none' }} disabled={!pick} onClick={tag}>
            <Icon name="plus" size={13} /> {tr('Coinvolgi')}
          </button>
        </div>
      )}

      {!hideThread && (
        <div style={{ marginTop: 18 }}>
          <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>{tr('Conversazione')}</div>
          {msgs.length === 0
            ? <div className="faint" style={{ fontSize: 12.5 }}>{tr('Nessun messaggio. Scrivi qui per aggiornare tutti i coinvolti.')}</div>
            : <div className="grid" style={{ gap: 10 }}>
                {msgs.map(c => {
                  const mine = c.author_id === session?.user.id
                  return (
                    <div key={c.id} style={{ padding: '10px 12px', borderRadius: 12, background: mine ? 'var(--bg-2)' : 'transparent', border: '1px solid var(--border)' }}>
                      <div className="flex gap" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13 }}>{mine ? tr('Tu') : (c.author_name || tr(ROLE_L[c.author_role || ''] || ''))}</b>
                        {!mine && c.author_name && c.author_role && <span className="faint" style={{ fontSize: 11.5 }}>{tr(ROLE_L[c.author_role] || c.author_role)}</span>}
                        <span style={{ flex: 1 }} />
                        <span className="faint" style={{ fontSize: 11 }}>{fmtDateTime(c.created_at)}</span>
                      </div>
                      {c.body && <div style={{ fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.body}</div>}
                      {!!c.attachments?.length && (
                        <div className="flex gap" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                          {c.attachments.map(a => (
                            <button key={a.path} className="btn btn-ghost btn-sm" onClick={() => openFile(a.path)}>
                              <Icon name="download" size={12} /> {a.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>}
          <div style={{ marginTop: 12 }}>
            {files.length > 0 && (
              <div className="flex gap" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {files.map(f => (
                  <span key={f.path} className="btn btn-sm" style={{ cursor: 'default' }}>
                    <Icon name="paperclip" size={12} /> {f.name}
                    <button onClick={() => setFiles(p => p.filter(x => x.path !== f.path))} aria-label={tr('Rimuovi')}
                      style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: '0 0 0 4px' }}><Icon name="x" size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <Textarea rows={2} value={text} onChange={e => setText(e.target.value)}
              placeholder={isEvent ? tr('Scrivi un aggiornamento…') : tr('Scrivi un aggiornamento o allega un documento…')} />
            <div className="flex gap" style={{ gap: 8, marginTop: 8 }}>
              {!isEvent && (
                <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Icon name="paperclip" size={13} /> {uploading ? tr('Carico…') : tr('Allega')}
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" disabled={busy || (!text.trim() && !files.length)} onClick={send}>
                <Icon name="send" size={13} /> {busy ? tr('Invio…') : tr('Invia')}
              </button>
            </div>
            <input ref={fileRef} type="file" multiple hidden onChange={async e => {
              setUploading(true)
              const out: File_[] = []
              for (const file of Array.from(e.target.files || [])) {
                const path = `${kind}/${itemId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
                const up = await supabase.storage.from('item-files').upload(path, file, { upsert: false })
                if (up.error) { toast(up.error.message, 'err'); continue }
                out.push({ name: file.name, path })
              }
              setFiles(p => [...p, ...out]); setUploading(false); e.target.value = ''
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

// Modal pronto all'uso dalle card delle varie aree
export function ItemPeopleModal({ kind, itemId, playerId, title, sub, children, people, onPeople, onClose, hideThread }: {
  kind: ItemKind; itemId: string; playerId: number; title: string; sub?: string; children?: React.ReactNode
  people: Person[]; onPeople: () => void; onClose: () => void; hideThread?: boolean
}) {
  return (
    <Modal title={title} onClose={onClose} wide>
      {sub && <div style={{ ...kicker, fontSize: 9.5, color: ACCENT, marginBottom: 8 }}>{sub}</div>}
      {children}
      <div style={{ marginTop: children ? 16 : 0 }}>
        <ItemThread kind={kind} itemId={itemId} playerId={playerId} people={people} onPeople={onPeople} hideThread={hideThread} />
      </div>
    </Modal>
  )
}
