export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map((part) => parseInt(part, 10))
  return new Date(year, month - 1, day)
}

export function toDateOnlyString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isDateOnlyBetween(dateStr: string, startStr: string, endStr: string): boolean {
  return dateStr >= startStr && dateStr <= endStr
}

export function parseDateOnlyToLocal(dateStr: string): Date {
  return parseDateOnly(dateStr)
}

export function parseDateOnlyToUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map((part) => parseInt(part, 10))
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatLocalDateToDateOnly(date: Date): string {
  return toDateOnlyString(date)
}

export function formatDateOnlyFromUTC(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
