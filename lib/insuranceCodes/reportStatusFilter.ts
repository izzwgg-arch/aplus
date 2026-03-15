export function getDefaultReportIncludedStatuses(): string[] {
  // Reports detailed endpoint only applies status filtering when a status param is provided.
  // Default behavior is to include all statuses.
  return []
}

export function isIncludedStatus(status: string, allowedStatuses: string[]): boolean {
  if (!allowedStatuses.length) return true
  return allowedStatuses.includes(status)
}
