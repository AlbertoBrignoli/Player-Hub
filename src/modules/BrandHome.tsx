import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { BrandLogo } from './BrandCard'
import type { Brand } from '../lib/types'

// Home del brand: hero con la sua identità (accento + claim dal DB, non cablati),
// poi gli atleti in partnership. Ogni box apre il Media Kit di quell'atleta.
type Roster = {
  api_player_id: number
  name: string | null
  photo_url: string | null
  team_name: string | null
  position: string | null
  instagram_followers: number | null
  status?: string          // partner = collaborazione attiva | proposto = offerto da AUVI
}

const DEFAULT_ACCENT = '#E31837'

// Tipografia del brand: maiuscolo compatto, come sui loro materiali.
const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

export default function BrandHome({ goto }: { goto?: (r: string) => void }) {
  const { session } = useAuth()
  const { setAthleteId } = useAthlete()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [rows, setRows] = useState<Roster[]>([])
  const [loading, setLoading] = useState(true)

  const uid = session?.user.id
  const accent = brand?.accent_color || DEFAULT_ACCENT

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      // RLS: un utente brand vede solo la propria area, anche se l'owner anagrafico è un altro
      const { data: b } = await supabase.from('crm_brands').select('*').limit(1).maybeSingle()
      // RLS: il brand vede solo gli atleti del proprio roster.
      const { data: p } = await supabase
        .from('player')
        .select('api_player_id, name, photo_url, team_name, position, instagram_followers')
        .not('api_player_id', 'is', null)
        .order('name')
      // stato della relazione: partner (contratto attivo) o proposto (offerto da AUVI)
      const { data: ba } = await supabase.from('crm_brand_athletes').select('player_id, status')
      if (!ok) return
      const st = new Map(((ba as any[]) || []).map(r => [r.player_id, r.status]))
      setBrand((b as Brand) || null)
      setRows(((p as Roster[]) || []).map(r => ({ ...r, status: st.get(r.api_player_id) || 'proposto' })))
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid])

  function open(id: number, route: string) {
    setAthleteId(id)
    goto?.(route)
  }

  if (loading) return <Spinner />

  const partners = rows.filter(r => r.status === 'partner')
  const proposti = rows.filter(r => r.status !== 'partner')
  const reach = rows.reduce((s, r) => s + (r.instagram_followers || 0), 0)
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`

  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* --- HERO brandizzata --- */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18,
        background: '#0a0a0a', border: '1px solid var(--border)',
        padding: '26px 24px',
      }}>
        {/* barra accento del brand */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: accent }} />
        <div style={{
          position: 'absolute', right: -70, top: -70, width: 240, height: 240, borderRadius: '50%',
          background: accent, opacity: .10, pointerEvents: 'none',
        }} />

        <div className="flex gap" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap', position: 'relative' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 8, display: 'flex' }}>
            <BrandLogo url={brand?.logo_url} name={brand?.name} size={54} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...kicker, color: accent }}>Area partner · AUVI</div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.05, marginTop: 3, textTransform: 'uppercase' }}>
              {brand?.name || 'Brand'}
            </div>
            {brand?.tagline && (
              <div style={{ ...kicker, fontSize: 11.5, color: 'var(--text-dim)', marginTop: 7 }}>{brand.tagline}</div>
            )}
          </div>
          {goto && (
            <button className="btn btn-sm" onClick={() => goto('brandcard')}
              style={{ background: accent, color: '#fff', fontWeight: 800, border: 'none' }}>
              <Icon name="edit" size={13} /> Modifica scheda
            </button>
          )}
        </div>

        {/* numeri della partnership */}
        <div className="flex gap" style={{ gap: 26, marginTop: 22, flexWrap: 'wrap', position: 'relative' }}>
          <Metric label="In partnership" value={String(partners.length)} accent={accent} />
          <Metric label="Profili proposti" value={String(proposti.length)} accent={accent} />
          <Metric label="Follower totali" value={reach ? fmtK(reach) : '—'} accent={accent} />
          <Metric label="Referente" value={brand?.contact_name || '—'} accent={accent} small />
        </div>
      </div>

      {/* --- Dati del brand --- */}
      <div className="card">
        <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 12 }}>Scheda brand</div>
        <div className="grid g3" style={{ gap: 10 }}>
          <Info k="Referente" v={brand?.contact_name} />
          <Info k="Ruolo" v={brand?.contact_role} />
          <Info k="Email" v={brand?.email} />
          <Info k="Telefono" v={brand?.phone} />
          <Info k="Sito" v={brand?.website?.replace(/^https?:\/\//, '')} />
        </div>
        {brand?.notes && (
          <div className="faint" style={{ fontSize: 13, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {brand.notes}
          </div>
        )}
      </div>

      {/* --- Roster: chi il brand ha sotto contratto e chi AUVI gli propone --- */}
      {partners.length > 0 && (
        <AthleteGroup title="In partnership con te" hint="Collaborazione attiva"
          rows={partners} accent={accent} kicker={kicker} fmtK={fmtK} open={open} isPartner />
      )}

      {proposti.length > 0 && (
        <AthleteGroup title="Il roster AUVI per te" hint="Profili che AUVI ti propone per una collaborazione"
          rows={proposti} accent={accent} kicker={kicker} fmtK={fmtK} open={open} />
      )}

      {rows.length === 0 && (
        <div className="card">
          <Empty icon={<Icon name="user" size={30} strokeWidth={1.4} />} title="Nessun atleta collegato"
            hint="Chiedi ad AUVI di collegare gli atleti alla tua area." />
        </div>
      )}
    </div>
  )
}

function AthleteGroup({ title, hint, rows, accent, kicker, fmtK, open, isPartner }: {
  title: string; hint: string; rows: any[]; accent: string; kicker: React.CSSProperties
  fmtK: (n: number) => string; open: (id: number, route: string) => void; isPartner?: boolean
}) {
  return (
    <div>
      <div className="flex between" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
            <span style={{ width: 3, height: 15, background: isPartner ? accent : 'var(--text-dim)', borderRadius: 2 }} />
            <span style={{ ...kicker, color: 'var(--text)' }}>{title}</span>
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 4, marginLeft: 12 }}>{hint}</div>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>{rows.length}</span>
      </div>

      <div className="grid g3" style={{ gap: 12 }}>
        {rows.map(a => (
          <div key={a.api_player_id} className="card"
            style={{ padding: 0, cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => open(a.api_player_id, 'mediakit')}
            role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') open(a.api_player_id, 'mediakit') }}>
            <div style={{ height: 3, background: isPartner ? accent : 'var(--border)' }} />
            <div style={{ padding: 16 }}>
              <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
                {a.photo_url
                  ? <img src={a.photo_url} alt={a.name || ''} style={{ width: 54, height: 54, borderRadius: 14, objectFit: 'cover' }} />
                  : <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                      {(a.name || '?').slice(0, 1)}
                    </div>}
                <div style={{ minWidth: 0 }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    {isPartner && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase', color: '#111', background: accent, borderRadius: 999, padding: '2px 7px' }}>Partner</span>}
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {[a.position, a.team_name].filter(Boolean).join(' · ') || 'Atleta'}
                  </div>
                  {a.instagram_followers ? (
                    <div style={{ ...kicker, fontSize: 10.5, color: isPartner ? accent : 'var(--text-dim)', marginTop: 4 }}>
                      {fmtK(a.instagram_followers)} follower
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex gap" style={{ marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={e => { e.stopPropagation(); open(a.api_player_id, 'mediakit') }}>
                  <Icon name="activity" size={13} /> Media Kit
                </button>
                {isPartner && (
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); open(a.api_player_id, 'messages') }}>
                    <Icon name="message" size={13} /> Scrivi
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); open(a.api_player_id, 'campaigns') }}>
                  <Icon name="image" size={13} /> Campagne
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value, accent, small }: { label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: small ? 15 : 22, fontWeight: 900, marginTop: 2, borderBottom: `2px solid ${accent}`, display: 'inline-block', paddingBottom: 2 }}>
        {value}
      </div>
    </div>
  )
}

function Info({ k, v }: { k: string; v: any }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700 }}>{k}</div>
      <div style={{ fontSize: 13.5, marginTop: 2 }}>{v || '—'}</div>
    </div>
  )
}
