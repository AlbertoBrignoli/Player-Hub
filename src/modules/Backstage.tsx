// Backstage: il profilo privato dell'atleta dentro il Player Hub.
// Atleta (e AUVI): pubblica "momenti" scegliendo chi li vede, vede chi ha visitato il profilo,
// accetta o rifiuta le richieste di accesso e vede quali momenti interessano ai brand.
// Brand e professionisti esterni: elenco degli atleti, richiesta di accesso con motivo e,
// se ammessi, i momenti con "Mi interessa" e "Salva" (segnali privati, niente like né commenti).
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useRouteParam, goto } from '../lib/route'
import { timeAgo, initials } from '../lib/format'
import { Modal, Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { CropBox, type CropHandle } from '../components/CropBox'

const CATS = ['Dietro le quinte', 'Lifestyle', 'Passioni', 'Allenamento', 'Valori'] as const
const AUD: Record<string, { l: string; d: string; badge: string }> = {
  team: { l: 'Solo il mio team', d: 'Chi lavora con te e AUVI', badge: 'Team' },
  brand: { l: 'Brand ammessi', d: 'Solo i brand a cui hai dato accesso', badge: 'Brand' },
  pro: { l: 'Tutti i professionisti ammessi', d: 'Brand, scout, club e professionisti che hai approvato', badge: 'Pro' },
}
const REASONS = ['Campagna o collaborazione', 'Prodotto in regalo / seeding', 'Evento o presenza', 'Scouting', 'Altro']
const ROLE_L: Record<string, string> = {
  brand: 'Brand', agente: 'Procuratore', partner: 'Partner', preparatore: 'Preparatore', assicuratore: 'Assicuratore',
  commercialista: 'Commercialista', fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager', admin: 'AUVI', creator: 'AUVI',
}

type Post = { id: string; player_id: number; image_path: string | null; caption: string | null; category: string; audience: string; created_at: string }
type Dir = { player_id: number; name: string; photo_url: string | null; team_name: string | null; pos: string | null; bio: string | null; passions: string[]; posts: number; my_status: string | null; avatar_path: string | null }
type Stat = { post_id: string; saves: number; interests: number; views: number; who: string[] | null }

async function signed(paths: string[]): Promise<Record<string, string>> {
  const list = paths.filter(Boolean)
  if (!list.length) return {}
  const { data } = await supabase.storage.from('backstage').createSignedUrls(list, 3600)
  const m: Record<string, string> = {}
  for (const r of data || []) if (r.path && r.signedUrl) m[r.path] = r.signedUrl
  return m
}

async function shrink(file: File, square = false): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas')
    if (square) {
      const s = Math.min(bmp.width, bmp.height), o = Math.min(800, s)
      c.width = o; c.height = o
      c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, o, o)
      return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('img')), 'image/jpeg', 0.88))
    }
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('img')), 'image/jpeg', 0.86))
  } catch { return file }
}

export default function Backstage() {
  const { role } = useAuth()
  const { athleteId } = useAthlete()
  const owner = role === 'player' || role === 'admin' || role === 'creator'
  return (
    <div className="bs">
      <style>{BS_CSS}</style>
      {owner && athleteId ? <OwnerView playerId={athleteId} /> : <ViewerArea />}
    </div>
  )
}

// ─── intestazione comune ─────────────────────────────────────────────────────
function Head({ d, photo, stats, actions, onPhoto }: { d: Partial<Dir> & { name?: string }; photo?: string | null; stats?: React.ReactNode; actions?: React.ReactNode; onPhoto?: (f: File) => void }) {
  const { t } = useLang()
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="bs-head card">
      <div className="bs-id">
        <div className={`bs-av ${onPhoto ? 'edit' : ''}`} onClick={() => onPhoto && fileRef.current?.click()} title={onPhoto ? t('Cambia foto') : undefined}>
          {photo ? <img src={photo} alt="" /> : <span>{initials(d.name)}</span>}
          {onPhoto && <i className="bs-cam"><Icon name="camera" size={14} /></i>}
        </div>
        {onPhoto && <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="bs-nm">{d.name}</div>
          <div className="bs-rl">{[d.pos, d.team_name].filter(Boolean).join(' · ')}</div>
          <span className="bs-lock"><Icon name="lock" size={11} /> {t('Profilo privato')}</span>
        </div>
        {actions && <div className="bs-act">{actions}</div>}
      </div>
      {d.bio && <div className="bs-bio">{d.bio}</div>}
      {!!d.passions?.length && <div className="bs-chips">{d.passions.map(p => <span key={p} className="bs-chip">{p}</span>)}</div>}
      {stats}
    </div>
  )
}

