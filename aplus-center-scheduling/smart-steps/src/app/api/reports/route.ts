import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse, requireClientAccessResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditExport } from "@/lib/auditLogger";

// Lightweight CSV report generation (no heavy PDF dependency needed server-side)
function generateCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col] ?? "";
        const str = String(val).replace(/"/g, '""');
        return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermissionResponse(user.id, "smartsteps.reports.export");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "json") as "csv" | "json";
  const type = searchParams.get("type") ?? "progress";
  const clientId = searchParams.get("clientId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (clientId) {
    const clientDenied = await requireClientAccessResponse(user.id, clientId, "smartsteps.reports.view");
    if (clientDenied) return clientDenied;
  }

  const startDate = start ? new Date(start) : new Date(Date.now() - 30 * 86400000);
  const endDate = end ? new Date(end) : new Date();

  try {
    if (type === "trials" || type === "progress") {
      const trialData = clientId
        ? await prisma.trial.findMany({
            where: {
              session: {
                clientId,
                startedAt: { gte: startDate, lte: endDate },
              },
            },
            include: {
              target: { select: { definition: true, phase: true } },
              session: { select: { startedAt: true, client: { select: { name: true } } } },
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          })
        : [];

      const rows = trialData.map((t) => ({
        date: t.session.startedAt.toISOString().slice(0, 10),
        client: t.session.client.name,
        target: t.target.definition,
        phase: t.target.phase,
        result: t.result,
        promptLevel: t.promptLevel ?? "",
        latencyMs: t.latencyMs ?? "",
      }));

      await auditExport(user.id, format, clientId);

      if (format === "csv") {
        const csv = rows.length > 0
          ? generateCsv(rows as Record<string, unknown>[], ["date", "client", "target", "phase", "result", "promptLevel", "latencyMs"])
          : "date,client,target,phase,result,promptLevel,latencyMs\nNo data in range,,,,,,";
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="smart-steps-${type}-${startDate.toISOString().slice(0, 10)}.csv"`,
          },
        });
      }

      // Summary stats for JSON response
      const total = rows.length;
      const correct = rows.filter((r) => r.result === "CORRECT").length;
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      return NextResponse.json({ type, clientId, start: startDate, end: endDate, total, correct, pct, rows });
    }

    if (type === "behaviors") {
      const behaviors = clientId
        ? await prisma.behaviorEvent.findMany({
            where: { session: { clientId, startedAt: { gte: startDate, lte: endDate } } },
            include: { session: { select: { startedAt: true, client: { select: { name: true } } } } },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : [];

      const rows = behaviors.map((b) => ({
        date: b.session.startedAt.toISOString().slice(0, 10),
        client: b.session.client.name,
        type: b.type,
        behavior: b.behavior ?? "",
        antecedent: b.antecedent ?? "",
        consequence: b.consequence ?? "",
        intensity: b.intensity ?? "",
        value: b.value ?? "",
      }));

      await auditExport(user.id, format, clientId);

      if (format === "csv") {
        const csv = rows.length > 0
          ? generateCsv(rows as Record<string, unknown>[], ["date", "client", "type", "behavior", "antecedent", "consequence", "intensity", "value"])
          : "date,client,type,behavior,antecedent,consequence,intensity,value\nNo data,,,,,,, ";
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="smart-steps-behaviors-${startDate.toISOString().slice(0, 10)}.csv"`,
          },
        });
      }

      return NextResponse.json({ type, clientId, start: startDate, end: endDate, count: rows.length, rows });
    }

    if (type === "assessments") {
      const assessmentData = clientId
        ? await prisma.clientAssessment.findMany({
            where: {
              clientId,
              startedAt: { gte: startDate, lte: endDate },
            },
            include: {
              template: { select: { name: true, category: true } },
              completedBy: { select: { name: true, email: true } },
              client: { select: { name: true } },
            },
            orderBy: { startedAt: "desc" },
            take: 200,
          })
        : await prisma.clientAssessment.findMany({
            where: { startedAt: { gte: startDate, lte: endDate } },
            include: {
              template: { select: { name: true, category: true } },
              completedBy: { select: { name: true, email: true } },
              client: { select: { name: true } },
            },
            orderBy: { startedAt: "desc" },
            take: 200,
          });

      const rows = assessmentData.map((a) => ({
        date: a.startedAt.toISOString().slice(0, 10),
        client: a.client.name,
        assessment: a.template.name,
        category: a.template.category ?? "",
        status: a.status,
        completedDate: a.completedAt?.toISOString().slice(0, 10) ?? "",
        totalScore: a.totalScore ?? "",
        completedBy: a.completedBy?.name ?? a.completedBy?.email ?? "",
        notes: a.notes ?? "",
      }));

      await auditExport(user.id, format, clientId);

      if (format === "csv") {
        const csv = rows.length > 0
          ? generateCsv(rows as Record<string, unknown>[], ["date", "client", "assessment", "category", "status", "completedDate", "totalScore", "completedBy", "notes"])
          : "date,client,assessment,category,status,completedDate,totalScore,completedBy,notes\nNo data,,,,,,,,";
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="smart-steps-assessments-${startDate.toISOString().slice(0, 10)}.csv"`,
          },
        });
      }

      return NextResponse.json({ type, clientId, start: startDate, end: endDate, count: rows.length, rows });
    }

    // Default: summary JSON
    await auditExport(user.id, format, clientId);
    return NextResponse.json({
      message: "Report generated",
      format,
      type,
      clientId,
      start: startDate,
      end: endDate,
      note: "Use format=csv for downloadable files",
    });
  } catch {
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
