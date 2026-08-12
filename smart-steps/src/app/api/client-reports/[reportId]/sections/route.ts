import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

export async function PUT(req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const { sections } = await req.json();
  if (!Array.isArray(sections) || sections.length === 0)
    return NextResponse.json({ error: "sections array required" }, { status: 400 });

  await prisma.clientReportSection.deleteMany({ where: { reportId } });
  await prisma.clientReportSection.createMany({
    data: sections.map((s: { title: string; content?: string; order?: number }, i: number) => ({
      reportId,
      title:   String(s.title),
      order:   typeof s.order === "number" ? s.order : i,
      content: sanitizeHtml(s.content ?? ""),
    })),
  });
  const refreshed = await prisma.clientReport.findUnique({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" } },
      client:   { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(refreshed);
}

export async function POST(req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const { title, content = "" } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const agg = await prisma.clientReportSection.aggregate({
    where: { reportId },
    _max: { order: true },
  });
  const section = await prisma.clientReportSection.create({
    data: { reportId, title: title.trim(), order: (agg._max.order ?? -1) + 1, content: sanitizeHtml(content) },
  });
  return NextResponse.json(section, { status: 201 });
}
