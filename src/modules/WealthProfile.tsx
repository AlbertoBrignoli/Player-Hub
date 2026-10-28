import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Field, Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'
import { ProImages } from '../components/ProImages'
import { useLang } from '../lib/i18n'
import { useRouteParam } from '../lib/route'
import { igUrl } from './home/HomeContacts'

// Profilo del wealth manager (es. Delian & Co.): referente e società.
// Lo modifica il wealth manager; AUVI apre wealth-profile?id=<advisor_id> e lo prepara
// per lui, anche prima che entri. L'atleta lo vede nella scheda dei referenti.
export const WEALTH_ACCENT = '#1F4E79' // blu profondo: area patrimonio, distinta dal fisco (terra)

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

type P = Record<string, any>

export default function WealthProfile() {
  const { session, isAdmin } = useAuth()
  const { athletes } = useAthlete()
  const { t } = useLang()
  const [p, setP] = useState<P>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const editId = useRouteParam('id')
  const byAdmin = isAdmin && !!editId
  const uid = byAdmin ? editId! : session?.user.id
  const [linked, setLinked] = useState<number[]>([])
  const [joined, setJoined] = useState(true)

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      const { data } = await supabase.from('crm_wealth_profile').select('*').eq('advisor_id', uid).maybeSingle()
      if (byAdmin) {
        const [{ data: l }, { data: acc }] = await Promise.all([
          supabase.from('crm_wealth_athletes').select('player_id').eq('advisor_id', uid),
          supabase.from('crm_profiles').select('id').eq('id', uid).maybeSingle(),
        ])
        if (ok) { setLinked(((l as any[]) || []).map(x => Number(x.player_id))); setJoined(!!acc) }
      }
      if (!ok) return
      setP((data as P) || {})
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid, byAdmin])

  const set = (k: string, v: any) => setP(prev => ({ ...prev, [k]: v }))

  async function save() {
    if (!uid) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('crm_wealth_profile')
      .upsert({ ...p, advisor_id: uid, updated_at: new Date().toISOString() })
    setBusy(false)
    setMsg(error ? error.message : t('Profilo salvato.'))
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: WEALTH_ACCENT }} />
        <div className="flex gap" style={{ alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" style={{ width: 58, height: 58, borderRadius: 15, objectFit: 'cover' }} />
            : <div style={{ width: 58, height: 58, borderRadius: 15, background: WEALTH_ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#fff' }}>
                {(p.name || 'W').slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <div style={{ ...kicker, color: WEALTH_ACCENT }}>{byAdmin ? t('Wealth manager · modifica AUVI') : 'Wealth manager'}</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.3, marginTop: 2 }}>{p.name || t('Il mio profilo')}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              {[p.title, p.agency_name !== p.name ? p.agency_name : null].filter(Boolean).join(' · ') || t('Completa i tuoi dati')}
            </div>
          </div>
          {igUrl(p.instagram_url) && (
            <a href={igUrl(p.instagram_url)!} target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram"
              style={{ width: 54, height: 54, borderRadius: 12, background: '#fff', color: '#0A0A0A', display: 'grid', placeItems: 'center' }}>
              <Icon name="instagram" size={26} />
            </a>
          )}
          {p.agency_logo_url && (
            <div style={{ background: '#fff', borderRadius: 12, padding: '7px 10px', display: 'flex' }}>
              <img src={p.agency_logo_url} alt="" style={{ height: 40, maxWidth: 140, objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{t('Atleti')}</div>
            <div style={{ fontSize: 22, fontWeight: 900, borderBottom: `2px solid ${WEALTH_ACCENT}`, display: 'inline-block' }}>
              {byAdmin ? linked.length : athletes.length}
            </div>
          </div>
        </div>
      </div>

      {byAdmin && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          {t('Segue')}: {linked.map(id => athletes.find(x => x.api_player_id === id)?.name || `#${id}`).join(', ') || '—'}
          {p.advisor_id && !joined && <> · {t("Non è ancora entrato nell'app: lo stai preparando tu.")}</>}
        </div>
      )}

      <div className="card">
        <div className="card-head"><div className="card-title">{t('Referente')}</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          <Field label={t('Nome')}><Input value={p.name || ''} onChange={e => set('name', e.target.value)} /></Field>
          <Field label={t('Ruolo')}><Input value={p.title || ''} onChange={e => set('title', e.target.value)} placeholder={t('Es. Wealth manager · Partner')} /></Field>
          <Field label={t('Email')}><Input value={p.email || ''} onChange={e => set('email', e.target.value)} /></Field>
          <Field label={t('Telefono')}><Input value={p.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label={t('WhatsApp')}><Input value={p.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} /></Field>
          <Field label={t('Abilitazione')}><Input value={p.licence || ''} onChange={e => set('licence', e.target.value)} placeholder={t('Es. FINMA, albo consulenti')} /></Field>
          <Field label="Instagram"><Input value={p.instagram_url || ''} onChange={e => set('instagram_url', e.target.value)} placeholder="instagram.com/…" /></Field>
        </div>
        <ProImages uid={uid!} photo={p.photo_url} logo={p.agency_logo_url}
          onPhoto={u => set('photo_url', u)} onLogo={u => set('agency_logo_url', u)}
          logoHint="Il logo della società: comparirà accanto al nome. Meglio PNG con sfondo trasparente." />
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">{t('Società')}</div></div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
          {t("I dati della società: li vede l'agenzia AUVI e l'atleta che segui.")}
        </div>
        <div className="grid g2" style={{ gap: 10 }}>
          <Field label={t('Nome società')}><Input value={p.agency_name || ''} onChange={e => set('agency_name', e.target.value)} /></Field>
          <Field label={t('Sito web')}><Input value={p.agency_website || ''} onChange={e => set('agency_website', e.target.value)} placeholder="https://…" /></Field>
          <Field label={t('Email società')}><Input value={p.agency_email || ''} onChange={e => set('agency_email', e.target.value)} /></Field>
          <Field label={t('Telefono società')}><Input value={p.agency_phone || ''} onChange={e => set('agency_phone', e.target.value)} /></Field>
        </div>
        <Field label={t('Sede')}><Input value={p.agency_address || ''} onChange={e => set('agency_address', e.target.value)} placeholder={t('Via, città, paese')} /></Field>
        <Field label={t('Descrizione')}><Textarea rows={5} value={p.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      </div>

      <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          <Icon name="check" size={14} /> {busy ? t('Salvo…') : t('Salva profilo')}
        </button>
        {msg && <span className="faint" style={{ fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  )
}
