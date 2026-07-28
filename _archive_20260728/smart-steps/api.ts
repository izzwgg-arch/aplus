// Base path for all API calls — required because the app is served under /smart-steps
// Raw fetch() in the browser does NOT auto-prefix the basePath from next.config.ts
export const BASE = "/smart-steps";

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}
