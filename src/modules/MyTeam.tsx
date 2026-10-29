import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useAuth } from '../auth/AuthContext'
import { initials } from '../lib/format'
import Icon from '../components/Icon'
import { Empty, Spinner } from '../components/ui'
import ProProfileModal from '../components/ProProfile'

// "Il mio team" (My Club): le persone che lavorano attorno a un atleta.
// Ogni professionista è una casella: toccandola si apre la SUA area (polizze, fisco,
// fitness, contratti); dalla casella si apre anche il suo profilo o lo si contatta.
// Dati reali dalla view crm_athlete_team (gate di visibilità lato DB).

type Member = {
  player_id: number; role: string; sort: number
  name: string | null; title: string | null; photo_url: string | null
  email: string | null; phone: string | null; whatsapp: string | null; agency_name: string | null
  pro_id: string | null
  logo_url: string | null
}

type Area = { route: string; label: string }
const ROLE: Record<string, { label: string; icon: string; area?: Area }> = {
  agente:         { label: 'Procuratore',          icon: 'briefcase', area: { route: 'archivio', label: 'Contratti e Documenti' } },
  preparatore:    { label: 'Preparatore atletico', icon: 'activity',  area: { route: 'fitness',  label: 'Area Fitness' } },
  assicuratore:   { label: 'Assicuratore',         icon: 'lock',      area: { route: 'insurance', label: 'Polizze e coperture' } },
  commercialista: { label: 'Commercialista',       icon: 'briefcase', area: { route: 'legaltax', label: 'Legal & Tax' } },
  nutrizionista:  { label: 'Nutrizionista',        icon: 'layers',    area: { route: 'agenda', label: 'Piano alimentare' } },
  wealth:         { label: 'Wealth manager',       icon: 'briefcase', area: { route: 'wealth', label: 'Patrimonio' } },
}

const PRO = ['preparatore', 'agente', 'assicuratore', 'commercialista', 'wealth', 'brand']
// Un professionista in "Il mio team" vede i GIOCATORI che segue (non altri professionisti).
const ROSTER_ROLES = ['agente', 'assicuratore', 'commercialista', 'wealth']
const AREA_FOR: Record<string, string> = { agente: 'profile', assicuratore: 'insurance', commercialista: 'legaltax', wealth: 'wealth' }

