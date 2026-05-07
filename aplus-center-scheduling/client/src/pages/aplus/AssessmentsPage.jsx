import { useEffect, useMemo, useState } from "react";
import RichTextSectionEditor from "../../components/assessmentTemplates/RichTextSectionEditor";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { sanitizeRichTextHtml } from "../../lib/richTextSanitizer";

const EMPTY_TEMPLATE_FORM = {
  name: "",
  description: ""
};

const PLACEHOLDERS = [
  { token: "{{client_name}}", label: "Client name" },
  { token: "{{dob}}", label: "Date of birth" },
  { token: "{{address}}", label: "Address" },
  { token: "{{provider_name}}", label: "Provider name" },
  { token: "{{assessment_date}}", label: "Assessment date" },
  { token: "{{goals}}", label: "Goals" },
  { token: "{{recommendations}}", label: "Recommendations" }
];

function escapeForPrint(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sectionCountLabel(count) {
  return `${count} section${count === 1 ? "" : "s"}`;
}

function createLocalSection(order) {
  return {
    id: `local-${Date.now()}-${order}`,
    title: "New Section",
    order,
    content: ""
  };
}

export default function AssessmentsPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
  const [form, setForm] = useState(EMPTY_TEMPLATE_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [clients, setClients] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDirty, setReportDirty] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateForm, setGenerateForm] = useState({ clientId: "", title: "" });
  const [isGenerating, setIsGenerating] = useState(false);

  const orderedSections = useMemo(
    () => [...(selectedTemplate?.sections || [])].sort((a, b) => a.order - b.order),
    [selectedTemplate]
  );

  const orderedReportSections = useMemo(
    () => [...(selectedReport?.sections || [])].sort((a, b) => a.order - b.order),
    [selectedReport]
  );

  const loadTemplates = async (selectId) => {
    setIsLoadingList(true);
    const res = await api.get("/assessment-templates");
    const nextTemplates = Array.isArray(res.data) ? res.data : [];
    setTemplates(nextTemplates);
    setIsLoadingList(false);

    const nextId = selectId === null ? null : selectId || selectedTemplate?.id || nextTemplates[0]?.id;
    if (!nextId) {
      setSelectedTemplate(null);
      setDirty(false);
      return;
    }
    if (nextId) await loadTemplate(nextId);
  };

  useEffect(() => {
    loadTemplates().catch(() => {
      setIsLoadingList(false);
      toast?.error("Failed to load assessment templates.");
    });
    loadClients().catch(() => toast?.error("Failed to load clients."));
    loadReports().catch(() => toast?.error("Failed to load generated reports."));
  }, []);

  const loadTemplate = async (templateId) => {
    setIsLoadingTemplate(true);
    try {
      const res = await api.get(`/assessment-templates/${templateId}`);
      const template = res.data;
      setSelectedTemplate({
        ...template,
        sections: (template.sections || []).map((section, index) => ({
          ...section,
          order: typeof section.order === "number" ? section.order : index,
          content: sanitizeRichTextHtml(section.content || "")
        }))
      });
      setCollapsedSections(new Set());
      setDirty(false);
      setSelectedReport(null);
      setReportDirty(false);
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  const loadClients = async () => {
    const res = await api.get("/clients?fields=minimal");
    setClients(Array.isArray(res.data) ? res.data : []);
  };

  const loadReports = async () => {
    const res = await api.get("/assessment-reports");
    setReports(Array.isArray(res.data) ? res.data : []);
  };

  const loadReport = async (reportId) => {
    setIsLoadingReport(true);
    try {
      const res = await api.get(`/assessment-reports/${reportId}`);
      const report = res.data;
      setSelectedReport({
        ...report,
        sections: (report.sections || []).map((section, index) => ({
          ...section,
          order: typeof section.order === "number" ? section.order : index,
          content: sanitizeRichTextHtml(section.content || "")
        }))
      });
      setReportDirty(false);
      setSelectedTemplate(null);
      setDirty(false);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const createTemplate = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast?.error("Template name is required.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await api.post("/assessment-templates", {
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: "ASSESSMENT"
      });
      setForm(EMPTY_TEMPLATE_FORM);
      await loadTemplates(res.data.id);
      toast?.success("Template created.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not create template.");
    } finally {
      setIsCreating(false);
    }
  };

  const updateTemplateField = (field, value) => {
    setSelectedTemplate((prev) => prev ? { ...prev, [field]: value } : prev);
    setDirty(true);
  };

  const updateSection = (sectionId, field, value) => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) =>
          section.id === sectionId ? { ...section, [field]: value } : section
        )
      };
    });
    setDirty(true);
  };

  const addSection = () => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: [...prev.sections, createLocalSection(prev.sections.length)]
      };
    });
    setDirty(true);
  };

  const deleteSection = (sectionId) => {
    if (!window.confirm("Delete this section from the template?")) return;
    setSelectedTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections
          .filter((section) => section.id !== sectionId)
          .map((section, index) => ({ ...section, order: index }))
      };
    });
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
    setDirty(true);
  };

  const moveSection = (sectionId, direction) => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections].sort((a, b) => a.order - b.order);
      const index = sections.findIndex((section) => section.id === sectionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return prev;
      const [moved] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, moved);
      return {
        ...prev,
        sections: sections.map((section, order) => ({ ...section, order }))
      };
    });
    setDirty(true);
  };

  const toggleSection = (sectionId) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const saveTemplate = async () => {
    if (!selectedTemplate || isSaving) return;
    if (!selectedTemplate.name.trim()) {
      toast?.error("Template name is required.");
      return;
    }
    if (!orderedSections.length) {
      toast?.error("Add at least one section before saving.");
      return;
    }

    setIsSaving(true);
    try {
      await api.put(`/assessment-templates/${selectedTemplate.id}`, {
        name: selectedTemplate.name.trim(),
        description: selectedTemplate.description?.trim() || null,
        type: selectedTemplate.type || "ASSESSMENT"
      });
      const res = await api.put(`/assessment-templates/${selectedTemplate.id}/sections`, {
        sections: orderedSections.map((section, index) => ({
          title: section.title.trim() || `Section ${index + 1}`,
          order: index,
          content: sanitizeRichTextHtml(section.content || "")
        }))
      });
      setSelectedTemplate({
        ...res.data,
        sections: (res.data.sections || []).map((section, index) => ({
          ...section,
          order: index,
          content: sanitizeRichTextHtml(section.content || "")
        }))
      });
      await loadTemplates(res.data.id);
      setDirty(false);
      toast?.success("Template saved.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save template.");
    } finally {
      setIsSaving(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!selectedTemplate) return;
    const name = window.prompt("Name for the duplicate template:", `${selectedTemplate.name} Copy`);
    if (name === null) return;
    if (!name.trim()) {
      toast?.error("Duplicate template name is required.");
      return;
    }
    try {
      const res = await api.post(`/assessment-templates/${selectedTemplate.id}/duplicate`, { name: name.trim() });
      await loadTemplates(res.data.id);
      toast?.success("Template duplicated.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not duplicate template.");
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplate) return;
    if (!window.confirm(`Delete "${selectedTemplate.name}"? Existing client reports keep their data.`)) return;
    try {
      const deletedId = selectedTemplate.id;
      await api.delete(`/assessment-templates/${deletedId}`);
      const remaining = templates.filter((template) => template.id !== deletedId);
      setSelectedTemplate(null);
      await loadTemplates(remaining[0]?.id ?? null);
      toast?.success("Template deleted.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not delete template.");
    }
  };

  const openGenerate = () => {
    if (!selectedTemplate) {
      toast?.error("Select a template first.");
      return;
    }
    setGenerateForm({ clientId: "", title: `${selectedTemplate.name} Report` });
    setShowGenerate(true);
  };

  const generateReport = async (event) => {
    event.preventDefault();
    if (!selectedTemplate || !generateForm.clientId) {
      toast?.error("Select a template and client.");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await api.post(`/assessment-templates/${selectedTemplate.id}/generate-report`, {
        clientId: generateForm.clientId,
        title: generateForm.title.trim() || undefined
      });
      setShowGenerate(false);
      setGenerateForm({ clientId: "", title: "" });
      await loadReports();
      setSelectedTemplate(null);
      setDirty(false);
      await loadReport(res.data.id);
      toast?.success("Report generated.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not generate report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateReportField = (field, value) => {
    setSelectedReport((prev) => prev ? { ...prev, [field]: value } : prev);
    setReportDirty(true);
  };

  const updateReportSection = (sectionId, field, value) => {
    setSelectedReport((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) =>
          section.id === sectionId ? { ...section, [field]: value } : section
        )
      };
    });
    setReportDirty(true);
  };

  const moveReportSection = (sectionId, direction) => {
    setSelectedReport((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections].sort((a, b) => a.order - b.order);
      const index = sections.findIndex((section) => section.id === sectionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return prev;
      const [moved] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, moved);
      return {
        ...prev,
        sections: sections.map((section, order) => ({ ...section, order }))
      };
    });
    setReportDirty(true);
  };

  const deleteReportSection = (sectionId) => {
    if (!window.confirm("Delete this section from the generated report?")) return;
    setSelectedReport((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections
          .filter((section) => section.id !== sectionId)
          .map((section, index) => ({ ...section, order: index }))
      };
    });
    setReportDirty(true);
  };

  const printReport = () => {
    if (!selectedReport) return;

    const reportTitle = selectedReport.title || "Assessment Report";
    const clientName = selectedReport.client?.fullName || "";
    const templateSource = selectedReport.template?.name || "";
    const createdDate = selectedReport.createdAt
      ? new Date(selectedReport.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "";

    const sectionsHtml = orderedReportSections
      .map(
        (section) => `
        <section class="report-section">
          <h2 class="section-title">${section.title ? escapeForPrint(section.title) : ""}</h2>
          <div class="section-content">${section.content || ""}</div>
        </section>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeForPrint(reportTitle)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
      padding: 0;
      margin: 0;
    }

    .page {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 1in 1in 1in 1in;
    }

    /* ── Report header ── */
    .report-header {
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 14pt;
      margin-bottom: 22pt;
    }

    .report-org {
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 6pt;
    }

    .report-title {
      font-size: 18pt;
      font-weight: bold;
      color: #1a1a1a;
      line-height: 1.2;
      margin-bottom: 12pt;
    }

    .report-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0 32pt;
      font-size: 10pt;
      color: #333;
    }

    .report-meta-item {
      display: flex;
      flex-direction: column;
      margin-bottom: 4pt;
    }

    .report-meta-label {
      font-size: 8pt;
      font-weight: bold;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #777;
      margin-bottom: 1pt;
    }

    .report-meta-value {
      font-size: 10pt;
      color: #1a1a1a;
    }

    /* ── Sections ── */
    .report-section {
      margin-bottom: 22pt;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 13pt;
      font-weight: bold;
      color: #1a1a1a;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4pt;
      margin-bottom: 10pt;
    }

    .section-content {
      font-size: 11pt;
      line-height: 1.65;
    }

    /* ── Rich text elements ── */
    .section-content h2 { font-size: 12pt; font-weight: bold; margin: 10pt 0 4pt; }
    .section-content h3 { font-size: 11pt; font-weight: bold; margin: 8pt 0 3pt; }
    .section-content h4 { font-size: 10pt; font-weight: bold; margin: 6pt 0 2pt; }
    .section-content p  { margin: 0 0 6pt; }
    .section-content ul, .section-content ol { margin: 0 0 6pt 18pt; }
    .section-content li { margin-bottom: 2pt; }
    .section-content b, .section-content strong { font-weight: bold; }
    .section-content em { font-style: italic; }
    .section-content u  { text-decoration: underline; }
    .section-content a  { color: #1a1a1a; text-decoration: underline; }

    /* ── Tables ── */
    .section-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 8pt 0 10pt;
      font-size: 10pt;
      page-break-inside: avoid;
    }

    .section-content th,
    .section-content td {
      border: 1px solid #999;
      padding: 5pt 7pt;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }

    .section-content th {
      background-color: #f0f0f0;
      font-weight: bold;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #333;
    }

    /* ── Print media ── */
    @media print {
      body { padding: 0; }
      .page { padding: 0.75in; }
      .report-section { page-break-inside: avoid; }
      .section-content table { page-break-inside: avoid; }
      a { color: #1a1a1a !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="report-header">
      <p class="report-org">A+ Center — Assessment Report</p>
      <h1 class="report-title">${escapeForPrint(reportTitle)}</h1>
      <div class="report-meta">
        ${clientName ? `<div class="report-meta-item"><span class="report-meta-label">Client</span><span class="report-meta-value">${escapeForPrint(clientName)}</span></div>` : ""}
        ${createdDate ? `<div class="report-meta-item"><span class="report-meta-label">Date Generated</span><span class="report-meta-value">${createdDate}</span></div>` : ""}
        ${templateSource ? `<div class="report-meta-item"><span class="report-meta-label">Template</span><span class="report-meta-value">${escapeForPrint(templateSource)}</span></div>` : ""}
      </div>
    </header>

    <main>${sectionsHtml}</main>
  </div>
  <script>window.onload = function () { window.print(); };<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast?.error("Pop-up blocked. Allow pop-ups for this site and try again.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const saveReport = async () => {
    if (!selectedReport || isSavingReport) return;
    if (!selectedReport.title.trim()) {
      toast?.error("Report title is required.");
      return;
    }
    if (!orderedReportSections.length) {
      toast?.error("Generated report must have at least one section.");
      return;
    }
    setIsSavingReport(true);
    try {
      await api.put(`/assessment-reports/${selectedReport.id}`, {
        title: selectedReport.title.trim(),
        status: selectedReport.status || "DRAFT"
      });
      const res = await api.put(`/assessment-reports/${selectedReport.id}/sections`, {
        sections: orderedReportSections.map((section, index) => ({
          title: section.title.trim() || `Section ${index + 1}`,
          order: index,
          content: sanitizeRichTextHtml(section.content || "")
        }))
      });
      setSelectedReport({
        ...res.data,
        sections: (res.data.sections || []).map((section, index) => ({
          ...section,
          order: index,
          content: sanitizeRichTextHtml(section.content || "")
        }))
      });
      await loadReports();
      setReportDirty(false);
      toast?.success("Report saved.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save report.");
    } finally {
      setIsSavingReport(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">ABA Assessment Templates</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Template Library</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Build reusable section-based clinical templates with default wording. Client-specific reports and exports are outside this Phase 1 rollout.
          </p>
        </div>

        {selectedTemplate && !selectedReport && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={openGenerate}>
              Generate Report
            </button>
            <button type="button" className="btn-secondary" onClick={duplicateTemplate}>
              Duplicate
            </button>
            <button type="button" className="btn-secondary text-red-700 hover:border-red-200 hover:bg-red-50" onClick={deleteTemplate}>
              Delete
            </button>
            <button type="button" className="btn-primary" disabled={!dirty || isSaving} onClick={saveTemplate}>
              {isSaving ? "Saving..." : dirty ? "Save template" : "Saved"}
            </button>
          </div>
        )}
        {selectedReport && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSelectedReport(null)}>
              Back to Templates
            </button>
            <button type="button" className="btn-secondary" onClick={printReport} title="Open a print-safe view. Use your browser's Save as PDF to export.">
              Print / Export PDF
            </button>
            <button type="button" className="btn-primary" disabled={!reportDirty || isSavingReport} onClick={saveReport}>
              {isSavingReport ? "Saving..." : reportDirty ? "Save report" : "Saved"}
            </button>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-4">
          <form className="card space-y-3" onSubmit={createTemplate}>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Create Template</h2>
              <p className="mt-1 text-sm text-slate-500">New templates start with reusable ABA assessment sections.</p>
            </div>
            <input
              className="saas-input"
              placeholder="Template name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <textarea
              className="saas-textarea min-h-[80px]"
              placeholder="Description or intended use"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <button type="submit" className="btn-primary w-full" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create template"}
            </button>
          </form>

          <section className="card flex min-h-0 flex-1 flex-col p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Templates</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isLoadingList ? "Loading..." : sectionCountLabel(templates.length).replace("section", "template")}
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => loadTemplate(template.id).catch(() => toast?.error("Failed to load template."))}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedTemplate?.id === template.id
                      ? "border-blue-200 bg-blue-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-blue-100 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-semibold text-slate-950">{template.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{template.description || "No description"}</p>
                  <p className="mt-3 text-xs font-medium text-slate-400">{sectionCountLabel(template.sections?.length || 0)}</p>
                </button>
              ))}
              {!templates.length && !isLoadingList && (
                <div className="empty-state">No templates yet. Create one to start the Phase 1 library.</div>
              )}
            </div>
          </section>

          <section className="card flex min-h-0 flex-1 flex-col p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Generated Reports</h2>
              <p className="mt-1 text-sm text-slate-500">
                {reports.length} report{reports.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => loadReport(report.id).catch(() => toast?.error("Failed to load report."))}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedReport?.id === report.id
                      ? "border-emerald-200 bg-emerald-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-emerald-100 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-semibold text-slate-950">{report.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{report.client?.fullName || "No client"}</p>
                  <p className="mt-3 text-xs font-medium text-slate-400">
                    {report.template?.name || "Template deleted"} · {sectionCountLabel(report.sections?.length || 0)}
                  </p>
                </button>
              ))}
              {!reports.length && (
                <div className="empty-state">No generated reports yet.</div>
              )}
            </div>
          </section>
        </aside>

        <section className="card flex min-h-0 flex-col overflow-hidden p-0">
          {!selectedTemplate && !selectedReport && (
            <div className="flex h-full items-center justify-center p-8">
              <div className="empty-state max-w-lg">
                Create or select a template, or open a generated report.
              </div>
            </div>
          )}

          {selectedReport && (
            <>
              <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Generated Report Title</label>
                    <input
                      className="saas-input text-base font-semibold"
                      value={selectedReport.title || ""}
                      onChange={(event) => updateReportField("title", event.target.value)}
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report State</p>
                    <p className={`mt-1 text-sm font-semibold ${reportDirty ? "text-amber-700" : "text-emerald-700"}`}>
                      {isSavingReport ? "Saving..." : reportDirty ? "Unsaved changes" : "Saved"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{sectionCountLabel(orderedReportSections.length)}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{selectedReport.client?.fullName || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template Snapshot Source</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{selectedReport.template?.name || "Template deleted"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <select
                      className="saas-input mt-1"
                      value={selectedReport.status || "DRAFT"}
                      onChange={(event) => updateReportField("status", event.target.value)}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70 px-4 py-5 sm:px-6">
                {isLoadingReport ? (
                  <div className="space-y-3">
                    <div className="skeleton h-24" />
                    <div className="skeleton h-48" />
                    <div className="skeleton h-48" />
                  </div>
                ) : (
                  <div className="mx-auto max-w-5xl space-y-4">
                    {orderedReportSections.map((section, index) => (
                      <article key={section.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            Report Section {index + 1}
                          </span>
                          <input
                            className="min-w-[240px] flex-1 rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-emerald-200 focus:bg-emerald-50/40"
                            value={section.title || ""}
                            onChange={(event) => updateReportSection(section.id, "title", event.target.value)}
                            placeholder="Section title"
                          />
                          <div className="flex items-center gap-2">
                            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={index === 0} onClick={() => moveReportSection(section.id, -1)}>
                              Up
                            </button>
                            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={index === orderedReportSections.length - 1} onClick={() => moveReportSection(section.id, 1)}>
                              Down
                            </button>
                            <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-red-700 hover:border-red-200 hover:bg-red-50" onClick={() => deleteReportSection(section.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="space-y-3 p-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Editable Generated Content</p>
                            <p className="mt-1 text-xs text-slate-500">
                              This is an independent report snapshot. Edits here do not change the source template.
                            </p>
                          </div>
                          <RichTextSectionEditor
                            value={section.content || ""}
                            onChange={(html) => updateReportSection(section.id, "content", html)}
                            placeholder="Edit generated report wording."
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {selectedTemplate && !selectedReport && (
            <>
              <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Template Name</label>
                    <input
                      className="saas-input text-base font-semibold"
                      value={selectedTemplate.name || ""}
                      onChange={(event) => updateTemplateField("name", event.target.value)}
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Save State</p>
                    <p className={`mt-1 text-sm font-semibold ${dirty ? "text-amber-700" : "text-emerald-700"}`}>
                      {isSaving ? "Saving..." : dirty ? "Unsaved changes" : "Saved"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{sectionCountLabel(orderedSections.length)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
                  <textarea
                    className="saas-textarea mt-2 min-h-[72px]"
                    value={selectedTemplate.description || ""}
                    onChange={(event) => updateTemplateField("description", event.target.value)}
                    placeholder="Describe when this template should be used."
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70 px-4 py-5 sm:px-6">
                {isLoadingTemplate ? (
                  <div className="space-y-3">
                    <div className="skeleton h-24" />
                    <div className="skeleton h-48" />
                    <div className="skeleton h-48" />
                  </div>
                ) : (
                  <div className="mx-auto max-w-5xl space-y-4">
                    {orderedSections.map((section, index) => {
                      const collapsed = collapsedSections.has(section.id);
                      return (
                        <article key={section.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                              onClick={() => toggleSection(section.id)}
                            >
                              {collapsed ? "Expand" : "Collapse"}
                            </button>
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                              Section {index + 1}
                            </span>
                            <input
                              className="min-w-[240px] flex-1 rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-200 focus:bg-blue-50/40"
                              value={section.title || ""}
                              onChange={(event) => updateSection(section.id, "title", event.target.value)}
                              placeholder="Section title"
                            />
                            <div className="flex items-center gap-2">
                              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={index === 0} onClick={() => moveSection(section.id, -1)}>
                                Up
                              </button>
                              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={index === orderedSections.length - 1} onClick={() => moveSection(section.id, 1)}>
                                Down
                              </button>
                              <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-red-700 hover:border-red-200 hover:bg-red-50" onClick={() => deleteSection(section.id)}>
                                Delete
                              </button>
                            </div>
                          </div>

                          {!collapsed && (
                            <div className="space-y-3 p-4">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Default Clinical Wording</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  This reusable HTML is saved on the template section and can later be copied into client-specific reports.
                                </p>
                              </div>
                              <RichTextSectionEditor
                                value={section.content || ""}
                                onChange={(html) => updateSection(section.id, "content", html)}
                                placeholder="Add default wording, headings, lists, or tables. You can paste formatted content from Word."
                              />
                            </div>
                          )}
                        </article>
                      );
                    })}

                    <button type="button" className="flex w-full items-center justify-center rounded-3xl border border-dashed border-blue-200 bg-white px-4 py-5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50" onClick={addSection}>
                      Add Section
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {showGenerate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Generate Report</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedTemplate?.name}</h2>
              <p className="mt-2 text-sm text-slate-600">
                Creates an editable client-linked report snapshot. The source template stays unchanged.
              </p>
            </div>

            <form className="space-y-4" onSubmit={generateReport}>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Client</label>
                <select
                  className="saas-input"
                  value={generateForm.clientId}
                  onChange={(event) => setGenerateForm((prev) => ({ ...prev, clientId: event.target.value }))}
                  required
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.fullName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Report Title</label>
                <input
                  className="saas-input"
                  value={generateForm.title}
                  onChange={(event) => setGenerateForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Optional report title"
                />
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supported placeholders</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PLACEHOLDERS.map((placeholder) => (
                    <span key={placeholder.token} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700" title={placeholder.label}>
                      {placeholder.token}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Unknown or unavailable placeholders remain visible in the generated report for manual editing.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" disabled={isGenerating} onClick={() => setShowGenerate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isGenerating || !generateForm.clientId}>
                  {isGenerating ? "Generating..." : "Generate report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
