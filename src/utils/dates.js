export function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

/** Convert a UTC ISO timestamp (e.g. "2026-04-01T22:30:00.000Z") to an ET date string (YYYY-MM-DD) */
export function toETDate(isoTimestamp) {
  if (!isoTimestamp) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(isoTimestamp))
}

/** Get current time in ET as { hours, minutes } for comparing opens_at / due_by */
export function nowET() {
  const s = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = s.split(':').map(Number)
  return { hours: h, minutes: m }
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  } catch { return dateStr }
}
