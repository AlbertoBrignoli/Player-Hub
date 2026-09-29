// Feed iCalendar (RFC 5545) personale: partite, impegni e uscite editoriali
// da aggiungere al Calendario di iPhone/Mac o a Google Calendar.
// Pubblica (verify_jwt = false): le app calendario non mandano header, l'unica
// autorizzazione è il token per-utente nel link (?t=<48 hex>), rigenerabile dall'app.
// Le regole di visibilità stanno TUTTE nel DB: crm_calendar_feed_items (migrazione 0026),
// eseguibile solo dalla service role. Nessun segreto nel codice, nessuna scrittura
// oltre a last_access (fatta dalla funzione SQL).
import { createClient } from 'npm:@supabase/supabase-js@2'

const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const APP_URL = 'https://player-hub-chi.vercel.app/#/'
const TZ = 'Europe/Athens'
const TOKEN_RE = /^[0-9a-f]{48}$/

interface Item {
  uid: string
  kind: string
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  description: string | null
  url_route: string | null
}

const enc = new TextEncoder()

// Testo: \\ ; , e a capo vanno protetti (RFC 5545 §3.3.11)
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Piega le righe a 75 ottetti senza spezzare un carattere UTF-8 (§3.1)
function fold(line: string): string {
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  let limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (curBytes + b > limit) {
      out.push(cur)
      cur = ''
      curBytes = 0
      limit = 74 // le righe di continuazione iniziano con uno spazio
    }
    cur += ch
    curBytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')

function utc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// Data (YYYYMMDD) nel fuso di Atene: le voci "giornata intera" arrivano a mezzogiorno locale
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
function localDate(d: Date): { y: number; m: number; d: number } {
  const [y, m, dd] = dayFmt.format(d).split('-').map(Number)
  return { y, m, d: dd }
}
function dateValue(p: { y: number; m: number; d: number }, addDays = 0): string {
  const x = new Date(Date.UTC(p.y, p.m - 1, p.d + addDays))
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}`
}

function buildCalendar(items: Item[]): string {
  const now = utc(new Date())
  const L: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AUVI//Player Hub//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:AUVI Player',
    `X-WR-TIMEZONE:${TZ}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const it of items) {
    const start = new Date(it.starts_at)
    if (isNaN(start.getTime())) continue
    L.push('BEGIN:VEVENT')
    L.push(`UID:${it.uid}@auvi-player`)
    L.push(`DTSTAMP:${now}`)
    if (it.all_day) {
      const day = localDate(start)
      L.push(`DTSTART;VALUE=DATE:${dateValue(day)}`)
      L.push(`DTEND;VALUE=DATE:${dateValue(day, 1)}`)
      L.push('TRANSP:TRANSPARENT')
    } else {
      const end = it.ends_at ? new Date(it.ends_at) : new Date(start.getTime() + 3600_000)
      L.push(`DTSTART:${utc(start)}`)
      L.push(`DTEND:${utc(end > start ? end : new Date(start.getTime() + 3600_000))}`)
    }
    L.push(`SUMMARY:${esc(it.title || 'AUVI Player')}`)
    if (it.location) L.push(`LOCATION:${esc(it.location)}`)
    if (it.description) L.push(`DESCRIPTION:${esc(it.description)}`)
    if (it.url_route) L.push(`URL:${APP_URL}${it.url_route}`)
    if (it.kind === 'match') {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.title || 'Partita')}`,
        'TRIGGER:-P1D', 'END:VALARM')
    }
    L.push('END:VEVENT')
  }

  L.push('END:VCALENDAR')
  return L.map(fold).join('\r\n') + '\r\n'
}

const notFound = () => new Response(null, { status: 404 })

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const token = new URL(req.url).searchParams.get('t') || ''
  if (!TOKEN_RE.test(token)) return notFound()

  // La RPC restituisce 0 righe sia per token sconosciuto sia per calendario vuoto:
  // prima controlliamo che il token esista (sconosciuto → 404, esistente → .ics anche vuoto).
  const { data: exists, error: e1 } = await supa
    .from('crm_calendar_tokens').select('user_id').eq('token', token).maybeSingle()
  if (e1) return new Response(null, { status: 500 })
  if (!exists) return notFound()

  const { data, error } = await supa.rpc('crm_calendar_feed_items', { p_token: token })
  if (error) return new Response(null, { status: 500 })

  const body = buildCalendar((data || []) as Item[])
  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="auvi-player.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
