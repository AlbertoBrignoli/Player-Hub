// Utility "azioni del telefono": singolo evento .ics da aggiungere al Calendario,
// link a Mappe, telefono, WhatsApp, email. Stesse regole di escape del feed
// calendar-feed (RFC 5545).

export interface IcsEvent {
  title: string
  start: Date | string
  end?: Date | string
  location?: string
  description?: string
  allDay?: boolean
}

const enc = new TextEncoder()
const pad = (n: number) => String(n).padStart(2, '0')

function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Righe a 75 ottetti, senza spezzare caratteri UTF-8
function fold(line: string): string {
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74 }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

const utc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

// Giornata intera: data locale del dispositivo
const localDay = (d: Date, addDays = 0) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDays)
  return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`
}

const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v))

export function buildIcs(ev: IcsEvent): string {
  const start = toDate(ev.start)
  if (isNaN(start.getTime())) throw new Error('Data evento non valida')
  let end = ev.end ? toDate(ev.end) : null
  if (!end || isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 3600_000)

  const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@auvi-player`
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AUVI//Player Hub//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utc(new Date())}`,
  ]
  if (ev.allDay) {
    L.push(`DTSTART;VALUE=DATE:${localDay(start)}`, `DTEND;VALUE=DATE:${localDay(start, 1)}`)
  } else {
    L.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`)
  }
  L.push(`SUMMARY:${esc(ev.title || 'Evento')}`)
  if (ev.location) L.push(`LOCATION:${esc(ev.location)}`)
  if (ev.description) L.push(`DESCRIPTION:${esc(ev.description)}`)
  L.push('END:VEVENT', 'END:VCALENDAR')
  return L.map(fold).join('\r\n') + '\r\n'
}

function safeFilename(title: string): string {
  const base = title
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]+/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60)
  return (base || 'evento') + '.ics'
}

// Scarica/apre il .ics: su iPhone Safari apre il foglio "Aggiungi al calendario".
export function downloadIcs(ev: IcsEvent): void {
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeFilename(ev.title)
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const isApple = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && ('ontouchend' in document || /iPad|iPhone|iPod/.test(navigator.userAgent)))

// Apple Maps su iPhone/iPad, Google Maps altrove
export function mapsUrl(location: string): string {
  const q = encodeURIComponent(location.trim())
  return isApple()
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`
}

// Numero "pulito": solo cifre, con + iniziale se presente (00 → +)
function cleanPhone(phone: string): string {
  const t = phone.trim()
  const digits = t.replace(/\D/g, '')
  if (t.startsWith('+')) return '+' + digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  return digits
}

export function telUrl(phone: string): string {
  return `tel:${cleanPhone(phone)}`
}

// wa.me vuole solo cifre col prefisso internazionale, senza + né 00
export function whatsappUrl(phone: string, text?: string): string {
  const digits = cleanPhone(phone).replace(/\D/g, '')
  return `https://wa.me/${digits}` + (text ? `?text=${encodeURIComponent(text)}` : '')
}

export function mailUrl(email: string, subject?: string, body?: string): string {
  const q: string[] = []
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`)
  if (body) q.push(`body=${encodeURIComponent(body)}`)
  return `mailto:${email.trim()}` + (q.length ? `?${q.join('&')}` : '')
}
