import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { ChatAvatar, useChatPhotos } from '../components/ChatAvatar'
import { useAttach } from '../components/ChatAttachment'
import { WA_CSS, WaItem, WaMessages, WaComposer, listWhen, seenAt, markSeen } from '../components/WaChat'
import type { Message, BrandLite } from '../lib/types'
import StaffChat, { STAFF_ROLE } from '../components/StaffChat'
import { useRouteParam } from '../lib/route'

// Canali: 'team' = giocatore <-> Alberto (Management) · 'fitness' = giocatore <-> preparatore
// 'brand:<id>' = giocatore <-> brand (es. Under Armour, solo per Zortea).
type Chan = { key: string; label: string; sub: string; icon: string; accent?: string | null; logo?: string | null }

const roleLabel = (r?: string | null) =>
  r === 'admin' ? 'Management' : r === 'brand' ? 'Brand' : r === 'player' || !r ? 'Giocatore' : STAFF_ROLE[r] || 'Giocatore'

// Due sezioni: "Chat" (dirette di sempre) e "Staff" (professionisti tra loro), come i filtri di WhatsApp.
export default function Messages() {
  const { t } = useLang()
  const { role } = useAuth()
  const staffParam = useRouteParam('staff')
  const canStaff = role !== 'brand' && role !== 'partner'
  const [mode, setMode] = useState<'direct' | 'staff'>(staffParam ? 'staff' : 'direct')
  useEffect(() => { if (staffParam) setMode('staff') }, [staffParam])
  const switcher = canStaff ? (
    <div className="wa-chips">
      {(['direct', 'staff'] as const).map(k => (
        <button key={k} onClick={() => setMode(k)} className={`wa-chipf ${mode === k ? 'on' : ''}`}>
          <Icon name={k === 'direct' ? 'message' : 'users'} size={13} /> {k === 'direct'
            ? (role === 'player' ? t('Le mie chat') : t('Con l\'atleta'))
            : (role === 'player' ? t('Il mio staff') : t('Staff'))}
        </button>
      ))}
    </div>
  ) : null
  return mode === 'staff' && canStaff
    ? <StaffChat openThread={staffParam} switcher={switcher} />
    : <DirectChat switcher={switcher} />
}

type Last = { body: string; at: string; sender_id: string; file_name: string | null; mine: boolean }

