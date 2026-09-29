import { toast } from './toast'

// Condivisione nativa del telefono (foglio di iOS/Android): da qui si salva
// la foto nel Rullino, la si manda su WhatsApp o la si apre in Instagram.
// Dove il browser non la supporta si ripiega sul download.
export async function shareFile(url: string, fileName: string, title?: string): Promise<void> {
  try {
    const blob = await fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: title || fileName })
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  } catch (e: any) {
    if (e?.name === 'AbortError') return // l'utente ha chiuso il foglio di condivisione
    toast('Condivisione non riuscita', 'err')
  }
}

export const canShareFiles = () => typeof navigator !== 'undefined' && 'share' in navigator
