export const SERVICE_TYPE_OPTIONS = [
  { value: 'Assessment', label: 'Assessment' },
  { value: 'DirectCare', label: 'Direct Care' },
  { value: 'Supervision', label: 'Supervision' },
  { value: 'TreatmentPlanning', label: 'Treatment Planning' },
  { value: 'ParentTraining', label: 'Parent Training' },
] as const

export const APPLIES_TO_OPTIONS = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'BCBA', label: 'BCBA' },
  { value: 'BOTH', label: 'Both' },
] as const

export type InsuranceCodeServiceType = (typeof SERVICE_TYPE_OPTIONS)[number]['value']
export type InsuranceCodeAppliesTo = (typeof APPLIES_TO_OPTIONS)[number]['value']

const SERVICE_TYPE_MAP: Record<string, InsuranceCodeServiceType> = {
  assessment: 'Assessment',
  directcare: 'DirectCare',
  'direct-care': 'DirectCare',
  supervision: 'Supervision',
  treatmentplanning: 'TreatmentPlanning',
  'treatment-planning': 'TreatmentPlanning',
  parenttraining: 'ParentTraining',
  'parent-training': 'ParentTraining',
}

export function normalizeServiceType(value?: string | null): InsuranceCodeServiceType | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, '').toLowerCase()
  return SERVICE_TYPE_MAP[normalized] || null
}

export function formatServiceType(value: InsuranceCodeServiceType | string | null | undefined): string {
  if (!value) return ''
  const match = SERVICE_TYPE_OPTIONS.find((option) => option.value === value)
  return match?.label || value.toString()
}

export function getServiceTypeMatchValues(value: InsuranceCodeServiceType): string[] {
  const label = formatServiceType(value)
  const compact = label.replace(/\s+/g, '')
  return Array.from(new Set([value, label, compact]))
}
