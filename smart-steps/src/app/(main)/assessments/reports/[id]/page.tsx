"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";
import { escapeHtml } from "@/lib/sanitizeHtml";

type Section = { id: string; title: string; order: number; content: string };
type Report  = {
  id: string; title: string; status: string; createdAt: string; updatedAt: string;
  client:   { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  sections: Section[];
};

const STATUS_OPTIONS = ["DRAFT", "IN_PROGRESS", "COMPLETED", "FINAL"];
const STATUS_STYLES: Record<string, string> = {
  DRAFT:       "border border-zinc-600 bg-transparent text-zinc-400",
  IN_PROGRESS: "bg-amber-500/15 border border-amber-500/30 text-amber-400",
  COMPLETED:   "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400",
  FINAL:       "bg-zinc-100 text-zinc-900 border border-zinc-200",
};

// ── Print / Save as PDF ───────────────────────────────────────────────────────

const LETTERHEAD_TOP_SRC = "/smart-steps/letterhead/smart-steps-top.png?v=pdf-sharp-20260630";
const LETTERHEAD_WATERMARK_SRC = "/smart-steps/letterhead/smart-steps-watermark.png?v=transparent-soft-20260630";
const LETTERHEAD_BOTTOM_SRC = "/smart-steps/letterhead/smart-steps-bottom.png?v=pdf-sharp-20260630";
const LETTERHEAD_COVER_LOGO_SRC = "/smart-steps/letterhead/smart-steps-logo-cover.png?v=cover-match-20260701";

type ReportFactMap = Record<string, string>;

function parseHtmlFragment(html: string) {
  return new DOMParser().parseFromString(`<main>${html || ""}</main>`, "text/html");
}

function normalizeDisplayText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/┬á|Â /g, " ")
    .replace(/â€¢|ÔÇó|ΓÇó|┬╖|�/g, "•")
    .replace(/â€“|ÔÇô/g, "-")
    .replace(/ΓÇô|â€”|ÔÇö|ΓÇö/g, "-")
    .replace(/â€™|ÔÇÖ|ΓÇÖ/g, "'")
    .replace(/â€œ|â€\u009d|ÔÇ£|ÔÇØ|ΓÇ£|ΓÇ¥/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInlineText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/┬á|Â /g, " ")
    .replace(/â€¢|ÔÇó|ΓÇó|┬╖|�/g, "•")
    .replace(/â€“|ÔÇô/g, "-")
    .replace(/ΓÇô|â€”|ÔÇö|ΓÇö/g, "-")
    .replace(/â€™|ÔÇÖ|ΓÇÖ/g, "'")
    .replace(/â€œ|â€\u009d|ÔÇ£|ÔÇØ|ΓÇ£|ΓÇ¥/g, '"')
    .replace(/\s+/g, " ");
}

function stripNumberPrefix(title: string) {
  return title
    .replace(/^\s*\d+\.\s*/, "")
    .replace(/\s*-\s*Summary$/i, " Summary")
    .trim();
}

function extractFacts(html: string): ReportFactMap {
  const doc = parseHtmlFragment(html);
  const facts: ReportFactMap = {};
  doc.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.children);
    if (cells.length < 2) return;
    const key = normalizeDisplayText(cells[0].textContent ?? "").replace(/:$/, "");
    const value = normalizeDisplayText(cells.slice(1).map((cell) => cell.textContent ?? "").join(" "));
    if (key) facts[key] = value;
  });
  return facts;
}

function getFact(facts: ReportFactMap, key: string, fallback = "—") {
  return facts[key] || fallback;
}

function htmlToPlainText(html: string) {
  const doc = parseHtmlFragment(html);
  return normalizeDisplayText(doc.body.textContent ?? "");
}

function normalizeSectionHtml(html: string) {
  const doc = parseHtmlFragment(html || "<p><em>(empty)</em></p>");
  const root = doc.querySelector("main");
  if (!root) return "<p><em>(empty)</em></p>";

  root.querySelectorAll("span").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    span.remove();
  });

  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("id");
  });

  root.querySelectorAll("h2, h3, h4").forEach((heading) => {
    const text = normalizeDisplayText(heading.textContent ?? "");
    const isBodyText = text.length > 90 || /^[o•·\-]\s*/i.test(text);
    if (!isBodyText) return;
    const p = doc.createElement("p");
    p.innerHTML = heading.innerHTML;
    heading.replaceWith(p);
  });

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((node) => {
    node.nodeValue = normalizeInlineText(node.nodeValue ?? "");
  });

  root.querySelectorAll("p, h2, h3, h4, li, td, th").forEach((el) => {
    if (normalizeDisplayText(el.textContent ?? "") === "" && !el.querySelector("br")) el.remove();
  });

  return root.innerHTML.trim() || "<p><em>(empty)</em></p>";
}

function statusClass(value: string) {
  const text = value.toLowerCase();
  if (text.includes("master")) return "status-mastered";
  if (text.includes("maintenance")) return "status-maintenance";
  if (text.includes("generalization")) return "status-generalization";
  if (text.includes("new")) return "status-new";
  if (text.includes("treatment") || text.includes("baseline") || text.includes("acquisition")) return "status-treatment";
  return "status-neutral";
}

function progressValue(value: string) {
  const match = value.match(/(\d{1,3})\s*%/);
  if (!match) return null;
  const pct = Math.max(0, Math.min(100, Number(match[1])));
  return Number.isFinite(pct) ? pct : null;
}

