import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { replacePlaceholders, sanitizeHtml, formatDate } from "@/lib/sanitizeHtml";

export async function POST(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { templateId } = await params;

  const { clientId, title } = await req.json();
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const [template, client] = await Promise.all([
    prisma.reportTemplate.findUnique({
      where: { id: templateId },
      include: { sections: { orderBy: { order: "asc" } } },
    }),
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, dob: true, address: true },
    }),
  ]);

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!client)   return NextResponse.json({ error: "Client not found" },   { status: 404 });

  // Build placeholder values from available data
  const providerName = session.user.name ?? session.user.email ?? "";
  const values: Record<string, string> = {
    client_name:      client.name,
    dob:              formatDate(client.dob),
    address:          client.address ?? "",
    assessment_date:  formatDate(new Date()),
    provider_name:    providerName,
  };

  const report = await prisma.clientReport.create({
    data: {
      clientId,
      templateId: template.id,
      title: (title?.trim()) || template.name,
      status: "DRAFT",
      sections: {
        create: template.sections.map((s) => ({
          title:   s.title,
          order:   s.order,
          // Copy template content and resolve placeholders; empty sections stay empty
          content: s.content ? sanitizeHtml(replacePlaceholders(s.content, values)) : "",
        })),
      },
    },
    include: {
      sections: { orderBy: { order: "asc" } },
      client:   { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(report, { status: 201 });
}
