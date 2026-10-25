// Presentazione Media Kit in stile AUVI (template "Presentazione Player Hub", 12 slide 16:9).
// Le slide si compongono in HTML a 1920×1080 fuori schermo, si fotografano con html2canvas e
// diventano un PDF orizzontale. Pagine fisse AUVI + pagine dell'atleta con dati e foto dell'app.
// Le foto si preparano prima (ritaglio "cover" e bianco/nero) perché html2canvas non gestisce
// object-fit né i filtri CSS.

export type DeckPhoto = { url: string }   // url firmato o pubblico
export type DeckStory = { title1?: string; title2?: string; date?: string; subtitle?: string; text?: string; source?: string }
export type DeckData = {
  lang: 'it' | 'en'
  teaser: boolean
  name: string
  birthDate?: string | null      // 'YYYY-MM-DD'
  nationality?: string | null    // inglese da API-Football (es. 'Italy')
  bio?: string | null
  instagram?: string | null      // url o @handle
  values?: string[]; style?: string[]; interests?: string[]
  followers?: number | null; er?: number | null; reach?: number | null
  connected?: boolean; lastSync?: string | null
  story?: DeckStory | null
  photos: { hero?: string | null; profile?: string | null; social?: string | null; story?: string | null; final?: string | null }
}

const Y = '#FFEC00', G = '#797979', L = '#E2E2E2', D = '#242424'
const W = 1920, H = 1080

const NAT_IT: Record<string, [string, string]> = {
  Italy: ['Italiana', 'Italian'], Greece: ['Greca', 'Greek'], Spain: ['Spagnola', 'Spanish'], France: ['Francese', 'French'],
  Germany: ['Tedesca', 'German'], Portugal: ['Portoghese', 'Portuguese'], Brazil: ['Brasiliana', 'Brazilian'], Argentina: ['Argentina', 'Argentine'],
  Albania: ['Albanese', 'Albanian'], England: ['Inglese', 'English'], Netherlands: ['Olandese', 'Dutch'], Belgium: ['Belga', 'Belgian'],
  Croatia: ['Croata', 'Croatian'], Serbia: ['Serba', 'Serbian'], Switzerland: ['Svizzera', 'Swiss'], Poland: ['Polacca', 'Polish'],
  Romania: ['Rumena', 'Romanian'], Uruguay: ['Uruguaiana', 'Uruguayan'], Colombia: ['Colombiana', 'Colombian'], Morocco: ['Marocchina', 'Moroccan'],
}
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nl = (s: string) => esc(s).replace(/\n/g, '<br>')
const num = (n: number, lang: string) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'it-IT')
const list = (a: string[] = [], lang: string) => {
  const x = a.map(s => s.toLowerCase())
  if (x.length <= 1) return x.join('')
  return x.slice(0, -1).join(', ') + (lang === 'en' ? ' and ' : ' e ') + x[x.length - 1]
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
function band(n?: number | null) {
  if (!n) return ''
  const b = [[1e6, '1M+'], [5e5, '500K–1M'], [1e5, '100K–500K'], [5e4, '50K–100K'], [1e4, '10K–50K']] as const
  for (const [v, l] of b) if (n >= v) return l
  return '<10K'
}

// immagine → dataURL già ritagliata a (w×h), con punto focale un po' in alto (volti)
async function prep(url: string | null | undefined, w: number, h: number, gray = false): Promise<string | null> {
  if (!url) return null
  try {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob)
    const k = Math.max(w / bmp.width, h / bmp.height)
    const sw = w / k, sh = h / k
    const sx = (bmp.width - sw) / 2, sy = Math.max(0, Math.min(bmp.height - sh, (bmp.height - sh) * 0.3))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    if (gray) ctx.filter = 'grayscale(1) contrast(1.05)'
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h)
    return c.toDataURL('image/jpeg', 0.9)
  } catch { return null }
}

// SVG → PNG: html2canvas non disegna gli <img> SVG (logo AUVI)
async function svgPng(url: string, w: number, h: number): Promise<string> {
  try {
    const im = new Image(); im.src = url
    await im.decode()
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2
    c.getContext('2d')!.drawImage(im, 0, 0, w * 2, h * 2)
    return c.toDataURL('image/png')
  } catch { return url }
}

async function ensureFonts() {
  if (!document.getElementById('mk-fonts')) {
    const l = document.createElement('link')
    l.id = 'mk-fonts'; l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700&family=Inter:wght@400;500&display=swap'
    document.head.appendChild(l)
    await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 4000) })
  }
  await Promise.all(['600 40px Unbounded', '700 40px Unbounded', '400 30px Inter', '500 30px Inter'].map(f => document.fonts.load(f).catch(() => null)))
}

