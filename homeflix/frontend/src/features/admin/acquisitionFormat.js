/** Taille lisible : `350000000` → « 334 Mo », `1500000000` → « 1,4 Go ». Octets binaires (1 Mo = 1 048 576 octets). */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['octets', 'Ko', 'Mo', 'Go', 'To']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace('.', ',').replace(/,0$/, '')
  return `${text} ${units[unit]}`
}

/** L'adresse si c'est du http(s), sinon `null` : une preuve de licence ne doit jamais devenir un lien `javascript:`. */
export function safeHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