function reportSubtitleFor(title: string) {
  const t = title.toLowerCase();
  if (t.includes("biopsychosocial")) return "Clinical History";
  if (t.includes("why aba") || t.includes("medical")) return "Medical Necessity";
  if (t.includes("goal")) return "Treatment Targets";
  if (t.includes("provider")) return "Care Coordination";
  if (t.includes("team")) return "Clinical Training";
  if (t.includes("parent")) return "Caregiver Collaboration";
  if (t.includes("crisis") || t.includes("emergency")) return "Safety Plan";
  if (t.includes("transition")) return "Transition Planning";
  if (t.includes("discharge")) return "Discharge Planning";
  if (t.includes("recommend")) return "Clinical Plan";
  if (t.includes("schedule")) return "Service Schedule";
  if (t.includes("summary") || t.includes("contact")) return "Report Close";
  return "Clinical Section";
}

async function printReport(report: Report, sections: Section[]) {
  const win = window.open("", "_blank");
  if (!win) { toast.error("Pop-up blocked — allow pop-ups and try again."); return; }

  const orderedSections = [...sections].sort((a, b) => a.order - b.order);
  const providerSection = orderedSections.find((section) => /service\s+period|provider\s+information/i.test(section.title)) ?? orderedSections[0];
  const contentSections = orderedSections.filter((section) => section.id !== providerSection?.id);
  const facts = extractFacts(providerSection?.content ?? "");

  const clientName = report.client?.name ?? getFact(facts, "Client Name", "");
  const title      = report.title;
  const updated    = new Date(report.updatedAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const assessmentDate = getFact(facts, "Assessment Date", updated);
  const statusText = report.status.replace("_", " ");
  const diagnosis = getFact(facts, "Diagnosis", "[Diagnosis]");
  const servicePeriod = `${getFact(facts, "Service Period Start", "[Service Period Start]")} - ${getFact(facts, "Service Period End", "[Service Period End]")}`;
  const clinicalSections = contentSections.filter((section) =>
    !/current\s+goals|treatment\s+recommendations|daily\s+schedule|summary\s*\/\s*contact/i.test(section.title),
  );

  const clinicalSummaryText = clinicalSections
    .map((section) => htmlToPlainText(section.content))
    .filter(Boolean)
    .join(" ")
    .slice(0, 520);

  const domainMetrics = [
    { label: "Language & Communication", key: "language", color: "teal" },
    { label: "Social Skills", key: "social", color: "gold" },
    { label: "Behavior", key: "behavior", color: "danger" },
    { label: "Adaptive Skills", key: "adaptive", color: "navy" },
    { label: "Executive Functioning", key: "executive", color: "green" },
  ].map((domain) => {
    const source = contentSections.find((section) => section.title.toLowerCase().includes(domain.key));
    const text = htmlToPlainText(source?.content ?? "");
    const count = Number(text.match(/(\d+)\s+upcoming objectives?/i)?.[1] ?? text.match(/(\d+)\s+active targets?/i)?.[1] ?? 0);
    return { ...domain, count, sourceTitle: source?.title ?? domain.label };
  }).filter((metric) => metric.count > 0);
  const maxDomainCount = Math.max(1, ...domainMetrics.map((metric) => metric.count));

  const visualDashboardHtml = domainMetrics.length ? `
    <div class="visual-dashboard">
      <section class="metric-card">
        <h3>Assessment Summary</h3>
        ${domainMetrics.map((metric) => {
          const width = Math.max(12, Math.round((metric.count / maxDomainCount) * 100));
          return `<div class="metric-row ${metric.color}">
            <span>${escapeHtml(metric.label)}</span>
            <div class="metric-track"><i style="width:${width}%"></i></div>
            <strong>${metric.count} targets</strong>
          </div>`;
        }).join("")}
      </section>
      <section class="metric-card strengths">
        <h3>Clinical Focus Areas</h3>
        ${domainMetrics.slice(0, 4).map((metric) => `
          <p><span class="check-dot">✓</span>${escapeHtml(metric.sourceTitle)}</p>
        `).join("")}
      </section>
    </div>` : "";

  const infoCard = (label: string, value: string, tone = "") =>
    `<div class="info-card ${tone}">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value || "—")}</span>
    </div>`;

  const snapshotCards = `
    <div class="snapshot-grid">
      <article class="snapshot-card">
        <div class="icon-circle">ID</div>
        <h3>Client Information</h3>
        ${infoCard("Client Name", clientName)}
        ${infoCard("Date of Birth", getFact(facts, "Date of Birth"))}
        ${infoCard("Diagnosis", diagnosis)}
        ${infoCard("Insurance ID", getFact(facts, "Insurance ID"))}
        ${infoCard("Address", getFact(facts, "Address"))}
        ${infoCard("School / Program", getFact(facts, "School / Program"))}
      </article>
      <article class="snapshot-card">
        <div class="icon-circle navy">BC</div>
        <h3>Provider Information</h3>
        ${infoCard("BCBA Name", getFact(facts, "BCBA Name"))}
        ${infoCard("Credentials", getFact(facts, "BCBA Credentials"))}
        ${infoCard("Email", getFact(facts, "BCBA Email"))}
        ${infoCard("Phone", getFact(facts, "BCBA Phone"))}
      </article>
      <article class="snapshot-card">
        <div class="icon-circle gold">SP</div>
        <h3>Service Information</h3>
        ${infoCard("Assessment Date", assessmentDate)}
        ${infoCard("Service Period", servicePeriod)}
        ${infoCard("Status", statusText, "gold")}
        ${infoCard("Last Updated", updated)}
      </article>
    </div>`;

  const sectionHtml = contentSections
    .map((section, index) => `
      <section class="report-section" data-section-id="${escapeHtml(section.id)}" data-source-order="${section.order}">
        <div class="section-heading">
          <span class="section-number">${index + 2}</span>
          <div>
            <h2>${escapeHtml(stripNumberPrefix(section.title))}</h2>
            <p>${escapeHtml(reportSubtitleFor(section.title))}</p>
          </div>
        </div>
        <div class="section-rule"></div>
        <div class="section-content">${normalizeSectionHtml(section.content)}</div>
      </section>`)
    .join("");

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: letter; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0b2f5b;
      --navy-deep: #08264a;
      --teal: #15948d;
      --teal-soft: #edf8f6;
      --gold: #c6a23b;
      --gold-soft: #fff6d9;
      --paper: #ffffff;
      --soft: #f8fafb;
      --line: #dfe7ed;
      --line-strong: #cdd8e0;
      --text: #162238;
      --muted: #5b6978;
      --danger: #c94c3f;
      --green: #5f9864;
    }
    html { background: #fff; }
    body {
      font-family: "Aptos", "Segoe UI", Arial, sans-serif;
      font-size: 9.4pt;
      line-height: 1.42;
      color: var(--text);
      background: #fff;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0;
      position: relative;
      overflow-x: hidden;
    }
    .print-watermark {
      position: fixed;
      top: 3.05in;
      left: 50%;
      width: 6.2in;
      max-width: 72%;
      height: auto;
      transform: translateX(-50%);
      opacity: 0.035;
      z-index: 0;
      pointer-events: none;
      user-select: none;
    }
    .front-page {
      position: relative;
      min-height: 11in;
      padding: 0.42in 0.46in 1.55in;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .cover-watermark {
      position: absolute;
      top: 0.35in;
      right: 0.55in;
      width: 3.3in;
      height: auto;
      opacity: 0.055;
      pointer-events: none;
      user-select: none;
    }
    .cover-bottom-art {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 8.5in;
      height: auto;
      z-index: 0;
      opacity: 0;
      pointer-events: none;
      user-select: none;
    }
    .cover-logo-frame {
      width: 2.08in;
      height: 1.28in;
      overflow: hidden;
      margin: 0 0 0.16in;
      position: relative;
    }
    .cover-logo {
      position: absolute;
      top: 0;
      left: 0;
      width: 2.08in;
      height: auto;
      max-width: none;
    }
    .following-pages { position: relative; z-index: 1; padding: 0; }
    .pagination-source {
      display: none;
    }
    .content-page {
      position: relative;
      z-index: 1;
      width: 8.5in;
      min-height: 11in;
      height: 11in;
      padding: 0.34in 0.48in 0.36in;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .content-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .page-header {
      display: grid;
      grid-template-columns: 2.35in 1fr;
      gap: 12pt;
      align-items: center;
      height: 0.42in;
      border-bottom: 1.2px solid var(--line-strong);
      color: var(--muted);
      font-size: 7pt;
    }
    .page-brand {
      display: flex;
      align-items: center;
      gap: 7pt;
      color: var(--navy-deep);
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .page-brand img { width: 44px; height: auto; }
    .page-meta {
      display: flex;
      justify-content: flex-end;
      gap: 8pt;
      min-width: 0;
      white-space: nowrap;
      color: var(--navy-deep);
      font-size: 7.3pt;
      font-weight: 900;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .page-meta span:not(:last-child) { display: none; }
    .page-meta span { overflow: hidden; text-overflow: ellipsis; }
    .current-page-title { display: none; }
    .page-number-label {
      justify-self: end;
      color: var(--navy);
      font-weight: 800;
    }
    .content-page-inner {
      height: 9.28in;
      overflow: visible;
      padding-top: 0.24in;
    }
    .page-footer {
      position: absolute;
      right: 0.48in;
      bottom: 0.2in;
      left: 0.48in;
      display: grid;
      grid-template-columns: 1.3in 1fr 0.8in;
      gap: 10pt;
      border-top: 1px solid var(--line);
      padding-top: 7pt;
      color: var(--muted);
      font-size: 6.8pt;
    }
    .print-content { position: relative; z-index: 1; }
    .eyebrow {
      color: var(--teal);
      font-size: 9.2pt;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: none;
      text-align: left;
    }
    .cover-title {
      margin: 0 0 6pt;
      color: var(--navy-deep);
      font-size: 22.5pt;
      line-height: 1.04;
      letter-spacing: -0.015em;
      text-align: left;
      text-transform: uppercase;
    }
    .cover-title-rule {
      width: 1.35in;
      height: 2px;
      margin: 7pt 0 0.32in;
      background: var(--gold);
    }
    .cover-subtitle {
      max-width: 5.4in;
      color: var(--muted);
      font-size: 10pt;
      margin: 0 auto 22pt;
      text-align: center;
    }
    .cover-hero {
      display: grid;
      gap: 9pt;
      max-width: 7.56in;
    }
    .cover-panel,
    .cover-client-card,
    .cover-stat-card,
    .cover-person-card,
    .snapshot-card,
    .clinical-card,
    .info-card,
    .summary-card,
    .recommendation-card {
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.97);
      border-radius: 4pt;
    }
    .cover-panel { padding: 15pt; }
    .cover-client-card {
      display: grid;
      grid-template-columns: 0.44in 1fr;
      gap: 11pt;
      align-items: center;
      padding: 10pt 12pt;
    }
    .cover-person-row,
    .cover-stat-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 9pt;
    }
    .cover-person-row { grid-template-columns: repeat(2, 1fr); }
    .cover-stat-card,
    .cover-person-card {
      display: grid;
      grid-template-columns: 0.28in 1fr;
      gap: 7pt;
      min-height: 0.68in;
      padding: 10pt 11pt;
      align-items: start;
    }
    .cover-person-card { min-height: 0.98in; }
    .client-name {
      color: var(--navy-deep);
      font-size: 12pt;
      line-height: 1.1;
      margin: 0 0 9pt;
    }
    .cover-facts {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8pt;
      margin: 0;
    }
    .info-card {
      padding: 0;
      margin-bottom: 8pt;
      border: none;
      background: transparent;
      border-radius: 0;
    }
    .snapshot-card .info-card,
    .section-content .info-card {
      padding: 7pt 8pt;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 4pt;
    }
    .info-card.teal { background: var(--teal-soft); border-color: #c7e6e2; }
    .info-card.gold { background: var(--gold-soft); border-color: #ecd88e; }
    .label {
      display: block;
      margin-bottom: 3pt;
      color: var(--muted);
      font-size: 5.8pt;
      font-weight: 800;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .value {
      color: var(--navy-deep);
      font-size: 7.2pt;
      font-weight: 750;
    }
    .cover-contact {
      position: absolute;
      right: 4.9in;
      bottom: 0.3in;
      left: 0.42in;
      display: grid;
      grid-template-columns: 1fr;
      gap: 4pt;
      border-radius: 0;
      background: transparent;
      color: #fff;
      padding: 0;
      font-size: 6.8pt;
      z-index: 3;
    }
    .cover-page-number {
      position: absolute;
      right: 0.48in;
      bottom: 0.18in;
      color: #fff;
      font-size: 7.4pt;
      z-index: 2;
    }
    .cover-contact strong {
      display: block;
      color: #ffffff;
      font-size: 5.8pt;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .cover-wave {
      position: absolute;
      left: -0.4in;
      right: -0.15in;
      bottom: -0.55in;
      height: 2.15in;
      z-index: 1;
      background: var(--navy);
      border-top-left-radius: 52% 38%;
      transform: rotate(-1.2deg);
      transform-origin: left bottom;
    }
    .cover-stripe-teal,
    .cover-stripe-gold {
      position: absolute;
      right: -0.1in;
      height: 0.16in;
      z-index: 2;
      border-radius: 999px 0 0 999px;
      transform-origin: right center;
    }
    .cover-stripe-teal {
      bottom: 1.05in;
      left: 2.05in;
      background: var(--teal);
      transform: rotate(-8deg);
    }
    .cover-stripe-gold {
      bottom: 0.82in;
      left: 2.2in;
      background: var(--gold);
      transform: rotate(-8deg);
    }
    .snapshot-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12pt;
    }
    .snapshot-card {
      padding: 12pt;
      min-height: 3.05in;
    }
    .visual-dashboard {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 12pt;
      margin-top: 13pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .metric-card {
      border: 1px solid var(--line);
      border-radius: 4pt;
      background: #fff;
      padding: 12pt;
    }
    .metric-card h3 {
      margin: 0 0 10pt;
      color: var(--navy-deep);
      font-size: 8.2pt;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .metric-row {
      display: grid;
      grid-template-columns: 1.25in 1fr 0.62in;
      gap: 8pt;
      align-items: center;
      margin-bottom: 8pt;
      color: var(--navy-deep);
      font-size: 7pt;
      font-weight: 700;
    }
    .metric-row strong {
      color: var(--muted);
      font-size: 6.5pt;
      text-align: right;
      white-space: nowrap;
    }
    .metric-track {
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: #edf1f4;
    }
    .metric-track i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--teal);
    }
    .metric-row.gold .metric-track i { background: var(--gold); }
    .metric-row.danger .metric-track i { background: var(--danger); }
    .metric-row.navy .metric-track i { background: var(--navy); }
    .metric-row.green .metric-track i { background: var(--green); }
    .metric-card.strengths p {
      display: flex;
      gap: 6pt;
      align-items: flex-start;
      margin: 0 0 8pt;
      color: #344252;
      font-size: 7.2pt;
    }
    .check-dot {
      display: inline-grid;
      width: 14px;
      height: 14px;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 999px;
      background: var(--teal);
      color: #fff;
      font-size: 8px;
      font-weight: 900;
    }
    .snapshot-card h3,
    .clinical-card h3,
    .summary-card h3,
    .recommendation-card h3 {
      color: var(--navy-deep);
      font-size: 8.2pt;
      margin: 0 0 10pt;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .icon-circle {
      display: inline-grid;
      width: 34px;
      height: 34px;
      place-items: center;
      margin: 0 auto 9pt;
      border-radius: 999px;
      background: var(--teal);
      color: #fff;
      font-size: 8pt;
      font-weight: 900;
    }
    .icon-circle.navy { background: var(--navy); }
    .icon-circle.gold { background: var(--gold); }
    .mini-icon {
      display: inline-grid;
      width: 18px;
      height: 18px;
      place-items: center;
      border: 1px solid currentColor;
      border-radius: 3px;
      color: var(--teal);
      font-size: 8px;
      line-height: 1;
    }
    .mini-icon.gold { color: var(--gold); }
    .section-heading {
      display: flex;
      align-items: center;
      gap: 9pt;
      margin-bottom: 8pt;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section-number {
      display: inline-grid;
      width: 22px;
      height: 22px;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 999px;
      background: var(--teal);
      color: #fff;
      font-size: 7.4pt;
      font-weight: 900;
    }
    .section-heading h2 {
      color: var(--navy-deep);
      font-size: 10.8pt;
      line-height: 1.12;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      margin: 0;
    }
    .section-heading p {
      display: none;
      margin: 2pt 0 0;
      color: var(--gold);
      font-size: 7pt;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .section-rule {
      height: 1px;
      margin: 0 0 11pt 31px;
      background: var(--line);
    }
    .report-section {
      margin-bottom: 18pt;
      page-break-inside: auto;
      break-inside: auto;
      orphans: 4;
      widows: 4;
    }
    .continued-label {
      color: var(--muted);
      font-size: 8.5pt;
      font-style: italic;
      font-weight: normal;
    }
    .section-content { font-size: 8.2pt; font-family: inherit; }
    p  { margin-bottom: 8pt; orphans: 3; widows: 3; }
    .section-content > p {
      border: 1px solid var(--line);
      border-radius: 4pt;
      background: #fff;
      padding: 8pt 10pt;
      margin-bottom: 7pt;
    }
    ul, ol { margin: 8pt 0 8pt 18pt; }
    li { margin-bottom: 4pt; }
    h4 { color: var(--navy-deep); font-size: 8.3pt; font-weight: 800; margin: 8pt 0 5pt; page-break-after: avoid; }
    h3 { color: var(--navy-deep); font-size: 8.8pt; font-weight: 850; margin: 10pt 0 6pt; page-break-after: avoid; text-transform: uppercase; letter-spacing: 0.03em; }
    h2 { color: var(--navy-deep); font-size: 9.2pt; page-break-after: avoid; }
    strong { font-weight: bold; }
    em, i { font-style: italic; }
    u  { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 4pt;
      margin: 8pt 0 11pt;
      background: #fff;
      font-size: 7pt;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td {
      border: none;
      border-bottom: 1px solid #e7edf2;
      padding: 6pt 7pt;
      text-align: left;
      vertical-align: top;
    }
    tbody tr:nth-child(even) td { background: #f9fbfc; }
    tr:last-child td { border-bottom: 0; }
    th {
      background: #fff;
      color: var(--navy-deep);
      font-size: 6.2pt;
      font-weight: 850;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-bottom: 1.4px solid var(--line-strong);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2pt 5.5pt;
      font-size: 5.9pt;
      font-weight: 900;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .status-new { background: var(--gold-soft); color: #796129; }
    .status-treatment { background: #dff3ef; color: #08736c; }
    .status-maintenance { background: #eef3f7; color: var(--navy); }
    .status-generalization { background: #eef3f7; color: var(--navy); }
    .status-mastered { background: #e9f6ee; color: #216b3f; }
    .status-neutral { background: #eef3f7; color: var(--muted); }
    .progress-display {
      display: grid;
      gap: 3pt;
      min-width: 0.72in;
      font-weight: 800;
    }
    .progress-track {
      height: 4pt;
      overflow: hidden;
      border-radius: 999px;
      background: #e7edf2;
    }
    .progress-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--teal);
    }
    hr { border: none; border-top: 1px solid var(--line); margin: 12pt 0; }
    .summary-card {
      margin-top: 12pt;
      padding: 10pt 12pt;
      background: var(--teal-soft);
      border-color: #c7e6e2;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .summary-card h3 { margin: 0 0 5pt; color: var(--navy-deep); font-size: 8.6pt; }
    .summary-card p { margin: 0; color: #344252; font-size: 7.4pt; }
    @media print {
      html, body {
        width: 8.5in;
        min-height: 11in;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .front-page {
        height: 11in;
      }
      .report-section { page-break-inside: auto; break-inside: auto; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      h2, h3, h4, .section-heading { page-break-after: avoid; }
      a { color: #000; text-decoration: none; }
    }
    @media screen { .following-pages { padding: 0; } }
  </style>
</head>
<body>
  <img class="print-watermark" src="${LETTERHEAD_WATERMARK_SRC}" alt="">
  <main class="front-page">
    <img class="cover-watermark" src="${LETTERHEAD_WATERMARK_SRC}" alt="">
    <img class="cover-bottom-art" src="${LETTERHEAD_BOTTOM_SRC}" alt="">
    <div class="cover-wave"></div>
    <div class="cover-stripe-teal"></div>
    <div class="cover-stripe-gold"></div>
    <div class="print-content">
      <div class="cover-logo-frame"><img class="cover-logo" src="${LETTERHEAD_COVER_LOGO_SRC}" alt="Smart Steps"></div>
      <h1 class="cover-title">ABA Assessment Report</h1>
      <div class="eyebrow">Comprehensive Treatment Assessment</div>
      <div class="cover-title-rule"></div>
      <div class="cover-hero">
        <section class="cover-client-card">
          <div class="icon-circle">ID</div>
          <div>
            <h2 class="client-name">${escapeHtml(clientName || "—")}</h2>
            <div class="cover-facts">
              ${infoCard("DOB", getFact(facts, "Date of Birth"))}
              ${infoCard("Age", (getFact(facts, "Date of Birth").match(/Age\s+([^)]+)/i)?.[1] ?? "—"))}
              ${infoCard("Diagnosis", diagnosis)}
              ${infoCard("Insurance ID", getFact(facts, "Insurance ID"))}
            </div>
          </div>
        </section>
        <section class="cover-stat-row">
          <div class="cover-stat-card"><div class="mini-icon gold">▣</div>${infoCard("Assessment Date", assessmentDate)}</div>
          <div class="cover-stat-card"><div class="mini-icon gold">▣</div>${infoCard("Service Period", servicePeriod)}</div>
          <div class="cover-stat-card"><div class="mini-icon gold">▣</div>${infoCard("Status", statusText, "gold")}</div>
        </section>
        <section class="cover-person-row">
          <div class="cover-person-card"><div class="icon-circle navy">BC</div><div>
            ${infoCard("Prepared By", getFact(facts, "BCBA Name"))}
            ${infoCard("Credentials", getFact(facts, "BCBA Credentials"))}
            ${infoCard("Email", getFact(facts, "BCBA Email"))}
            ${infoCard("Clinic", "SmartSteps ABA")}
          </div></div>
          <div class="cover-person-card"><div class="icon-circle">PG</div><div>
            ${infoCard("Parent / Guardian", getFact(facts, "Guardian / Parent"))}
            ${infoCard("Phone", getFact(facts, "Guardian Phone", getFact(facts, "BCBA Phone")))}
            ${infoCard("Email", getFact(facts, "Guardian Email", getFact(facts, "BCBA Email")))}
          </div></div>
        </section>
      </div>
      <div class="cover-contact">
        <div><strong>Clinic</strong>SmartSteps ABA Services</div>
        <div><strong>Phone</strong>${escapeHtml(getFact(facts, "BCBA Phone", "845-837-6001"))}</div>
        <div><strong>Email</strong>${escapeHtml(getFact(facts, "BCBA Email"))}</div>
        <div><strong>Address</strong>${escapeHtml(getFact(facts, "Address"))}</div>
      </div>
    </div>
    <div class="page-number-label cover-page-number">Page 1</div>
  </main>
  <main class="following-pages" id="paginated-pages"></main>
  <div class="pagination-source" id="pagination-source">
    <section class="report-section client-snapshot-section" data-source-order="${providerSection?.order ?? 0}">
      <div class="section-heading">
        <span class="section-number">1</span>
        <div>
          <h2>Client & Service Snapshot</h2>
          <p>Client Information</p>
        </div>
      </div>
      <div class="section-rule"></div>
      ${snapshotCards}
      ${visualDashboardHtml}
      <div class="summary-card">
        <h3>Clinical Summary</h3>
        <p>${escapeHtml(clinicalSummaryText || "Client, provider, guardian, insurance, contact, clinic, and service period information are preserved from the generated report.")}</p>
      </div>
    </section>
    ${sectionHtml}
  </div>
</body>
</html>`);

  win.document.close();
  function paginatePrintDocument(doc: Document) {
    const source = doc.getElementById("pagination-source");
    const target = doc.getElementById("paginated-pages");
    if (!source || !target) return;
    const pageTarget = target;

    const pageInnerHeightTolerance = 2;
    let pageInner: HTMLElement | null = null;

    function pageTitleFor(page: HTMLElement) {
      const heading = page.querySelector(".section-heading h2");
      return heading?.textContent?.trim() || "${title}";
    }

    function createPage() {
      const page = doc.createElement("section");
      page.className = "content-page";
      page.setAttribute("aria-label", "Assessment content page");
      const header = doc.createElement("header");
      header.className = "page-header";
      header.innerHTML = `
        <div class="page-brand"><img src="${LETTERHEAD_TOP_SRC}" alt=""></div>
        <div class="page-meta">
          <span>${escapeHtml(title)}</span>
          <span>${escapeHtml(clientName || "—")}</span>
          <span>${escapeHtml(assessmentDate)}</span>
          <span>ABA Assessment Report</span>
        </div>
        <span class="current-page-title" aria-hidden="true"></span>`;
      const inner = doc.createElement("div");
      inner.className = "content-page-inner";
      const footer = doc.createElement("footer");
      footer.className = "page-footer";
      footer.innerHTML = `
        <div>Confidential</div>
        <div>SmartSteps ABA</div>
        <div class="page-number-label"></div>`;
      page.append(header, inner, footer);
      pageTarget.appendChild(page);
      pageInner = inner;
      return inner;
    }

    function createSectionShell(titleHtml: string, continued: boolean) {
      const shell = doc.createElement("section");
      shell.className = "report-section";
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = titleHtml;
      if (continued) {
        const title = wrapper.querySelector("h2");
        if (title) title.innerHTML += ` <span class="continued-label">(continued)</span>`;
      }
      const contentEl = doc.createElement("div");
      contentEl.className = "section-content";
      shell.append(...Array.from(wrapper.childNodes), contentEl);
      return { shell, contentEl };
    }

    function pageOverflows() {
      return !!pageInner && pageInner.scrollHeight > pageInner.clientHeight + pageInnerHeightTolerance;
    }

    function appendSectionToPages(section: Element) {
      const heading = section.querySelector(".section-heading");
      const rule = section.querySelector(".section-rule");
      const content = section.querySelector(".section-content");
      const titleHtml = `${heading?.outerHTML || ""}${rule?.outerHTML || ""}`;
      const blocks = content ? Array.from(content.childNodes) : [];
      let continued = false;
      let current = createSectionShell(titleHtml, continued);

      if (!pageInner) createPage();
      pageInner?.appendChild(current.shell);

      if (pageOverflows()) {
        current.shell.remove();
        createPage();
        pageInner?.appendChild(current.shell);
      }

      for (const block of blocks) {
        current.contentEl.appendChild(block);
        if (!pageOverflows()) continue;

        current.contentEl.removeChild(block);
        if (!current.contentEl.childNodes.length) {
          current.contentEl.appendChild(block);
          continue;
        }

        continued = true;
        createPage();
        current = createSectionShell(titleHtml, continued);
        pageInner?.appendChild(current.shell);
        current.contentEl.appendChild(block);
      }
    }

    function enhanceReportMarkup() {
      doc.querySelectorAll("td, th").forEach((cell) => {
        const text = (cell.textContent || "").trim();
        if (/^(new|in treatment|baseline|acquisition|maintenance|generalization|mastered)$/i.test(text)) {
          cell.innerHTML = `<span class="status-badge ${statusClass(text)}">${text}</span>`;
          return;
        }
        const pct = progressValue(text);
        if (pct !== null) {
          cell.innerHTML = `<span class="progress-display"><span>${text}</span><span class="progress-track"><span style="width:${pct}%"></span></span></span>`;
        }
      });
    }

    function finalizePageNumbers() {
      const pages = Array.from(doc.querySelectorAll<HTMLElement>(".content-page"));
      const total = pages.length + 1;
      const coverNumber = doc.querySelector<HTMLElement>(".cover-page-number");
      if (coverNumber) coverNumber.textContent = `Page 1 of ${total}`;
      pages.forEach((page, index) => {
        const pageNumber = index + 2;
        page.querySelectorAll<HTMLElement>(".page-number-label").forEach((el) => {
          el.textContent = `Page ${pageNumber} of ${total}`;
        });
        const titleEl = page.querySelector<HTMLElement>(".current-page-title");
        if (titleEl) titleEl.textContent = pageTitleFor(page);
      });
    }

    enhanceReportMarkup();
    createPage();
    Array.from(source.querySelectorAll(".report-section")).forEach(appendSectionToPages);
    if (pageTarget.lastElementChild?.querySelector(".content-page-inner")?.childNodes.length === 0) {
      pageTarget.lastElementChild.remove();
    }
    finalizePageNumbers();
    source.remove();
  }
  const images = Array.from(win.document.images);
  Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  })).then(() => {
    paginatePrintDocument(win.document);
    win.focus();
    setTimeout(() => { win.print(); }, 100);
  });
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientReportEditorPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [report,   setReport]   = useState<Report | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [titleVal,  setTitleVal]  = useState("");
  const [status,    setStatus]    = useState("DRAFT");
  const [showAddSection, setShowAddSection] = useState(false);
  const [newTitle,  setNewTitle]  = useState("");
  const dragIdx  = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/smart-steps/api/client-reports/${id}`);
      if (!res.ok) throw new Error();
      const data: Report = await res.json();
      setReport(data);
      setTitleVal(data.title);
      setStatus(data.status);
      setSections(data.sections);
    } catch {
      toast.error("Could not load report.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // Auto-save 3 s debounce
  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 3000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, titleVal, status, dirty]);

  async function save() {
    if (saving || !report) return;
    setSaving(true);
    try {
      await fetch(`/smart-steps/api/client-reports/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleVal, status }),
      });
      const res = await fetch(`/smart-steps/api/client-reports/${id}/sections`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: sections.map((s, i) => ({ title: s.title, content: s.content || "", order: i })) }),
      });
      if (!res.ok) throw new Error();
      const refreshed: Report = await res.json();
      setReport((p) => p ? { ...p, title: titleVal, status } : p);
      setSections(refreshed.sections);
      setDirty(false);
    } catch {
      toast.error("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(sectionId: string, field: "title" | "content", value: string) {
    setSections((p) => p.map((s) => s.id === sectionId ? { ...s, [field]: value } : s));
    setDirty(true);
  }

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`/smart-steps/api/client-reports/${id}/sections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: "" }),
      });
      const sec: Section = await res.json();
      setSections((p) => [...p, sec]);
      setNewTitle(""); setShowAddSection(false);
    } catch { toast.error("Could not add section."); }
  }

  async function deleteSection(sectionId: string) {
    if (!confirm("Remove this section?")) return;
    try {
      await fetch(`/smart-steps/api/client-reports/${id}/sections/${sectionId}`, { method: "DELETE" });
      setSections((p) => p.filter((s) => s.id !== sectionId));
    } catch { toast.error("Could not delete."); }
  }

  function onDragStart(e: React.DragEvent, idx: number) { dragIdx.current = idx; e.dataTransfer.effectAllowed = "move"; }
  function onDragOver(e: React.DragEvent, idx: number)  { e.preventDefault(); dragOver.current = idx; }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = dragIdx.current; const to = dragOver.current;
    if (from === null || to === null || from === to) return;
    setSections((p) => { const n = [...p]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
    setDirty(true); dragIdx.current = null; dragOver.current = null;
  }

  if (loading) return (
    <div className="p-8 space-y-4 max-w-3xl mx-auto">
      {[1, 2, 3].map((i) => <div key={i} className="h-44 glass-card animate-pulse rounded-2xl" />)}
    </div>
  );

  if (!report) return (
    <div className="flex h-full items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-zinc-500">Report not found.</p>
      <button type="button" className="btn-secondary rounded-xl px-4 py-2 text-sm" onClick={() => router.push("/assessments")}>Back</button>
    </div>
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 px-6 py-4 border-b border-[var(--glass-border)]">
        <button type="button" onClick={() => router.push("/assessments")}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-sm text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Assessments
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-zinc-500">
            {report.client?.name}
            {report.template && <> · <span className="text-zinc-600">{report.template.name}</span></>}
            {dirty  && <span className="ml-2 text-amber-400 font-medium">· Unsaved</span>}
            {saving && <span className="ml-2 text-zinc-500">· Saving…</span>}
          </p>
        </div>

        <select
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold cursor-pointer ${STATUS_STYLES[status] || STATUS_STYLES.DRAFT}`}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>

        <button
          type="button"
          onClick={() => printReport(report, sections)}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-sm text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/10 transition-colors"
          title="Print / Save as PDF"
        >
          <Printer className="h-4 w-4" /> Print
        </button>

        <button type="button" onClick={save} disabled={saving || !dirty}
          className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm disabled:opacity-40">
          {saving
            ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Document */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 md:px-6">
          {/* Document header card */}
          <div className="glass-card mb-6 rounded-2xl p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              {editTitle ? (
                <input
                  autoFocus
                  className="field-input flex-1 text-xl font-bold"
                  value={titleVal}
                  onChange={(e) => { setTitleVal(e.target.value); setDirty(true); }}
                  onBlur={() => setEditTitle(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditTitle(false); }}
                />
              ) : (
                <button type="button" className="group flex items-start gap-2 text-left flex-1" onClick={() => setEditTitle(true)}>
                  <h1 className="text-xl font-bold text-[var(--foreground)] leading-tight">{titleVal}</h1>
                  <Pencil className="mt-1 h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.DRAFT}`}>
                {status.replace("_", " ")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-zinc-500 sm:grid-cols-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Client</span>
                <span className="font-medium text-zinc-300">{report.client?.name ?? "—"}</span>
              </div>
              {report.template && (
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Template</span>
                  <span className="font-medium text-zinc-300">{report.template.name}</span>
                </div>
              )}
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Updated</span>
                <span className="font-medium text-zinc-300">
                  {new Date(report.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Sections</span>
                <span className="font-medium text-zinc-300">{sections.length}</span>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {sections.map((sec, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={onDrop}
                onDragEnd={() => { dragIdx.current = null; dragOver.current = null; }}
                className="glass-card group rounded-2xl border border-[var(--glass-border)] overflow-hidden transition-all hover:border-[var(--glass-border)]/80"
              >
                {/* Section header */}
                <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-4 py-3">
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-700 active:cursor-grabbing" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--foreground)] focus:outline-none placeholder:text-zinc-600"
                    value={sec.title}
                    onChange={(e) => updateSection(sec.id, "title", e.target.value)}
                    placeholder="Section title"
                  />
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-zinc-600">§{idx + 1}</span>
                    <button type="button" onClick={() => deleteSection(sec.id)}
                      className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Rich text content — key uses idx (not sec.id) so editors don't remount
                    when the PUT route rebuilds sections with new IDs on each save */}
                <div className="px-4 pb-4 pt-3">
                  <RichTextEditor
                    key={idx}
                    value={sec.content || ""}
                    onChange={(v) => updateSection(sec.id, "content", v)}
                    placeholder={`Write clinical notes for "${sec.title}"…`}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add section */}
          <div className="mt-4">
            <AnimatePresence>
              {showAddSection ? (
                <motion.form
                  key="form"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  onSubmit={addSection}
                  className="glass-card rounded-2xl p-4 border border-[var(--accent-cyan)]/20"
                >
                  <p className="mb-2 text-xs font-semibold text-[var(--accent-cyan)]">New Section</p>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      className="field-input flex-1 text-sm"
                      placeholder="Section title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                    <button type="submit" className="btn-primary rounded-xl px-4 py-2 text-sm" disabled={!newTitle.trim()}>Add</button>
                    <button type="button" className="btn-secondary rounded-xl px-4 py-2 text-sm"
                      onClick={() => { setShowAddSection(false); setNewTitle(""); }}>Cancel</button>
                  </div>
                </motion.form>
              ) : (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  type="button"
                  onClick={() => setShowAddSection(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 py-3 text-sm font-medium text-zinc-600 hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/5 transition-all"
                >
                  <Plus className="h-4 w-4" /> Add Section
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {sections.length > 0 && (
            <p className="mt-6 text-center text-xs text-zinc-600">
              Drag sections to reorder · Click title to rename · Auto-saves every 3 seconds · <button type="button" className="underline hover:text-zinc-400" onClick={() => printReport(report, sections)}>Print / Save as PDF</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
