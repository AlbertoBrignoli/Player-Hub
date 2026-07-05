export function fmtMoney(n: number | null | undefined, currency = 'EUR') {
  if (n == null) return '—'
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${n} ${currency}`
  }
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return Math.ceil((dt.getTime() - Date.now()) / 86400000)
}

export function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  if (diff < 60) return 'adesso'
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h fa`
  return fmtDate(d)
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

// Solo questi formati si possono mostrare come <img> nel browser.
export function isImageFile(name: string | null | undefined) {
  return /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|svg)$/i.test(name || '')
}

export function fileExt(name: string | null | undefined) {
  const m = (name || '').match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toUpperCase() : 'FILE'
}

// Stagione calcistica (luglio-giugno): '2025/26' per una data di ottobre 2025 o marzo 2026.
export function seasonOf(d: string | Date) {
  const dt = typeof d === 'string' ? new Date(d) : d
  const y = dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`
}
