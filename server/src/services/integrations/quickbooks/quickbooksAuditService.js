import { prisma } from "../../../config/prisma.js";

/**
 * Aggregated read-model for /api/admin/qb-audit (and similar tooling).
 */
export async function getQuickbooksAuditOverview({ sinceHours = 24 } = {}) {
  const since = new Date(Date.now() - sinceHours * 3600 * 1000);
  const rows = await prisma.quickBooksApiCallLog.findMany({
    where: { createdAt: { gte: since } },
    select: {
      endpoint: true,
      method: true,
      feature: true,
      success: true,
      retryCount: true,
      createdAt: true,
      tenantId: true,
      durationMs: true,
      metadata: true
    }
  });

  const byEndpoint = new Map();
  const byFeature = new Map();
  const byMinute = new Map();
  let retries = 0;
  let failures = 0;
  const topOffenders = new Map();

  for (const r of rows) {
    retries += r.retryCount || 0;
    if (!r.success) failures += 1;

    const ep = `${r.method} ${r.endpoint}`;
    byEndpoint.set(ep, (byEndpoint.get(ep) || 0) + 1);
    byFeature.set(r.feature, (byFeature.get(r.feature) || 0) + 1);

    const mKey = new Date(Math.floor(r.createdAt.getTime() / 60000) * 60000).toISOString();
    byMinute.set(mKey, (byMinute.get(mKey) || 0) + 1);

    const offKey = `${r.tenantId}|${r.feature}`;
    topOffenders.set(offKey, (topOffenders.get(offKey) || 0) + 1);
  }

  const offendersSorted = [...topOffenders.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([key, count]) => {
      const [tenantId, feature] = key.split("|");
      return { tenantId, feature, count };
    });

  return {
    since: since.toISOString(),
    until: new Date().toISOString(),
    totalCalls: rows.length,
    errorRate: rows.length ? failures / rows.length : 0,
    totalRetries: retries,
    callsPerMinuteSeries: [...byMinute.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    callsPerEndpoint: Object.fromEntries([...byEndpoint.entries()].sort((a, b) => b[1] - a[1])),
    callsPerFeature: Object.fromEntries([...byFeature.entries()].sort((a, b) => b[1] - a[1])),
    topOffenders: offendersSorted,
    duplicateOrCacheHints: {
      cacheHits: rows.filter((r) => r.metadata?.cacheHit || r.metadata?.blockedReason === "duplicate_short").length,
      inflightMerged: rows.filter((r) => r.metadata?.mergedInflight).length,
      rateBlocked: rows.filter((r) => String(r.metadata?.blockedReason || "").includes("rate_limit")).length,
      safeModeBlocked: rows.filter((r) => r.metadata?.blockedReason === "safe_mode").length
    }
  };
}
