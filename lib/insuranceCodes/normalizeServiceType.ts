import { normalizeServiceType } from './constants'

export function normalizeRegularServiceType(input: string | null | undefined): string | null {
  if (!input) return null
  const value = input.trim()
  const upper = value.toUpperCase()
  if (upper === 'DC' || upper === 'DR') return 'Direct Care'
  if (upper === 'SV') return 'Supervision'
  return value
}

export function normalizeInsuranceCodesServiceType(
  source: 'REGULAR' | 'BCBA',
  rawType: string | null | undefined
) {
  const normalizedRaw = source === 'REGULAR' ? normalizeRegularServiceType(rawType) : rawType
  return normalizeServiceType(normalizedRaw)
}
