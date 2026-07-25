import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useAuth } from '../auth/AuthContext'
import { initials } from '../lib/format'
import Icon from '../components/Icon'
import { Empty, Spinner } from '../components/ui'

// "Il mio team" (My Club): le persone che lavorano attorno a un atleta.
// Ogni professionista è una card che apre la SUA area (polizze, fisco, fitness,
// contratti): la persona sta qui, il suo lavoro si apre da qui.
// Dati reali dalla view crm_athlete_team (gate di visibilità lato DB).

type Member = {
  player_id: number; role: string; sort: number
  name: string | null; title: string | null; photo_url: string | null
  email: string | null; phone: string | null; whatsapp: string | null; agency_name: string | null
}

type Area = { route: string; label: string }
const ROLE: Record<string, { label: string; icon: string; area?: Area }> = {
  agente:         { label: 'Procuratore',          icon: 'briefcase', area: { route: 'archivio', label: 'Contratti e Documenti' } },
  preparatore:    { label: 'Preparatore atletico', icon: 'activity',  area: { route: 'fitness',  label: 'Area Fitness' } },
  assicuratore:   { label: 'Assicuratore',         icon: 'lock',      area: { route: 'insurance', label: 'Polizze e coperture' } },
  commercialista: { label: 'Commercialista',       icon: 'briefcase', area: { route: 'legaltax', label: 'Legal & Tax' } },
}

const PRO = ['preparatore', 'agente', 'assicuratore', 'commercialista', 'brand']

export default function MyTeam({ goto }: { goto?: (r: string) => void }) {
  const { athletes, athleteId } = useAthlete()
  const { isAdmin, role } = useAuth()
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const athlete = athletes.find(a => a.api_player_id === athleteId)
  // Chi può aprire tutte le aree: agenzia e atleta. Un professionista apre solo la sua.
  const canOpenAll = isAdmin || !PRO.includes(role || '')

  useEffect(() => {
    if (!athleteId) { setRows([]); setLoading(false); return }
    setLoading(true)
    supabase.from('crm_athlete_team').select('*').eq('player_id', athleteId).order('sort')
      .then(({ data }) => { setRows((data as Member[]) || []); setLoading(false) })
  }, [athleteId])

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* intestazione: il club dell'atleta */}
      <div className="flex gap" style={{ alignItems: 'center', gap: 14,
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 }}>
        {athlete?.photo_url ? (
          <img src={athlete.photo_url} alt={athlete.name || ''}
            style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div className="avatar" style={{ width: 58, height: 58, fontSize: 20 }}>{initials(athlete?.name)}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-dim)' }}>
            Il club di
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>{athlete?.name || 'Atleta'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 2 }}>
            Le persone che lavorano al tuo fianco: apri la scheda per entrare nella loro area.
          </div>
        </div>
      </div>

      {/* AUVI Agency: l'advisor è sempre presente */}
      <div>
        <div className="nav-label" style={{ paddingLeft: 2 }}>Advisor</div>
        <MemberCard name="AUVI Agency" roleLabel="Il tuo advisor · gestione a 360°"
          icon="star" email="info@auviagency.com" accent="var(--accent, #C6FF3A)" />
      </div>

      {/* professionisti collegati */}
      {loading ? <Spinner /> : rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <Empty icon={<Icon name="users" size={30} strokeWidth={1.4} />}
            title="Ancora nessun professionista collegato"
            hint={isAdmin
              ? 'Quando colleghi un preparatore, un procuratore, un assicuratore o un commercialista a questo atleta, compaiono qui.'
              : 'Il tuo team apparirà qui man mano che i professionisti vengono collegati.'} />
          {isAdmin && goto && (
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => goto('access-requests')}>
              <Icon name="key" size={15} /> Gestisci i collegamenti
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="nav-label" style={{ paddingLeft: 2 }}>Il team</div>
          <div className="grid" style={{ gap: 10 }}>
            {rows.map((m, i) => {
              const r = ROLE[m.role] || { label: m.role, icon: 'user' as string, area: undefined }
              const showArea = !!r.area && (canOpenAll || role === m.role)
              return (
                <MemberCard key={i} name={m.name} roleLabel={r.label} icon={r.icon}
                  title={m.title} agency={m.agency_name} photo={m.photo_url}
                  email={m.email} phone={m.phone} whatsapp={m.whatsapp}
                  area={showArea ? r.area : undefined}
                  onArea={showArea && r.area && goto ? () => goto(r.area!.route) : undefined} />
              )
            })}
          </div>
        </div>
      )}

      {isAdmin && goto && rows.length > 0 && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'start' }} onClick={() => goto('access-requests')}>
          <Icon name="key" size={14} /> Gestisci i collegamenti
        </button>
      )}
    </div>
  )
}

function MemberCard({ name, roleLabel, icon, title, agency, photo, email, phone, whatsapp, accent, area, onArea }: {
  name: string | null; roleLabel: string; icon: string
  title?: string | null; agency?: string | null; photo?: string | null
  email?: string | null; phone?: string | null; whatsapp?: string | null; accent?: string
  area?: Area; onArea?: () => void
}) {
  const sub = [title, agency].filter(Boolean).join(' · ')
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div className="flex between" style={{ gap: 12, alignItems: 'center', padding: 14 }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 12, minWidth: 0 }}>
          {photo ? (
            <img src={photo} alt={name || ''} style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15,
              background: accent ? 'rgba(198,255,58,.14)' : 'var(--card-dark, #101015)',
              color: accent || 'var(--text)', border: '1px solid var(--border)' }}>
              {name ? initials(name) : <Icon name={icon} size={20} />}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{name || '—'}</div>
            <div className="flex gap" style={{ alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ color: 'var(--text-dim)', display: 'inline-flex' }}><Icon name={icon} size={12} /></span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {roleLabel}{sub ? ` · ${sub}` : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap" style={{ gap: 6, flexShrink: 0 }}>
          {email && <a className="btn-ghost" style={ico} title={email} href={`mailto:${email}`}><Icon name="mail" size={16} /></a>}
          {phone && <a className="btn-ghost" style={ico} title={phone} href={`tel:${phone.replace(/\s/g, '')}`}><Icon name="smartphone" size={16} /></a>}
          {whatsapp && <a className="btn-ghost" style={ico} title="WhatsApp" target="_blank" rel="noreferrer"
            href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}><Icon name="message" size={16} /></a>}
        </div>
      </div>

      {/* apri l'area del professionista (le voci che prima stavano nel menu generale) */}
      {area && onArea && (
        <button onClick={onArea} className="flex between"
          style={{ width: '100%', cursor: 'pointer', gap: 10, alignItems: 'center', textAlign: 'left',
            padding: '11px 14px', border: 'none', borderTop: '1px solid var(--border)',
            background: 'var(--card-dark, #101015)', color: 'var(--text)' }}>
          <span className="flex gap" style={{ alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: 'var(--text-dim)', display: 'inline-flex' }}><Icon name="folder" size={15} /></span>
            {area.label}
          </span>
          <span style={{ color: 'var(--text-dim)', display: 'inline-flex' }}><Icon name="chevron-right" size={18} /></span>
        </button>
      )}
    </div>
  )
}

const ico: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', color: 'var(--text-dim)', border: '1px solid var(--border)',
}