function DirectChat({ switcher }: { switcher?: React.ReactNode }) {
  const { t: tr } = useLang()
  const { session, profile, isAdmin, role } = useAuth()
  const { athleteId, athletes } = useAthlete()
  const me = session?.user.id
  const [rows, setRows] = useState<Message[]>([])
  const [brands, setBrands] = useState<BrandLite[]>([])
  // professionisti collegati all'atleta, per ruolo: nome e foto
  const [team, setTeam] = useState<Record<string, { name: string | null; photo: string | null }>>({})
  const [chan, setChan] = useState<string>('team')
  // su telefono: false = elenco, true = conversazione aperta
  const [open, setOpen] = useState(false)
  const [last, setLast] = useState<Record<string, Last>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const photoOf = useChatPhotos()
  const attach = useAttach(me)

  const isBrand = role === 'brand'
  const isCoach = role === 'preparatore'
  const isAgent = role === 'agente'
  const isInsurer = role === 'assicuratore'
  const isTax = role === 'commercialista'
  const isPhysio = role === 'fisioterapista'
  const isNutri = role === 'nutrizionista'
  const isWealth = role === 'wealth'
  const isPro = isCoach || isAgent || isInsurer || isTax || isPhysio || isNutri || isWealth
  const pro = (r: string) => team[r]?.name || null

  // Canali disponibili in base al ruolo e all'atleta attivo.
  const chans: Chan[] = isBrand
    ? brands.map(b => ({ key: `brand:${b.id}`, label: b.name, sub: tr('Brand'), icon: 'award', accent: b.accent_color, logo: b.logo_url }))
    : isCoach
      ? [{ key: 'fitness', label: tr('Area Fitness'), sub: tr('Preparazione atletica'), icon: 'dumbbell' }]
    : isAgent
      ? [{ key: 'team', label: tr('Gestione'), sub: tr('Management e procura'), icon: 'briefcase' }]
    : isInsurer
      ? [{ key: 'assicuratore', label: tr('Assicurazioni'), sub: tr('Polizze e coperture'), icon: 'lock' }]
    : isTax
      ? [{ key: 'commercialista', label: tr('Legale e fiscale'), sub: tr('Documenti e scadenze'), icon: 'briefcase' }]
    : isPhysio
      ? [{ key: 'fisioterapista', label: tr('Fisioterapia'), sub: tr('Trattamenti e recupero'), icon: 'activity' }]
    : isNutri
      ? [{ key: 'nutrizionista', label: tr('Alimentazione'), sub: tr('Piano alimentare e integrazione'), icon: 'layers' }]
    : isWealth
      ? [{ key: 'wealth', label: tr('Patrimonio'), sub: tr('Wealth management'), icon: 'briefcase' }]
      : [
          { key: 'team', label: tr('Alberto · Management'), sub: tr('AUVI Agency'), icon: 'briefcase' },
          ...(pro('agente') ? [{ key: 'agente', label: pro('agente')!, sub: tr('Procuratore'), icon: 'briefcase' }] : []),
          ...(pro('assicuratore') ? [{ key: 'assicuratore', label: pro('assicuratore')!, sub: tr('Assicuratore'), icon: 'lock' }] : []),
          ...(pro('commercialista') ? [{ key: 'commercialista', label: pro('commercialista')!, sub: tr('Commercialista'), icon: 'briefcase' }] : []),
          ...(pro('fisioterapista') ? [{ key: 'fisioterapista', label: pro('fisioterapista')!, sub: tr('Fisioterapista'), icon: 'activity' }] : []),
          ...(pro('nutrizionista') ? [{ key: 'nutrizionista', label: pro('nutrizionista')!, sub: tr('Nutrizionista'), icon: 'layers' }] : []),
          ...(pro('wealth') ? [{ key: 'wealth', label: pro('wealth')!, sub: tr('Wealth manager'), icon: 'briefcase' }] : []),
          // se l'atleta non ha un preparatore (es. Zortea), il canale non compare
          ...(team.preparatore ? [{ key: 'fitness', label: pro('preparatore') || tr('Preparatore'), sub: tr('Preparazione atletica'), icon: 'dumbbell' }] : []),
          ...brands.map(b => ({ key: `brand:${b.id}`, label: b.name, sub: tr('Partner ufficiale'), icon: 'award', accent: b.accent_color, logo: b.logo_url })),
        ]

  // Apertura diretta su un canale scelto altrove (es. card referenti in home).
  useEffect(() => {
    try {
      const want = sessionStorage.getItem('chat_channel')
      if (want) { setChan(want); setOpen(true); sessionStorage.removeItem('chat_channel') }
    } catch { /* storage non disponibile */ }
  }, [])

  // Tiene il canale attivo sempre valido quando cambia atleta o ruolo.
  useEffect(() => {
    if (chans.length && !chans.some(c => c.key === chan)) setChan(chans[0].key)
  }, [chans.map(c => c.key).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Brand associati all'atleta attivo, letti dal roster (crm_brand_athletes).
  useEffect(() => {
    let ok = true
    ;(async () => {
      if (isBrand) {
        const { data } = await supabase.from('crm_brands').select('id, name, accent_color, logo_url')
        if (ok) setBrands((data as BrandLite[]) || [])
        return
      }
      if (!athleteId) { setBrands([]); return }
      const { data } = await supabase
        .from('crm_brand_athletes')
        .select('player_id, status, crm_brands(id, name, accent_color, logo_url)')
        .eq('player_id', athleteId)
        .eq('status', 'partner')   // sui profili solo proposti non esiste conversazione
      if (!ok) return
      const list = ((data as any[]) || [])
        .map(r => r.crm_brands)
        .filter(Boolean)
        .map((b: any) => ({ id: b.id, name: b.name, accent_color: b.accent_color, logo_url: b.logo_url })) as BrandLite[]
      setBrands(list)
    })()
    return () => { ok = false }
  }, [athleteId, isBrand])

  // Professionisti collegati all'atleta (dal team): danno nome e foto ai canali del giocatore.
  // Se un professionista non è collegato, il suo canale non compare.
  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!athleteId || isBrand || isPro) { setTeam({}); return }
      const { data } = await supabase.from('crm_athlete_team').select('role, name, photo_url').eq('player_id', athleteId)
      if (!ok) return
      const m: Record<string, { name: string | null; photo: string | null }> = {}
      for (const r of (data as { role: string; name: string | null; photo_url: string | null }[]) || []) {
        if (!m[r.role]) m[r.role] = { name: r.name, photo: r.photo_url }
      }
      setTeam(m)
    })()
    return () => { ok = false }
  }, [athleteId, isBrand, isPro])

  const seenKey = (c: string) => `${me}:${athleteId}:${c}`

  // Ultimo messaggio e non letti di ogni conversazione, per l'elenco
  async function loadLast() {
    if (!athleteId) { setLast({}); setUnread({}); return }
    const { data } = await supabase.from('crm_messages')
      .select('channel, body, created_at, sender_id, file_name')
      .eq('player_id', athleteId).order('created_at', { ascending: false }).limit(400)
    const l: Record<string, Last> = {}, u: Record<string, number> = {}
    for (const m of (data as { channel: string | null; body: string; created_at: string; sender_id: string; file_name: string | null }[]) || []) {
      const c = m.channel || 'team'
      if (!l[c]) l[c] = { body: m.body, at: m.created_at, sender_id: m.sender_id, file_name: m.file_name, mine: m.sender_id === me }
      const seen = seenAt(seenKey(c))
      if (m.sender_id !== me && seen && m.created_at > seen) u[c] = (u[c] || 0) + 1
    }
    // prima apertura su questo dispositivo: tutto letto, poi si contano solo i nuovi
    for (const c of Object.keys(l)) if (!seenAt(seenKey(c))) markSeen(seenKey(c), l[c].at)
    setLast(l); setUnread(u)
  }

  async function load() {
    if (!athleteId) { setRows([]); setLoading(false); return }
    let q = supabase.from('crm_messages').select('*').eq('player_id', athleteId).order('created_at', { ascending: true })
    // 'team' include anche i messaggi storici senza canale.
    q = chan === 'team' ? q.or('channel.is.null,channel.eq.team') : q.eq('channel', chan)
    const { data } = await q
    const list = (data as Message[]) || []
    setRows(list)
    setLoading(false)
    if (list.length) markSeen(seenKey(chan), list[list.length - 1].created_at)
    setUnread(u => ({ ...u, [chan]: 0 }))
  }

  useEffect(() => {
    setLoading(true); load(); loadLast()
    const ch = supabase.channel('crm_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, () => { load(); loadLast() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [athleteId, chan]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if ((!text.trim() && !attach.pending) || !session || !athleteId) return
    setBusy(true)
    const att = await attach.take()
    if (att === false) { setBusy(false); return }
    const { error } = await supabase.from('crm_messages').insert({
      sender_id: session.user.id,
      sender_name: profile?.full_name || profile?.email,
      sender_role: profile?.role,
      body: text.trim() || att?.file_name || '',
      player_id: athleteId,
      channel: chan,
      ...(att || {}),
    })
    setBusy(false)
    if (error) toast(error.message, 'err')
    if (!error) { setText(''); load(); loadLast() }
  }

  const active = chans.find(c => c.key === chan)
  // Chi scrive al giocatore (management, professionisti, brand) deve vedere SEMPRE
  // e in chiaro a quale atleta sta scrivendo: il selettore in alto è troppo defilato.
  const toAthlete = isAdmin || isPro || isBrand
  const athlete = athletes.find(a => a.api_player_id === athleteId)
  const placeholder = tr('Scrivi a {name}…').replace('{name}', toAthlete
    ? (athlete?.name || tr('giocatore'))
    : (active?.label || 'AUVI'))

  // Foto del canale: AUVI per il management, il professionista, il logo del brand;
  // per chi scrive all'atleta (professionisti, brand) la foto dell'atleta.
  const ROLE_OF: Record<string, string> = { fitness: 'preparatore' }
  function chanAvatar(c: Chan, size = 48) {
    if (toAthlete && !isAdmin) return <ChatAvatar size={size} name={athlete?.name} role="player" photo={athlete?.photo_url || null} />
    if (c.logo) return <ChatAvatar size={size} name={c.label} role="brand" photo={c.logo} />
    if (c.key === 'team') return <ChatAvatar size={size} name="AUVI" role="admin" photo="/brand/auvi-mark-yellow.svg" />
    const ph = team[ROLE_OF[c.key] || c.key]?.photo
    if (ph) return <ChatAvatar size={size} name={c.label} photo={ph} />
    return <span className="wa-ico" style={{ width: size, height: size }}><Icon name={c.icon} size={Math.round(size * .4)} /></span>
  }
  // per professionisti e brand l'elenco porta il nome dell'atleta, il canale resta come contesto
  const titleOf = (c: Chan) => toAthlete && !isAdmin ? (athlete?.name || c.label) : c.label

  const ordered = [...chans]
    .filter(c => !q.trim() || (titleOf(c) + ' ' + c.sub).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (last[b.key]?.at || '').localeCompare(last[a.key]?.at || ''))

  function preview(c: Chan) {
    const l = last[c.key]
    if (!l) return <span>{c.sub}</span>
    return <>
      {l.mine && <span style={{ fontWeight: 600, flexShrink: 0 }}>{tr('Tu')}:</span>}
      {l.file_name && l.body === l.file_name && <Icon name="paperclip" size={13} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.body}</span>
    </>
  }

  return (
    <div className={`wa ${open ? 'open' : ''}`}>
      <style>{WA_CSS}</style>

      {/* elenco conversazioni */}
      <div className="wa-list">
        <div className="wa-list-head">
          <div className="wa-list-title"><h3>{tr('Chat')}</h3></div>
          {chans.length > 4 && (
            <label className="wa-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Cerca')} />
            </label>
          )}
          {switcher}
        </div>
        <div className="wa-items">
          {ordered.map(c => (
            <WaItem key={c.key} active={chan === c.key} avatar={chanAvatar(c)} title={titleOf(c)}
              when={listWhen(last[c.key]?.at, tr)} unread={chan === c.key ? 0 : unread[c.key]}
              preview={preview(c)}
              onClick={() => { setChan(c.key); setOpen(true) }} />
          ))}
          {ordered.length === 0 && <div className="faint" style={{ padding: 20, fontSize: 13, textAlign: 'center' }}>{tr('Nessun risultato')}</div>}
        </div>
      </div>

      {/* conversazione */}
      <div className="wa-thread">
        {active && (
          <div className="wa-head">
            <button className="wa-back" onClick={() => setOpen(false)} aria-label={tr('Indietro')}><Icon name="chevron-left" size={22} /></button>
            {chanAvatar(active, 40)}
            <div style={{ minWidth: 0 }}>
              <div className="wa-head-t">{toAthlete ? (athlete?.name || tr('Nessun atleta selezionato')) : active.label}</div>
              <div className="wa-head-s">{toAthlete ? active.label : active.sub} · {tr('conversazione riservata')}</div>
            </div>
          </div>
        )}
        {loading ? <div className="wa-blank"><Spinner /></div> : (
          <WaMessages msgs={rows} me={me} photoOf={(id, r) => r === 'brand' && active?.logo ? active.logo : photoOf(id, r)}
            names={m => tr(roleLabel(m.sender_role))}
            empty={<Empty icon={<Icon name="message" size={30} strokeWidth={1.4} />} title={tr('Nessun messaggio')}
              hint={tr('Inizia la conversazione con {name}.').replace('{name}', toAthlete ? (athlete?.name || tr('il giocatore')) : (active?.label || tr('il tuo referente')))} />} />
        )}
        <WaComposer value={text} onChange={setText} onSend={send} placeholder={placeholder}
          busy={busy} canSend={!!text.trim() || !!attach.pending} attach={attach} />
      </div>
    </div>
  )
}
