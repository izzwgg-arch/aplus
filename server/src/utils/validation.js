export function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${field} is required`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

export function asOptionalString(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim() || null;
}

export function asNumber(value, field) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    const error = new Error(`${field} must be a number`);
    error.status = 400;
    throw error;
  }
  return num;
}

export function asDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${field} must be a valid date`);
    error.status = 400;
    throw error;
  }
  return date;
}
