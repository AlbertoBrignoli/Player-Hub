import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { BrandLogo } from './BrandCard'
import type { Brand } from '../lib/types'

// Home del brand: la propria scheda in primo piano + gli atleti in partnership.
// Ogni atleta è una box: al clic diventa l'atleta attivo e si apre il suo Media Kit.
type Roster = {
  api_player_id: number
  name: string | null
  photo_url: string | null
  team_name: string | null
  position: string | null
  instagram_url: string | null
}

export default function BrandHome({ goto }: { goto?: (r: string) => void }) {
  const { session } = useAuth()
  const { setAthleteId } = useAthlete()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [rows, setRows] = useState<Roster[]>([])
  const [loading, setLoading] = useState(true)

  const uid = session?.user.id

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      const { data: b } = await supabase.from('crm_brands').select('*').eq('owner_id', uid).maybeSingle()
      // RLS: il brand vede solo gli atleti del proprio roster.
      const { data: p } = await supabase
        .from('player')
        .select('api_player_id, name, photo_url, team_name, position, instagram_url')
        .not('api_player_id', 'is', null)
        .order('name')
      if (!ok) return
      setBrand((b as Brand) || null)
      setRows((p as Roster[]) || [])
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid])

  function openAthlete(id: number) {
    setAthleteId(id)
    goto?.('mediakit')
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* --- Profilo brand in primo piano --- */}
      <div className="card" style={{ padding: 22 }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <BrandLogo url={brand?.logo_url} name={brand?.name} size={64} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="faint" style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>
              Brand · Partner
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{brand?.name || 'La tua scheda'}</div>
            {brand?.website && (
              <a href={brand.website} target="_blank" rel="noreferrer" className="faint" style={{ fontSize: 12.5 }}>
                {brand.website.replace(/^https?:\/\//, '')} ↗
              </a>
            )}
          </div>
          {goto && <button className="btn btn-sm" onClick={() => goto('brandcard')}><Icon name="edit" size={13} /> Modifica scheda</button>}
        </div>

        <div className="grid g3" style={{ gap: 10, marginTop: 18 }}>
          <Info k="Referente" v={brand?.contact_name} />
          <Info k="Ruolo" v={brand?.contact_role} />
          <Info k="Email" v={brand?.email} />
          <Info k="Telefono" v={brand?.phone} />
          <Info k="Atleti in partnership" v={rows.length || null} />
        </div>
        {brand?.notes && (
          <div className="faint" style={{ fontSize: 13, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {brand.notes}
          </div>
        )}
      </div>

      {/* --- Atleti in partnership --- */}
      <div>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700 }}>
            Atleti in partnership
          </div>
          <span className="faint" style={{ fontSize: 12 }}>{rows.length} attiv{rows.length === 1 ? 'o' : 'i'}</span>
        </div>

        {rows.length === 0 ? (
          <div className="card">
            <Empty icon={<Icon name="user" size={30} strokeWidth={1.4} />} title="Nessun atleta collegato"
              hint="Chiedi ad AUVI di collegare gli atleti alla tua partnership." />
          </div>
        ) : (
          <div className="grid g3" style={{ gap: 12 }}>
            {rows.map(a => (
              <div key={a.api_player_id} className="card" style={{ padding: 16, cursor: 'pointer' }}
                onClick={() => openAthlete(a.api_player_id)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') openAthlete(a.api_player_id) }}>
                <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
                  {a.photo_url
                    ? <img src={a.photo_url} alt={a.name || ''} style={{ width: 52, height: 52, borderRadius: 13, objectFit: 'cover' }} />
                    : <div style={{ width: 52, height: 52, borderRadius: 13, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        {(a.name || '?').slice(0, 1)}
                      </div>}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {[a.position, a.team_name].filter(Boolean).join(' · ') || 'Atleta'}
                    </div>
                  </div>
                </div>

                <div className="flex gap" style={{ marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); openAthlete(a.api_player_id) }}>
                    <Icon name="activity" size={13} /> Media Kit
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setAthleteId(a.api_player_id); goto?.('messages') }}>
                    <Icon name="message" size={13} /> Scrivi
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setAthleteId(a.api_player_id); goto?.('campaigns') }}>
                    <Icon name="image" size={13} /> Campagne
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