// titoli larghi come nel template (Monument Extended → Unbounded)
const T = (size: number, color: string, extra = '') =>
  `font-family:Unbounded,Archivo,sans-serif;font-weight:700;font-size:${size}px;line-height:1.05;color:${color};text-transform:uppercase;letter-spacing:.01em;${extra}`
const P = (size: number, color: string, extra = '') =>
  `font-family:Inter,sans-serif;font-weight:400;font-size:${size}px;line-height:1.26;color:${color};${extra}`
const abs = (x: number, y: number, extra = '') => `position:absolute;left:${x}px;top:${y}px;${extra}`

function chrome(color: string, footer: string, roma = true) {
  return `<div style="${abs(24, 22)}${T(22, color)}">AUVI AGENCY</div>
    ${roma ? `<div style="${abs(0, 22)}right:28px;left:auto;${T(22, color)}">ROMA</div>` : ''}
    <div style="${abs(24, 1034)}${T(22, color)}">${footer}</div>`
}

// collect: se passato, raccoglie le slide come immagini invece di salvare il PDF (anteprime/test)
export async function renderMediaKitDeck(d: DeckData, fileName: string, onProgress?: (n: number, tot: number) => void, collect?: string[]) {
  const it = d.lang !== 'en'
  const t = (a: string, b: string) => (it ? a : b)
  await ensureFonts()

  const [markBlack, markYellow] = await Promise.all([svgPng('/brand/auvi-mark.svg', 140, 70), svgPng('/brand/auvi-mark-yellow.svg', 160, 80)])
  const [hero, profile, social, story, fin] = await Promise.all([
    prep(d.photos.hero, W, H),
    prep(d.photos.profile, 705, H),
    prep(d.photos.social, 990, H, true),
    prep(d.photos.story, 925, H),
    prep(d.photos.final, 1586, 950),
  ])

  const first = (d.name || '').split(' ')[0]
  const nameLines = (d.name || '').toUpperCase().split(' ')
  const nat = d.nationality ? (NAT_IT[d.nationality]?.[it ? 0 : 1] || d.nationality) : ''
  const birth = d.birthDate ? new Date(d.birthDate + 'T12:00:00').toLocaleDateString(it ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const handle = d.instagram ? '@' + d.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[/?].*$/, '').replace(/^@/, '') : ''
  const socialText = [
    d.values?.length ? t(`${cap(list(d.values, 'it'))} sono i valori scelti da ${first}.`, `${cap(list(d.values, 'en'))} are the values ${first} identifies with.`) : '',
    d.style?.length ? t(`Si riconosce in uno stile ${list(d.style, 'it')}.`, `Style: ${list(d.style, 'en')}.`) : '',
    d.interests?.length ? t(`Fuori dal campo indica ${list(d.interests, 'it')} tra i suoi interessi.`, `Off the pitch: ${list(d.interests, 'en')}.`) : '',
  ].filter(Boolean).join(' ')
  const sync = d.lastSync ? new Date(d.lastSync).toLocaleString(it ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  const s = d.story && (d.story.text || d.story.subtitle) ? d.story : null

  const slides: { bg: string; html: string }[] = []

  // 1 · copertina
  slides.push({ bg: '#000', html: `
    <div style="${abs(112, 478)}${T(46, Y)}">MEDIA KIT<br>${esc(d.name)}</div>
    <img src="/mediakit/auvi-wordmark-yellow.png" style="${abs(1460, 533, 'width:320px;height:78px;')}">` })

  // 2 · perché Player Hub
  slides.push({ bg: G, html: chrome(D, 'MARKETING &amp; STRATEGY AGENCY') + `
    <div style="${abs(112, 262)}${T(78, D)}">${t('Perché Player Hub?', 'Why Player Hub?')}</div>
    <div style="${abs(112, 372)}${T(30, Y)}">${t('Brand e atleti, protagonisti', 'Brands and athletes, centre stage')}</div>
    <div style="${abs(112, 439, 'width:1700px;')}${P(32, D)}">${t(
      'Player Hub mette in relazione brand e atleti. Il brand sceglie conoscendo già valori, gusti, preferenze commerciali, attività disponibili e numeri social dichiarati o collegati dall’atleta.',
      'Player Hub connects brands and athletes. Brands choose already knowing the athlete’s values, tastes, commercial preferences, available activities and declared or connected social numbers.')}</div>
    <div style="${abs(112, 606, 'width:1700px;')}${P(32, D)}">${t(
      'Il brand può consultare il calendario condiviso e programmare shooting e attività compatibili con gli impegni dell’atleta. Le informazioni raccolte in piattaforma facilitano scelte coerenti e una pianificazione chiara per entrambi.',
      'Brands can check the shared calendar and schedule shoots and activities around the athlete’s commitments. The information gathered on the platform makes for consistent choices and clear planning on both sides.')}</div>
    <div style="${abs(112, 786, 'width:1700px;')}${P(32, D)}">${t(
      'AUVI mette a disposizione la piattaforma, il proprio know-how e i servizi di supporto. Brand e atleta definiscono la collaborazione: budget, attività e condizioni sono chiari prima dell’avvio. Le fee dipendono dall’abbonamento sottoscritto.',
      'AUVI provides the platform, its know-how and support services. Brand and athlete define the collaboration: budget, activities and terms are clear before kick-off. Fees depend on the subscription plan.')}</div>
    <div style="${abs(112, 958)}${T(28, Y)}">${t('La piattaforma abilita. Brand e atleti scelgono.', 'The platform enables. Brands and athletes choose.')}</div>` })

  // 3 · diagramma
  const circle = (cx: number, cy: number, r: number, label: string) => `
    <div style="${abs(cx - r, cy - r, `width:${r * 2}px;height:${r * 2}px;border-radius:50%;border:2px solid #c9c9c9;background:${G};box-sizing:border-box;`)}"></div>
    <div style="${abs(cx - r, cy - 14, `width:${r * 2}px;text-align:center;`)}${T(24, D)}">${label}</div>`
  slides.push({ bg: G, html: chrome(D, 'MARKETING &amp; STRATEGY AGENCY') + `
    <div style="${abs(958 - 330, 611 - 330, 'width:660px;height:660px;border-radius:50%;border:4px dashed ' + Y + ';box-sizing:border-box;')}"></div>
    ${circle(958, 312, 212, 'CORPORATE')}${circle(685, 766, 212, 'BRANDS')}${circle(1229, 766, 212, 'TALENTS')}
    <div style="${abs(958 - 135, 611 - 135, `width:270px;height:270px;border-radius:50%;background:${Y};`)}"></div>
    <img src="${markBlack}" style="${abs(958 - 70, 611 - 35, 'width:140px;height:70px;')}">` })

  // 4 · the best way…
  slides.push({ bg: G, html: chrome(D, 'MARKETING &amp; STRATEGY AGENCY') + `
    <div style="${abs(112, 384)}${T(30, D)}">DESIGN. STRATEGY. CONTENT.</div>
    <div style="${abs(108, 446)}${T(112, D, 'line-height:.98;')}">THE BEST<br>WAY TO SEE<br>THE FUTURE IS<br>TO CREATE IT.</div>
    <img src="/mediakit/hands.png" style="${abs(1444, -9, 'width:344px;height:1098px;')}">` })

  // 5 · foto a tutta pagina
  if (hero) slides.push({ bg: '#000', html: `<img src="${hero}" style="${abs(0, 0, `width:${W}px;height:${H}px;`)}">
    <div style="${abs(24, 22)}${T(22, Y)}">AUVI AGENCY</div><div style="${abs(0, 22)}right:28px;left:auto;${T(22, Y)}">ROMA</div>
    <div style="${abs(24, 1034)}${T(22, Y)}">OWN YOUR IMAGE</div>` })

  // 6 · profilo
  const bio = d.bio || ''
  slides.push({ bg: L, html: `
    ${profile ? `<img src="${profile}" style="${abs(1215, 0, `width:705px;height:${H}px;`)}">` : ''}
    <div style="${abs(26, 30)}${T(300, Y, 'line-height:.82;')}">01</div>
    <div style="${abs(116, 168)}${T(nameLines.join(' ').length > 18 ? 92 : 108, D, 'line-height:1.02;')}">${nameLines.map(esc).join('<br>')}</div>
    ${chrome(D, 'MARKETING &amp; STRATEGY AGENCY', false)}
    ${birth ? `<div style="${abs(116, 470)}${T(28, D)}">${t('Data di nascita', 'Date of birth')}</div><div style="${abs(116, 516)}${P(32, D)}">${esc(birth)}</div>` : ''}
    ${nat ? `<div style="${abs(650, 470)}${T(28, D)}">${t('Nazionalità', 'Nationality')}</div><div style="${abs(650, 516)}${P(32, D)}">${esc(nat)}</div>` : ''}
    ${bio ? `<div style="${abs(116, 612)}${T(28, D)}">${t('Profilo', 'Profile')}</div><div style="${abs(116, 666, 'width:1010px;')}${P(31, D)}">${nl(bio)}</div>` : ''}` })

  // 7 · profilo social
  const hasNums = !!d.followers
  slides.push({ bg: '#000', html: `
    ${social ? `<img src="${social}" style="${abs(930, 0, `width:990px;height:${H}px;`)}">` : ''}
    <div style="${abs(24, 22)}${T(22, Y)}">AUVI AGENCY</div><div style="${abs(0, 22)}right:28px;left:auto;${T(22, Y)}">ROMA</div>
    <div style="${abs(100, 146)}${T(44, Y)}">${t('Profilo social', 'Social profile')}</div>
    ${handle ? `<div style="${abs(100, 221)}${P(30, '#fff')}">Instagram ${esc(handle)}</div>` : ''}
    ${socialText ? `<div style="${abs(100, 301, 'width:760px;')}${P(30, '#fff')}">${esc(socialText)}</div>` : ''}
    ${hasNums ? `<div style="${abs(98, 536)}${T(92, '#fff')}">${d.teaser ? band(d.followers) : num(d.followers!, d.lang)}</div>
      <div style="${abs(100, 640)}${T(25, Y)}">Follower</div>` : ''}
    ${hasNums && !d.teaser && d.er != null ? `<div style="${abs(98, 716)}${T(56, '#fff')}">${String(d.er).replace('.', it ? ',' : '.')}%</div><div style="${abs(100, 788)}${T(20, Y)}">Engagement</div>` : ''}
    ${hasNums && !d.teaser && d.reach ? `<div style="${abs(505, 716)}${T(56, '#fff')}">${num(d.reach, d.lang)}</div><div style="${abs(507, 788)}${T(20, Y)}">${t('Reach media/post', 'Avg reach/post')}</div>` : ''}
    <div style="${abs(100, 868)}${T(26, Y)}">${t('Insights su richiesta', 'Insights on request')}</div>
    <div style="${abs(100, 926)}${P(22, '#fff', 'line-height:1.36;')}">${[
      d.connected ? t('Fonte: account Instagram collegato in Player Hub.', 'Source: Instagram account connected to Player Hub.') : t('Fonte: dati dichiarati dall’atleta in Player Hub.', 'Source: data declared by the athlete on Player Hub.'),
      sync ? t(`Ultimo aggiornamento: ${sync}.`, `Last updated: ${sync}.`) : '',
      t('Descrizione basata sul profilo commerciale dell’atleta.', 'Description based on the athlete’s commercial profile.'),
    ].filter(Boolean).map(esc).join('<br>')}</div>` })

  // 8 · un momento nella storia (facoltativo)
  if (s) slides.push({ bg: L, html: `
    ${story ? `<img src="${story}" style="${abs(995, 0, `width:925px;height:${H}px;`)}">` : ''}
    <div style="${abs(24, 22)}${T(22, D)}">AUVI AGENCY</div>
    <div style="${abs(116, 168)}${T(78, D)}">${esc(s.title1 || t('Un gol', 'A goal'))}</div>
    <div style="${abs(116, 254)}${T(56, D)}">${esc(s.title2 || t('nella storia', 'in history'))}</div>
    ${s.date ? `<div style="${abs(116, 430)}${T(28, D)}">${esc(s.date)}</div>` : ''}
    ${s.subtitle ? `<div style="${abs(116, 501, 'width:800px;')}${P(34, D)}">${esc(s.subtitle)}</div>` : ''}
    ${s.text ? `<div style="${abs(116, 587, 'width:800px;')}${P(34, D)}">${nl(s.text)}</div>` : ''}
    ${s.source ? `<div style="${abs(116, 979)}${P(21, '#7a7a7a')}">${esc(s.source)}</div>` : ''}
    <div style="${abs(24, 1034)}${T(22, D)}">MARKETING &amp; STRATEGY AGENCY</div>` })

  // 9 · scelte consapevoli
  slides.push({ bg: G, html: chrome(D, 'MARKETING &amp; STRATEGY AGENCY') + `
    <div style="${abs(112, 168)}${T(68, D, 'line-height:1.18;')}">${t('Scelte consapevoli<br>accordi trasparenti', 'Informed choices<br>transparent deals')}</div>
    <div style="${abs(116, 440)}${T(26, Y)}">${t('Il brand sceglie', 'The brand chooses')}</div>
    <div style="${abs(1040, 440)}${T(26, Y)}">${t('L’atleta si racconta', 'The athlete tells their story')}</div>
    <div style="${abs(116, 496, 'width:820px;')}${P(34, D)}">${t('Conosce gusti, valori, preferenze e numeri social dell’atleta. Consulta il calendario condiviso e programma shooting e attività in base agli impegni già presenti.', 'Knows the athlete’s tastes, values, preferences and social numbers. Checks the shared calendar and schedules shoots and activities around existing commitments.')}</div>
    <div style="${abs(1040, 496, 'width:800px;')}${P(34, D)}">${t('Indica chi è, quali brand e attività preferisce e quando è disponibile. Mantiene il controllo sulle proprie scelte e sulle collaborazioni che accetta.', 'Shares who they are, which brands and activities they prefer and when they’re available. Stays in control of their choices and of the collaborations they accept.')}</div>
    <div style="${abs(116, 751, 'width:1700px;')}${P(32, D)}">${t('Budget complessivo, attività, tempi, diritti d’immagine e fee sono definiti prima dell’avvio. Le fee variano in base all’abbonamento sottoscritto. Ogni extra richiede approvazione: nessuna sorpresa.', 'Overall budget, activities, timing, image rights and fees are agreed before kick-off. Fees vary with the subscription plan. Any extra needs approval: no surprises.')}</div>
    <div style="${abs(116, 881, 'width:1700px;')}${P(31, D)}">${t('AUVI fornisce piattaforma, know-how e servizi. Il valore lo costruiscono insieme brand e atleta.', 'AUVI provides platform, know-how and services. Brand and athlete build the value together.')}</div>
    <div style="${abs(116, 960)}${T(28, Y)}">${t('Win–win: i protagonisti siete voi', 'Win–win: you are the protagonists')}</div>` })

  // 10 · foto incorniciata
  if (fin) slides.push({ bg: '#000', html: `
    <div style="${abs(24, 22)}${T(22, Y)}">AUVI AGENCY</div><div style="${abs(0, 22)}right:28px;left:auto;${T(22, Y)}">ROMA</div>
    <div style="${abs(164, 64, `width:6px;height:950px;background:${Y};`)}"></div>
    <img src="${fin}" style="${abs(170, 64, 'width:1586px;height:950px;')}">
    <div style="${abs(24, 1034)}${T(22, Y)}">OWN YOUR IMAGE</div>` })

  // 11 · contatti
  const row = (y: number, k: string, v: string) => `<div style="${abs(1238, y)}${T(20, Y)}">${k}</div><div style="${abs(1473, y - 4)}${P(26, '#fff')}">${v}</div>`
  slides.push({ bg: '#000', html: chrome(Y, 'MARKETING &amp; STRATEGY AGENCY') + `
    <div style="${abs(1238, 640)}${T(40, '#fff')}">AUVI AGENCY SRL</div>
    ${row(724, t('Sede legale', 'Registered office'), 'Via Chiossetto, 7<br>00122 – Milano (MI)')}
    ${row(808, t('P.IVA', 'VAT no.'), '14273980962')}${row(856, 'PEC', 'auviagency@legalmail.it')}
    ${row(904, 'Mail', 'info@auviagency.com')}${row(952, 'Web', 'auviagency.com')}` })

  // 12 · chiusura
  slides.push({ bg: '#000', html: `
    <img src="${markYellow}" style="${abs(960 - 80, 541 - 40, 'width:160px;height:80px;')}">
    <div style="${abs(0, 1000, `width:${W}px;text-align:center;`)}${T(20, '#fff', 'font-style:italic;')}">OWN YOUR IMAGE</div>` })

  // composizione e foto
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-30000px;top:0;width:${W}px;height:${H}px;overflow:hidden;`
  document.body.appendChild(host)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H], hotfixes: ['px_scaling'], compress: true })
  try {
    for (let i = 0; i < slides.length; i++) {
      onProgress?.(i + 1, slides.length)
      host.innerHTML = `<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${slides[i].bg};">${slides[i].html}</div>`
      const imgs = Array.from(host.querySelectorAll('img'))
      await Promise.all(imgs.map(im => im.complete ? null : new Promise(r => { im.onload = r; im.onerror = r })))
      const canvas = await html2canvas(host.firstElementChild as HTMLElement, { width: W, height: H, scale: 1, backgroundColor: slides[i].bg, useCORS: true, logging: false })
      const jpg = canvas.toDataURL('image/jpeg', 0.9)
      if (collect) { collect.push(jpg); continue }
      if (i > 0) pdf.addPage([W, H], 'landscape')
      pdf.addImage(jpg, 'JPEG', 0, 0, W, H, undefined, 'FAST')
    }
    if (!collect) pdf.save(fileName)
  } finally { host.remove() }
}