export default function MyTeam({ goto }: { goto?: (r: string) => void }) {
  const { athletes, athleteId, setAthleteId } = useAthlete()
  const { t } = useLang()
  const { isAdmin, role } = useAuth()
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  // scheda del professionista aperta toccando la sua card
  const [openPro, setOpenPro] = useState<Member | null>(null)

  const athlete = athletes.find(a => a.api_player_id === athleteId)
  const isRoster = ROSTER_ROLES.includes(role || '')
  // Chi può aprire tutte le aree: agenzia e atleta. Un professionista apre solo la sua.
  const canOpenAll = isAdmin || !PRO.includes(role || '')

  useEffect(() => {
    if (isRoster) { setLoading(false); return }
    if (!athleteId) { setRows([]); setLoading(false); return }
    setLoading(true)
    supabase.from('crm_athlete_team').select('*').eq('player_id', athleteId).order('sort')
      .then(({ data }) => { setRows((data as Member[]) || []); setLoading(false) })
  }, [athleteId, isRoster])

  // ----- VISTA PROFESSIONISTA: i giocatori che segue -----
  if (isRoster) {
    const open = (api: number) => { setAthleteId(api); goto?.(AREA_FOR[role || ''] || 'profile') }
    return (
      <div className="grid" style={{ gap: 18 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-dim)' }}>
            {t('Il mio team')}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>{t('I miei giocatori')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 2 }}>
            {t('Gli atleti che segui. Tocca un giocatore per aprire la sua area.')}
          </div>
        </div>
        {athletes.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <Empty icon={<Icon name="users" size={30} strokeWidth={1.4} />}
              title={t("Nessun giocatore ancora collegato")}
              hint={t('Quando vieni collegato a un atleta, comparirà qui.')} />
          </div>
        ) : (
          <div className="grid" style={{ gap: 10 }}>
            {athletes.map(a => (
              <button key={a.api_player_id} onClick={() => open(a.api_player_id)}
                className="flex between" style={{ alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, color: 'var(--text)' }}>
                <span className="flex gap" style={{ alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {a.photo_url
                    ? <img src={a.photo_url} alt={a.name || ''} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    : <span className="avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{initials(a.name)}</span>}
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{a.name}</span>
                </span>
                <Icon name="chevron-right" size={18} />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }


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
            {t('Il club di')}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>{athlete?.name || t('Atleta')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 2 }}>
            {t('Le persone che lavorano al tuo fianco: apri la scheda per entrare nella loro area.')}
          </div>
        </div>
      </div>

      {/* AUVI Agency: l'advisor è sempre presente */}
      <div>
        <div className="nav-label" style={{ paddingLeft: 2 }}>{t('Advisor')}</div>
        <div style={TILES}>
          <MemberCard name="AUVI Agency" roleLabel={t("Il tuo advisor · gestione a 360°")}
            icon="star" email="info@auviagency.com" accent="var(--ink)" />
        </div>
      </div>

      {/* professionisti collegati */}
      {loading ? <Spinner /> : rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <Empty icon={<Icon name="users" size={30} strokeWidth={1.4} />}
            title={t("Ancora nessun professionista collegato")}
            hint={isAdmin
              ? t('Quando colleghi un preparatore, un procuratore, un assicuratore o un commercialista a questo atleta, compaiono qui.')
              : t('Il tuo team apparirà qui man mano che i professionisti vengono collegati.')} />
          {isAdmin && goto && (
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => goto('access-requests')}>
              <Icon name="key" size={15} /> {t('Gestisci i collegamenti')}
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="nav-label" style={{ paddingLeft: 2 }}>{t('Il team')}</div>
          <div style={TILES}>
            {rows.map((m, i) => {
              const r = ROLE[m.role] || { label: m.role, icon: 'user' as string, area: undefined }
              const showArea = !!r.area && (canOpenAll || role === m.role)
              return (
                <MemberCard key={i} name={m.name} roleLabel={t(r.label)} icon={r.icon}
                  title={m.title} agency={m.agency_name} photo={m.photo_url} logo={m.logo_url}
                  email={m.email} phone={m.phone} whatsapp={m.whatsapp}
                  area={showArea ? r.area : undefined}
                  onArea={showArea && r.area && goto ? () => goto(r.area!.route) : undefined}
                  onOpen={m.pro_id ? () => setOpenPro(m) : undefined} />
              )
            })}
          </div>
        </div>
      )}

      {openPro && openPro.pro_id && (
        <ProProfileModal role={openPro.role} proId={openPro.pro_id} roleLabel={(ROLE[openPro.role] || { label: openPro.role }).label}
          fallback={openPro} onClose={() => setOpenPro(null)} />
      )}

      {isAdmin && goto && rows.length > 0 && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'start' }} onClick={() => goto('access-requests')}>
          <Icon name="key" size={14} /> {t('Gestisci i collegamenti')}
        </button>
      )}
    </div>
  )
}

function MemberCard({ name, roleLabel, icon, title, agency, photo, logo, email, phone, whatsapp, accent, area, onArea, onOpen }: {
  name: string | null; roleLabel: string; icon: string
  title?: string | null; agency?: string | null; photo?: string | null; logo?: string | null
  email?: string | null; phone?: string | null; whatsapp?: string | null; accent?: string
  area?: Area; onArea?: () => void; onOpen?: () => void
}) {
  const { t } = useLang()
  const sub = [title, agency].filter(Boolean).join(' · ')
  // toccando la casella si entra nell'area del professionista; senza area, nel suo profilo
  const main = onArea || onOpen
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <div role={main ? 'button' : undefined} tabIndex={main ? 0 : undefined} className="mt-tile"
      onClick={main} onKeyDown={main ? e => { if (e.key === 'Enter') main() } : undefined}
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12, cursor: main ? 'pointer' : undefined, minWidth: 0 }}>
      <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
        {photo ? (
          <img src={photo} alt={name || ''} style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18,
            background: accent ? 'var(--yellow)' : 'var(--bg-2)',
            color: accent || 'var(--text)', border: '1px solid var(--border)' }}>
            {name ? initials(name) : <Icon name={icon} size={22} />}
          </div>
        )}
        {logo && <img src={logo} alt="" style={{ height: 26, maxWidth: 80, objectFit: 'contain' }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 6, color: 'var(--text-dim)' }}>
          <Icon name={icon} size={12} />
          <span style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800 }}>{roleLabel}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 3, lineHeight: 1.2 }}>{name || '—'}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {area && onArea && (
        <div className="flex between" style={{ marginTop: 'auto', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 11,
          background: 'var(--surface-2)', fontSize: 13, fontWeight: 800 }}>
          <span className="flex gap" style={{ alignItems: 'center', gap: 7 }}><Icon name="folder" size={15} /> {t(area.label)}</span>
          <Icon name="chevron-right" size={16} />
        </div>
      )}
      <div className="flex gap" style={{ gap: 5, alignItems: 'center', flexWrap: 'nowrap', marginTop: area && onArea ? 0 : 'auto' }}>
        {onOpen && <button className="btn btn-sm btn-ghost" style={{ paddingLeft: 0, whiteSpace: 'nowrap' }} onClick={e => { stop(e); onOpen() }}>{t('Vedi profilo')} →</button>}
        <span style={{ flex: 1 }} />
        {email && <a className="btn-ghost" style={ico} title={email} href={`mailto:${email}`} onClick={stop}><Icon name="mail" size={15} /></a>}
        {phone && <a className="btn-ghost" style={ico} title={phone} href={`tel:${phone.replace(/\s/g, '')}`} onClick={stop}><Icon name="smartphone" size={15} /></a>}
        {whatsapp && <a className="btn-ghost" style={ico} title="WhatsApp" target="_blank" rel="noreferrer" onClick={stop}
          href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}><Icon name="message" size={15} /></a>}
      </div>
    </div>
  )
}

const TILES: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }
const ico: React.CSSProperties = {
  width: 30, height: 30, flexShrink: 0, borderRadius: 10, display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', color: 'var(--text-dim)', border: '1px solid var(--border)',
}