// ─── vista dell'atleta (e di AUVI) ───────────────────────────────────────────
function OwnerView({ playerId }: { playerId: number }) {
  const { t } = useLang()
  const { athletes } = useAthlete()
  const routeTab = useRouteParam('tab')
  const [tab, setTab] = useState<'posts' | 'visits' | 'reqs' | 'ins'>((routeTab as any) || 'posts')
  useEffect(() => { if (routeTab && ['posts', 'visits', 'reqs', 'ins'].includes(routeTab)) setTab(routeTab as any) }, [routeTab])
  const [dir, setDir] = useState<Dir | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, Stat>>({})
  const [access, setAccess] = useState<any[]>([])
  const [visits, setVisits] = useState<any[]>([])
  const [daily, setDaily] = useState<{ d: string; n: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('Tutto')
  const [open, setOpen] = useState<Post | null>(null)
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [avFile, setAvFile] = useState<File | null>(null)
  const avCrop = useRef<CropHandle>(null)
  const photo = avatar || athletes.find(a => a.api_player_id === playerId)?.photo_url

  async function load() {
    const [d, p, s, a, v, dd] = await Promise.all([
      supabase.rpc('bs_directory'),
      supabase.from('bs_posts').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
      supabase.rpc('bs_post_stats', { p_player: playerId }),
      supabase.from('bs_access').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
      supabase.rpc('bs_visits', { p_player: playerId, p_days: 30 }),
      supabase.rpc('bs_visits_daily', { p_player: playerId }),
    ])
    const me = ((d.data as Dir[]) || []).find(x => x.player_id === playerId) || null
    setDir(me)
    setAvatar(me?.avatar_path ? (await signed([me.avatar_path]))[me.avatar_path] || null : null)
    const list = (p.data as Post[]) || []
    setPosts(list)
    setUrls(await signed(list.map(x => x.image_path || '')))
    const m: Record<string, Stat> = {}
    for (const r of (s.data as Stat[]) || []) m[r.post_id] = r
    setStats(m)
    setAccess((a.data as any[]) || [])
    setVisits((v.data as any[]) || [])
    setDaily(((dd.data as any[]) || []).map(r => ({ d: r.d, n: r.n })))
    setLoading(false)
  }
  useEffect(() => { setLoading(true); load() }, [playerId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />
  const pending = access.filter(a => a.status === 'pending')
  const approved = access.filter(a => a.status === 'approved')
  const week = daily.reduce((s, x) => s + x.n, 0)
  const shown = posts.filter(p => cat === 'Tutto' || p.category === cat)
  const name = dir?.name || athletes.find(a => a.api_player_id === playerId)?.name || ''

  async function changePhoto(f: File) {
    const path = `${playerId}/avatar-${Date.now()}.jpg`
    const blob = (await avCrop.current?.toBlob()) || await shrink(f, true)
    setAvFile(null)
    const up = await supabase.storage.from('backstage').upload(path, blob, { contentType: 'image/jpeg' })
    if (up.error) { toast(up.error.message, 'err'); return }
    const old = dir?.avatar_path
    const { error } = await supabase.from('bs_profiles').upsert({ player_id: playerId, avatar_path: path, bio: dir?.bio ?? null, passions: dir?.passions || [], updated_at: new Date().toISOString() })
    if (error) { toast(error.message, 'err'); return }
    if (old) await supabase.storage.from('backstage').remove([old])
    toast(t('Foto aggiornata'))
    load()
  }

  async function decide(id: string, status: string) {
    const { error } = await supabase.rpc('bs_decide', { p_id: id, p_status: status })
    if (error) { toast(t(error.message), 'err'); return }
    toast(status === 'approved' ? t('Accesso consentito') : status === 'revoked' ? t('Accesso revocato') : t('Richiesta rifiutata'))
    load()
  }

  return (
    <div className="bs-wrap">
      <Head d={{ ...(dir || {}), name }} photo={photo} onPhoto={setAvFile}
        actions={<div className="flex gap" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={13} /></button>
          <button className="btn btn-sm btn-primary" onClick={() => setComposing(true)}><Icon name="plus" size={13} /> {t('Momento')}</button>
        </div>}
        stats={<div className="bs-stats">
          <div><b>{posts.length}</b><span>{t('momenti')}</span></div>
          <div><b>{approved.length}</b><span>{t('ammessi')}</span></div>
          <div><b>{week}</b><span>{t('visite · 7 giorni')}</span></div>
        </div>} />

      <div className="bs-tabs">
        {([['posts', 'Momenti'], ['visits', 'Visite'], ['reqs', 'Richieste'], ['ins', 'Interesse']] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(l)}{k === 'reqs' && pending.length > 0 && <span className="bs-dot">{pending.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'posts' && (<>
        <div className="bs-cats">{['Tutto', ...CATS].map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{t(c)}</button>)}</div>
        {shown.length === 0 ? (
          <div className="card"><Empty icon={<Icon name="image" size={30} strokeWidth={1.4} />} title={t('Ancora nessun momento')}
            hint={t('Pubblica quello che in campo non si vede: chi sei, cosa ti piace, cosa ti muove. Lo vede solo chi scegli tu.')} />
            <div style={{ textAlign: 'center', marginTop: 10 }}><button className="btn btn-primary" onClick={() => setComposing(true)}><Icon name="plus" size={14} /> {t('Pubblica il primo momento')}</button></div></div>
        ) : (
          <div className="bs-grid">{shown.map(p => {
            const s = stats[p.id]; const sig = (s?.saves || 0) + (s?.interests || 0)
            return (
              <button key={p.id} className="bs-tile" style={{ backgroundImage: p.image_path && urls[p.image_path] ? `url(${urls[p.image_path]})` : undefined }} onClick={() => setOpen(p)}>
                {!p.image_path && <span className="bs-txt">{p.caption}</span>}
                <span className="bs-aud">{t(AUD[p.audience]?.badge || '')}</span>
                {sig > 0 && <span className="bs-sv">★ {sig}</span>}
              </button>
            )
          })}</div>
        )}
      </>)}

      {tab === 'visits' && (
        <div className="grid" style={{ gap: 10 }}>
          <div className="bs-hero">
            <span className="bs-hero-l">{t('Visite al tuo Backstage · ultimi 7 giorni')}</span>
            <b>{week}</b>
            <div className="bs-bars">{daily.map((x, i) => {
              const max = Math.max(1, ...daily.map(y => y.n))
              return <i key={x.d} className={i === daily.length - 1 ? 'hi' : ''} style={{ height: `${Math.max(6, (x.n / max) * 100)}%` }} title={`${x.n}`} />
            })}</div>
            <div className="bs-days">{daily.map(x => <span key={x.d}>{new Date(x.d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>)}</div>
          </div>
          {visits.length === 0
            ? <div className="card"><Empty icon={<Icon name="eye" size={28} strokeWidth={1.4} />} title={t('Nessuna visita per ora')} hint={t('Quando un brand o un professionista guarda il tuo Backstage, lo vedi qui.')} /></div>
            : visits.map(v => (
              <div key={v.viewer_key} className="bs-row">
                <div className={`bs-lg ${v.incognito ? 'anon' : ''}`}>{v.incognito ? '?' : initials(v.org || v.name)}</div>
                <div className="bs-rw">
                  <b>{v.incognito ? t('Un {role} in incognito').replace('{role}', t(ROLE_L[v.role] || 'professionista').toLowerCase()) : (v.org || v.name)}</b>
                  <span>{v.incognito ? t('Lo saprai se ti contatta') : [v.org && v.name, t(ROLE_L[v.role] || v.role)].filter(Boolean).join(' · ')} · {timeAgo(v.last_at)}</span>
                  <span className="bs-dim">{v.posts_seen > 0 ? t('ha visto {n} momenti').replace('{n}', String(v.posts_seen)) : t('ha visto il profilo')}</span>
                </div>
              </div>
            ))}
          <div className="bs-mute">{t('Solo tu e il tuo team vedete queste informazioni.')}</div>
        </div>
      )}

      {tab === 'reqs' && (
        <div className="grid" style={{ gap: 10 }}>
          {pending.length === 0 && <div className="card"><Empty icon={<Icon name="users" size={28} strokeWidth={1.4} />} title={t('Nessuna richiesta in attesa')}
            hint={t('Chi rifiuti non riceve notifiche: vede solo "richiesta non accettata".')} /></div>}
          {pending.map(a => (
            <div key={a.id} className="bs-req card">
              <div className="bs-row" style={{ border: 0, padding: 0 }}>
                <div className="bs-lg">{initials(a.requester_org || a.requester_name)}</div>
                <div className="bs-rw"><b>{a.requester_org || a.requester_name}</b><span>{[a.requester_org && a.requester_name, t(ROLE_L[a.requester_role] || a.requester_role)].filter(Boolean).join(' · ')} · {timeAgo(a.created_at)}</span></div>
              </div>
              <div className="bs-why"><b>{t(a.reason || 'Altro')}</b>{a.message && <><br />“{a.message}”</>}</div>
              <div className="bs-two">
                <button className="btn btn-primary" onClick={() => decide(a.id, 'approved')}>{t('Accetta')}</button>
                <button className="btn" onClick={() => decide(a.id, 'declined')}>{t('Rifiuta')}</button>
              </div>
            </div>
          ))}
          {approved.length > 0 && <>
            <div className="bs-sec">{t('Hanno accesso')}</div>
            {approved.map(a => (
              <div key={a.id} className="bs-row">
                <div className="bs-lg">{initials(a.requester_org || a.requester_name)}</div>
                <div className="bs-rw"><b>{a.requester_org || a.requester_name}</b><span>{t(ROLE_L[a.requester_role] || a.requester_role)}</span></div>
                <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm(t('Togliere l\'accesso?'))) decide(a.id, 'revoked') }}>{t('Revoca')}</button>
              </div>
            ))}
          </>}
          <div className="bs-why">🛡 {t('Possono chiederti l\'accesso solo brand e professionisti invitati da AUVI. I tifosi non arrivano qui.')}</div>
        </div>
      )}

      {tab === 'ins' && (() => {
        const ranked = posts.map(p => ({ p, s: stats[p.id] })).filter(x => x.s && (x.s.saves + x.s.interests) > 0)
          .sort((a, b) => (b.s.saves + b.s.interests) - (a.s.saves + a.s.interests))
        const total = ranked.reduce((s, x) => s + x.s.saves + x.s.interests, 0)
        const byCat: Record<string, number> = {}
        for (const x of ranked) byCat[x.p.category] = (byCat[x.p.category] || 0) + x.s.saves + x.s.interests
        const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => t(e[0]))
        return (
          <div className="grid" style={{ gap: 10 }}>
            <div className="bs-hero"><span className="bs-hero-l">{t('Segnali dai brand')}</span><b>{total}</b>
              <span className="bs-hero-l">{t('Nessun like pubblico: solo "mi interessa" e salvataggi privati da professionisti ammessi.')}</span></div>
            {ranked.length === 0 ? <div className="card"><Empty icon={<Icon name="star" size={28} strokeWidth={1.4} />} title={t('Ancora nessun segnale')} hint={t('Quando un brand salva un tuo momento o dice "mi interessa", lo vedi qui.')} /></div>
              : ranked.map(({ p, s }) => (
                <button key={p.id} className="bs-row" onClick={() => setOpen(p)} style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div className="bs-lg" style={{ backgroundImage: p.image_path && urls[p.image_path] ? `url(${urls[p.image_path]})` : undefined, backgroundSize: 'cover' }} />
                  <div className="bs-rw"><b>{t(p.category)}</b><span>{(s.who || []).filter(Boolean).join(', ')}</span></div>
                  <span className="bs-sv" style={{ position: 'static' }}>★ {s.saves + s.interests}</span>
                </button>
              ))}
            {top.length > 0 && <div className="bs-why">💡 {t('Ai brand interessano soprattutto i tuoi momenti {cats}. AUVI usa questi segnali per proporti alle aziende giuste.').replace('{cats}', top.join(' e '))}</div>}
          </div>
        )
      })()}

      {open && (
        <Modal title={t(open.category)} onClose={() => setOpen(null)} dismissable>
          <div className="grid" style={{ gap: 12 }}>
            {open.image_path && urls[open.image_path] && <img src={urls[open.image_path]} alt="" className="bs-img" />}
            {open.caption && <div style={{ fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{open.caption}</div>}
            <div className="bs-why">
              <b>{t(AUD[open.audience].l)}</b> · {timeAgo(open.created_at)}<br />
              👁 {t('Visto da {n} professionisti').replace('{n}', String(stats[open.id]?.views || 0))}
              {(stats[open.id]?.saves || 0) + (stats[open.id]?.interests || 0) > 0 && <><br />★ {(stats[open.id]?.who || []).filter(Boolean).join(', ')}</>}
            </div>
            <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={async () => {
              if (!confirm(t('Eliminare questo momento?'))) return
              const p = open
              const { error } = await supabase.from('bs_posts').delete().eq('id', p.id)
              if (error) { toast(error.message, 'err'); return }
              if (p.image_path) await supabase.storage.from('backstage').remove([p.image_path])
              setOpen(null); load()
            }}><Icon name="trash" size={14} /> {t('Elimina')}</button>
          </div>
        </Modal>
      )}
      {avFile && (
        <Modal title={t('Foto profilo')} onClose={() => setAvFile(null)}
          footer={<><button className="btn" onClick={() => setAvFile(null)}>{t('Annulla')}</button><button className="btn btn-primary" onClick={() => changePhoto(avFile)}>{t('Usa questa foto')}</button></>}>
          <div className="grid" style={{ gap: 8 }}>
            <CropBox ref={avCrop} file={avFile} aspect={1} outW={800} round maxW={300} />
            <div className="bs-mute">{t('Trascina per centrare, usa la barra per ingrandire')}</div>
          </div>
        </Modal>
      )}
      {composing && <Composer playerId={playerId} onClose={() => setComposing(false)} onDone={() => { setComposing(false); setTab('posts'); setCat('Tutto'); load() }} />}
      {editing && <EditProfile playerId={playerId} dir={dir} onClose={() => setEditing(false)} onDone={() => { setEditing(false); load() }} />}
    </div>
  )
}

function Composer({ playerId, onClose, onDone }: { playerId: number; onClose: () => void; onDone: () => void }) {
  const { t } = useLang()
  const ref = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const crop = useRef<CropHandle>(null)
  const [caption, setCaption] = useState('')
  const [cat, setCat] = useState<string>('Lifestyle')
  const [aud, setAud] = useState('pro')
  const [busy, setBusy] = useState(false)
  async function publish() {
    if (!file && !caption.trim()) { toast(t('Aggiungi una foto o un testo'), 'err'); return }
    setBusy(true)
    let path: string | null = null
    if (file) {
      path = `${playerId}/${Date.now()}.jpg`
      const blob = (await crop.current?.toBlob()) || await shrink(file)
      const up = await supabase.storage.from('backstage').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) { setBusy(false); toast(up.error.message, 'err'); return }
    }
    const { error } = await supabase.from('bs_posts').insert({ player_id: playerId, image_path: path, caption: caption.trim() || null, category: cat, audience: aud })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(t('Pubblicato: lo vede solo chi hai scelto'))
    onDone()
  }
  return (
    <Modal title={t('Nuovo momento')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy} onClick={publish}>{busy ? t('Pubblico…') : t('Pubblica nel Backstage')}</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        {file ? (<>
          <CropBox ref={crop} file={file} aspect={4 / 5} outW={1080} />
          <div className="bs-mute">{t('Trascina per centrare, usa la barra per ingrandire')} · <button className="btn btn-sm btn-ghost" onClick={() => ref.current?.click()}>{t('Cambia foto')}</button></div>
        </>) : (
          <button className="bs-pick" onClick={() => ref.current?.click()}>
            <span><Icon name="camera" size={22} /><br />{t('Scegli una foto')}</span>
          </button>
        )}
        <input ref={ref} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
        <textarea className="textarea" rows={3} value={caption} onChange={e => setCaption(e.target.value)} placeholder={t('Racconta il momento, come lo racconteresti a un amico…')} />
        <div className="bs-cats" style={{ padding: 0 }}>{CATS.map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{t(c)}</button>)}</div>
        <b style={{ fontSize: 13 }}>{t('Chi lo vede')}</b>
        {Object.entries(AUD).map(([k, v]) => (
          <label key={k} className={`bs-opt ${aud === k ? 'on' : ''}`}>
            <input type="radio" name="aud" checked={aud === k} onChange={() => setAud(k)} />
            <span><b>{t(v.l)}</b><span>{t(v.d)}</span></span>
          </label>
        ))}
        <div className="bs-promise"><span>✓ {t('Nessun like pubblico, nessun commento')}</span><span>✓ {t('Nessun tifoso: solo chi hai ammesso')}</span><span>✓ {t('Lo puoi cancellare quando vuoi')}</span></div>
      </div>
    </Modal>
  )
}

function EditProfile({ playerId, dir, onClose, onDone }: { playerId: number; dir: Dir | null; onClose: () => void; onDone: () => void }) {
  const { t } = useLang()
  const [bio, setBio] = useState(dir?.bio || '')
  const [pass, setPass] = useState((dir?.passions || []).join(', '))
  async function save() {
    const passions = pass.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8)
    const { error } = await supabase.from('bs_profiles').upsert({ player_id: playerId, bio: bio.trim() || null, passions, avatar_path: dir?.avatar_path ?? null, updated_at: new Date().toISOString() })
    if (error) { toast(error.message, 'err'); return }
    onDone()
  }
  return (
    <Modal title={t('Il tuo Backstage')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Annulla')}</button><button className="btn btn-primary" onClick={save}>{t('Salva')}</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="field"><label>{t('Chi sei, in due righe')}</label>
          <textarea className="textarea" rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder={t('Es. Portiere, padre, curioso. Qui racconto quello che in campo non si vede.')} /></div>
        <div className="field"><label>{t('Le tue passioni (separate da virgola)')}</label>
          <input className="input" value={pass} onChange={e => setPass(e.target.value)} placeholder={t('Es. Famiglia, Padel, Moda, Viaggi')} /></div>
        <div className="bs-mute" style={{ textAlign: 'left' }}>{t('Nome, foto e squadra li vedono anche i brand non ancora ammessi: è il tuo biglietto da visita.')}</div>
      </div>
    </Modal>
  )
}

// ─── vista di brand e professionisti esterni ─────────────────────────────────
function ViewerArea() {
  const { t } = useLang()
  const wanted = useRouteParam('player')
  const [dir, setDir] = useState<Dir[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<number | null>(wanted ? Number(wanted) : null)
  const [incognito, setIncognito] = useState(false)
  const [q, setQ] = useState('')
  const [av, setAv] = useState<Record<string, string>>({})
  async function load() {
    const [d, s] = await Promise.all([supabase.rpc('bs_directory'), supabase.from('bs_viewer_settings').select('incognito').maybeSingle()])
    const list = (d.data as Dir[]) || []
    setDir(list)
    setAv(await signed(list.map(x => x.avatar_path || '')))
    setIncognito(!!(s.data as any)?.incognito)
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (wanted) setSel(Number(wanted)) }, [wanted])
  if (loading) return <Spinner />
  const cur = dir.find(d => d.player_id === sel)
  const pic = (x: Dir) => (x.avatar_path && av[x.avatar_path]) || x.photo_url
  if (cur) return <ViewerProfile d={cur} photo={pic(cur)} onBack={() => { setSel(null); load() }} onChanged={load} />
  const list = dir.filter(d => !q.trim() || [d.name, d.team_name, ...(d.passions || [])].some(v => (v || '').toLowerCase().includes(q.toLowerCase())))
  const st = (s: string | null) => s === 'approved' ? t('Accesso consentito') : s === 'pending' ? t('Richiesta inviata') : s === 'declined' ? t('Non accettata') : t('Privato')
  return (
    <div className="bs-wrap">
      <div className="flex between" style={{ alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div><div className="bs-kick">Backstage</div><div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -.4 }}>{t('Scopri chi sono davvero gli atleti')}</div>
          <div className="faint" style={{ fontSize: 13, maxWidth: 560 }}>{t('Ogni Backstage è privato: chiedi l\'accesso spiegando perché. L\'atleta vede chi sei e decide lui.')}</div></div>
        <label className={`bs-incog ${incognito ? 'on' : ''}`} onClick={async () => { const n = !incognito; setIncognito(n); await supabase.rpc('bs_set_incognito', { p_on: n }); toast(n ? t('Navighi in incognito') : t('Le tue visite sono visibili')) }}>
          <span className="bs-knob" /> {t('Incognito')}
        </label>
      </div>
      <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Cerca per nome, squadra o passione…')} />
      <div className="bs-dir">{list.map(d => (
        <button key={d.player_id} className="bs-card" onClick={() => setSel(d.player_id)}>
          <div className="bs-av sm">{pic(d) ? <img src={pic(d)!} alt="" /> : <span>{initials(d.name)}</span>}</div>
          <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            <b>{d.name}</b>
            <span className="bs-dim">{[d.pos, d.team_name].filter(Boolean).join(' · ')}</span>
            {!!d.passions?.length && <span className="bs-dim">{d.passions.slice(0, 3).join(' · ')}</span>}
          </div>
          <span className={`bs-st ${d.my_status || 'none'}`}>{st(d.my_status)}</span>
        </button>
      ))}</div>
    </div>
  )
}

function ViewerProfile({ d, photo, onBack, onChanged }: { d: Dir; photo: string | null; onBack: () => void; onChanged: () => void }) {
  const { t } = useLang()
  const { role } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Post | null>(null)
  const [reason, setReason] = useState(REASONS[0])
  const [msg, setMsg] = useState('')
  const [status, setStatus] = useState(d.my_status)
  const [cat, setCat] = useState('Tutto')
  async function load() {
    const [p, s] = await Promise.all([
      supabase.from('bs_posts').select('*').eq('player_id', d.player_id).order('created_at', { ascending: false }),
      supabase.rpc('bs_my_signals', { p_player: d.player_id }),
    ])
    const list = (p.data as Post[]) || []
    setPosts(list)
    setUrls(await signed(list.map(x => x.image_path || '')))
    setMine(new Set(((s.data as any[]) || []).map(r => `${r.post_id}:${r.kind}`)))
  }
  useEffect(() => { supabase.rpc('bs_log_view', { p_player: d.player_id, p_post: null }); load() }, [d.player_id]) // eslint-disable-line react-hooks/exhaustive-deps
  const canSee = status === 'approved' || posts.length > 0
  async function request() {
    const { data, error } = await supabase.rpc('bs_request_access', { p_player: d.player_id, p_reason: reason, p_message: msg })
    if (error) { toast(t(error.message), 'err'); return }
    setStatus(String(data)); onChanged()
    toast(t('Richiesta inviata: riceverai una notifica quando risponde'))
  }
  async function signal(p: Post, kind: 'save' | 'interest') {
    const { data, error } = await supabase.rpc('bs_signal', { p_post: p.id, p_kind: kind })
    if (error) { toast(t(error.message), 'err'); return }
    const k = `${p.id}:${kind}`
    setMine(m => { const n = new Set(m); data ? n.add(k) : n.delete(k); return n })
    if (data) toast(kind === 'interest' ? t('{name} saprà che ti interessa').replace('{name}', d.name.split(' ')[0]) : t('Salvato'))
  }
  const shown = posts.filter(p => cat === 'Tutto' || p.category === cat)
  return (
    <div className="bs-wrap">
      <button className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={onBack}><Icon name="chevron-left" size={14} /> {t('Tutti gli atleti')}</button>
      <Head d={d} photo={photo}
        actions={canSee && role === 'brand' ? <button className="btn btn-sm btn-primary" onClick={() => goto('messages')}>{t('Proponi collaborazione')}</button> : undefined} />
      {!canSee ? (
        <div className="bs-gatewrap">
          <div className="bs-grid bs-blur">{Array.from({ length: Math.max(3, Math.min(6, d.posts)) }).map((_, i) => <div key={i} className="bs-tile ph" />)}</div>
          <div className="bs-gate card">
            <div style={{ fontSize: 26 }}>🔒</div>
            <b style={{ fontSize: 16 }}>{t('Il Backstage di {name} è privato').replace('{name}', d.name.split(' ')[0])}</b>
            {status === 'pending' ? <div className="bs-why">✓ {t('Richiesta inviata. Riceverai una notifica quando risponde.')}</div>
              : status === 'declined' ? <div className="bs-why">{t('Richiesta non accettata.')}</div>
              : <>
                <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{t('Chiedi l\'accesso e spiega perché vuoi conoscerlo. Vedrà chi sei e che hai visitato il profilo.')}</div>
                <select className="select" value={reason} onChange={e => setReason(e.target.value)}>{REASONS.map(r => <option key={r} value={r}>{t(r)}</option>)}</select>
                <textarea className="textarea" rows={2} value={msg} onChange={e => setMsg(e.target.value)} placeholder={t('Due righe su di te e sul progetto (facoltativo)')} />
                <button className="btn btn-primary" onClick={request}>{t('Chiedi l\'accesso')}</button>
              </>}
          </div>
        </div>
      ) : (<>
        <div className="bs-cats">{['Tutto', ...CATS].map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{t(c)}</button>)}</div>
        {shown.length === 0 ? <div className="card"><Empty icon={<Icon name="image" size={28} strokeWidth={1.4} />} title={t('Ancora nessun momento')} hint="" /></div>
          : <div className="bs-grid">{shown.map(p => (
            <button key={p.id} className="bs-tile" style={{ backgroundImage: p.image_path && urls[p.image_path] ? `url(${urls[p.image_path]})` : undefined }}
              onClick={() => { setOpen(p); supabase.rpc('bs_log_view', { p_player: d.player_id, p_post: p.id }) }}>
              {!p.image_path && <span className="bs-txt">{p.caption}</span>}
              {mine.has(`${p.id}:interest`) && <span className="bs-sv">★</span>}
            </button>
          ))}</div>}
      </>)}
      {open && (
        <Modal title={t(open.category)} onClose={() => setOpen(null)} dismissable>
          <div className="grid" style={{ gap: 12 }}>
            {open.image_path && urls[open.image_path] && <img src={urls[open.image_path]} alt="" className="bs-img" />}
            {open.caption && <div style={{ fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{open.caption}</div>}
            <div className="bs-two">
              <button className={`btn ${mine.has(`${open.id}:interest`) ? 'btn-primary' : ''}`} onClick={() => signal(open, 'interest')}>★ {t('Mi interessa')}</button>
              <button className={`btn ${mine.has(`${open.id}:save`) ? 'btn-primary' : ''}`} onClick={() => signal(open, 'save')}>{mine.has(`${open.id}:save`) ? t('Salvato') : t('Salva')}</button>
            </div>
            <div className="bs-mute">{t('Niente like pubblici e niente commenti: il tuo interesse arriva privato all\'atleta e ad AUVI.')}</div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const BS_CSS = `
.bs-wrap { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 860px; margin: 0 auto; width: 100%; }
.bs-kick { font-size: 11px; letter-spacing: 2.2px; text-transform: uppercase; font-weight: 800; color: var(--text-faint); }
.bs-head { display: grid; gap: 12px; }
.bs-id { display: flex; gap: 14px; align-items: center; }
.bs-av { width: 84px; height: 84px; border-radius: 50%; padding: 3px; flex-shrink: 0; background: conic-gradient(var(--yellow), #0A0A0A, var(--yellow)); }
.bs-av.sm { width: 54px; height: 54px; }
.bs-av { position: relative; }
.bs-av.edit { cursor: pointer; }
.bs-cam { position: absolute; right: -2px; bottom: -2px; width: 28px; height: 28px; border-radius: 50%; background: var(--yellow); color: #0A0A0A; display: grid; place-items: center; border: 3px solid var(--surface); font-style: normal; }
.bs-av img, .bs-av span { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid var(--surface); display: grid; place-items: center; background: var(--bg-2); font-weight: 900; }
.bs-nm { font-weight: 900; font-size: 21px; letter-spacing: -.4px; }
.bs-rl { font-size: 13px; color: var(--text-dim); margin-top: 2px; }
.bs-lock { white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; font-size: 11px; font-weight: 800; background: #0A0A0A; color: #fff; padding: 3px 9px; border-radius: 999px; }
.bs-bio { font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.bs-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.bs-chip { font-size: 12px; font-weight: 700; padding: 5px 11px; border-radius: 999px; background: var(--bg); border: 1px solid var(--border); }
.bs-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.bs-stats div { background: var(--bg); border-radius: 14px; padding: 10px 12px; display: grid; }
.bs-stats b { font-size: 19px; font-weight: 900; }
.bs-stats span { font-size: 11px; color: var(--text-faint); font-weight: 600; }
.bs-tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 4px; }
.bs-tabs button { flex: 1; border: 0; background: none; padding: 9px 6px; border-radius: 10px; font-weight: 800; font-size: 13px; color: var(--text-dim); cursor: pointer; position: relative; }
.bs-tabs button.on { background: var(--text); color: var(--bg, #fff); }
.bs-dot { margin-left: 6px; background: var(--red); color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 999px; }
.bs-cats { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.bs-cats button { white-space: nowrap; border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 7px 13px; font-size: 12.5px; font-weight: 700; cursor: pointer; color: var(--text-dim); }
.bs-cats button.on { background: var(--text); color: var(--bg, #fff); border-color: var(--text); }
.bs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; border-radius: 16px; overflow: hidden; }
.bs-tile { position: relative; aspect-ratio: 4/5; border: 0; padding: 0; cursor: pointer; background: var(--bg-2) center/cover; display: grid; place-items: center; }
.bs-tile.ph { cursor: default; background: linear-gradient(135deg, #cfcfcb, #9d9d98); }
.bs-txt { padding: 12px; font-size: 13px; font-weight: 700; line-height: 1.35; color: var(--text); text-align: left; }
.bs-aud { position: absolute; top: 7px; right: 7px; background: rgba(0,0,0,.55); color: #fff; border-radius: 7px; padding: 2px 6px; font-size: 10px; font-weight: 800; backdrop-filter: blur(4px); }
.bs-sv { position: absolute; bottom: 7px; left: 7px; background: var(--yellow); color: #0A0A0A; border-radius: 7px; padding: 2px 7px; font-size: 11px; font-weight: 900; }
.bs-hero { background: #0A0A0A; color: #fff; border-radius: 18px; padding: 16px; display: grid; gap: 8px; }
.bs-hero b { font-size: 34px; font-weight: 900; letter-spacing: -.5px; }
.bs-hero-l { font-size: 12px; color: #bdbdbd; }
.bs-bars { display: flex; align-items: flex-end; gap: 6px; height: 60px; }
.bs-bars i { flex: 1; background: #2b2b2b; border-radius: 5px 5px 2px 2px; }
.bs-bars i.hi { background: var(--yellow); }
.bs-days { display: flex; gap: 6px; font-size: 10px; color: #9a9a9a; } .bs-days span { flex: 1; text-align: center; text-transform: uppercase; }
.bs-row { display: flex; gap: 12px; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 11px 12px; color: var(--text); }
.bs-lg { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; font-weight: 900; color: #fff; background: #0A0A0A center/cover; font-size: 14px; }
.bs-lg.anon { color: var(--text-faint); background: repeating-linear-gradient(45deg, #e9e9e7, #e9e9e7 6px, #f3f3f1 6px, #f3f3f1 12px); }
.bs-rw { flex: 1; min-width: 0; display: grid; gap: 1px; }
.bs-rw b { font-size: 14px; }
.bs-rw span, .bs-dim { font-size: 12px; color: var(--text-faint); display: block; }
.bs-mute { font-size: 12px; color: var(--text-faint); text-align: center; }
.bs-req { display: grid; gap: 10px; }
.bs-why { font-size: 12.5px; line-height: 1.5; background: var(--bg); border-radius: 12px; padding: 10px 12px; color: var(--text-dim); }
.bs-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bs-sec { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; color: var(--text-faint); margin-top: 6px; }
.bs-img { width: 100%; border-radius: 16px; max-height: 70vh; object-fit: contain; background: var(--bg-2); }
.bs-pick { aspect-ratio: 4/5; max-width: 340px; justify-self: center; width: 100%; border: 2px dashed var(--border); border-radius: 18px; background: var(--bg) center/cover; cursor: pointer; display: grid; place-items: center; color: var(--text-dim); font-weight: 700; font-size: 13px; }
.bs-opt { display: flex; gap: 11px; align-items: flex-start; border: 1px solid var(--border); border-radius: 14px; padding: 11px; cursor: pointer; }
.bs-opt.on { border-color: var(--text); background: var(--bg); }
.bs-opt input { margin-top: 3px; accent-color: #0A0A0A; }
.bs-opt b { font-size: 13.5px; display: block; } .bs-opt span span { font-size: 12px; color: var(--text-faint); display: block; }
.bs-promise { display: grid; gap: 4px; font-size: 12px; color: var(--text-dim); background: var(--yellow-soft, #FFF9C2); border-radius: 14px; padding: 11px 12px; }
.bs-dir { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.bs-card { display: flex; gap: 12px; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 12px; cursor: pointer; color: var(--text); }
.bs-card b { font-size: 15px; display: block; }
.bs-st { font-size: 10.5px; font-weight: 800; padding: 3px 8px; border-radius: 999px; white-space: nowrap; background: #0A0A0A; color: #fff; }
.bs-st.approved { background: var(--green); } .bs-st.pending { background: var(--yellow); color: #0A0A0A; } .bs-st.declined { background: var(--bg-2); color: var(--text-faint); }
.bs-gatewrap { position: relative; }
.bs-blur { filter: blur(10px) saturate(.6); pointer-events: none; }
.bs-gate { position: relative; margin: -170px auto 0; max-width: 420px; display: grid; gap: 10px; text-align: center; box-shadow: 0 20px 40px -20px rgba(0,0,0,.35); }
.bs-incog { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 5px 12px 5px 5px; font-weight: 700; font-size: 12.5px; cursor: pointer; color: var(--text-dim); }
.bs-knob { width: 30px; height: 18px; border-radius: 999px; background: var(--border); position: relative; transition: background .2s; }
.bs-knob::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.bs-incog.on { color: var(--text); } .bs-incog.on .bs-knob { background: #0A0A0A; } .bs-incog.on .bs-knob::after { transform: translateX(12px); }
.bs-act { flex-shrink: 0; }
@media (max-width: 600px) { .bs-id { flex-wrap: wrap; } .bs-act { width: 100%; } .bs-act > * { width: 100%; } .bs-act .flex > * { flex: 1; justify-content: center; } .bs-av { width: 68px; height: 68px; } .bs-nm { font-size: 18px; } .bs-grid { gap: 2px; border-radius: 12px; } }
`
