export const COLOR_TAGS = [
  "purple",
  "blue",
  "green",
  "orange",
  "red",
  "teal",
  "pink",
  "indigo",
  "gray"
];

export function normalizeColorTag(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return COLOR_TAGS.includes(normalized) ? normalized : null;
}
