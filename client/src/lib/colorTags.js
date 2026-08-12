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

export const COLOR_TAG_STYLES = {
  purple: { dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 border-purple-200", eventBg: "#f3e8ff", eventBorder: "#a855f7", eventText: "#6b21a8" },
  blue: { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200", eventBg: "#dbeafe", eventBorder: "#2563eb", eventText: "#1d4ed8" },
  green: { dot: "bg-green-500", badge: "bg-green-50 text-green-700 border-green-200", eventBg: "#dcfce7", eventBorder: "#16a34a", eventText: "#166534" },
  orange: { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200", eventBg: "#ffedd5", eventBorder: "#ea580c", eventText: "#9a3412" },
  red: { dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200", eventBg: "#fee2e2", eventBorder: "#dc2626", eventText: "#991b1b" },
  teal: { dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700 border-teal-200", eventBg: "#ccfbf1", eventBorder: "#0d9488", eventText: "#115e59" },
  pink: { dot: "bg-pink-500", badge: "bg-pink-50 text-pink-700 border-pink-200", eventBg: "#fce7f3", eventBorder: "#db2777", eventText: "#9d174d" },
  indigo: { dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 border-indigo-200", eventBg: "#e0e7ff", eventBorder: "#4f46e5", eventText: "#312e81" },
  gray: { dot: "bg-slate-500", badge: "bg-slate-100 text-slate-700 border-slate-200", eventBg: "#f1f5f9", eventBorder: "#64748b", eventText: "#334155" }
};

export function getColorTagStyle(colorTag) {
  return COLOR_TAG_STYLES[colorTag] || COLOR_TAG_STYLES.blue;
}
