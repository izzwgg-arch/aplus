import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireString } from "../utils/validation.js";
import { decryptText } from "../utils/crypto.js";
import { writeAuditLog } from "../services/auditLogService.js";

const router = express.Router();
router.use(requireAuth);

// Default sections for a new ABA Assessment template.
// Each section includes a title and default rich-text HTML content.
// Client-specific values use {{placeholder}} tokens resolved at report-generation time.
// All HTML is within the server sanitizer allowlist.
const DEFAULT_ABA_SECTIONS = [
  {
    title: "Service Period / Provider Information",
    content:
      "<p><strong>Client:</strong> {{client_name}}</p>" +
      "<p><strong>Date of Birth:</strong> {{dob}}</p>" +
      "<p><strong>Address:</strong> {{address}}</p>" +
      "<p><strong>Assessment Date:</strong> {{assessment_date}}</p>" +
      "<p><strong>Primary Provider / BCBA:</strong> {{provider_name}}</p>" +
      "<p><strong>Service Period:</strong> [Start Date] \u2013 [End Date]</p>" +
      "<p><strong>Authorization Number:</strong> [Authorization Number]</p>" +
      "<p><strong>Funding Source / Insurance:</strong> [Payer Name]</p>",
  },
  {
    title: "Biopsychosocial Information",
    content:
      "<p><strong>Client:</strong> {{client_name}} is a [age]-year-old [individual] diagnosed with [diagnosis] who has been receiving ABA services since [date].</p>" +
      "<p><strong>Presenting Concerns:</strong> [Describe the primary areas of concern and the reason for current ABA services.]</p>" +
      "<h3>Developmental History</h3>" +
      "<p>[Summarize relevant developmental milestones, medical history, and significant events.]</p>" +
      "<h3>Medical / Health Information</h3>" +
      "<p>[List relevant medical conditions, current medications, and health considerations.]</p>" +
      "<h3>Family &amp; Support System</h3>" +
      "<p>[Describe family composition, primary caregivers, and available supports in the home and community.]</p>" +
      "<h3>Educational Setting</h3>" +
      "<p>[Describe current school placement, grade level, and support services received in the educational setting.]</p>",
  },
  {
    title: "Why ABA Services Are Needed",
    content:
      "<p>{{client_name}} continues to require Applied Behavior Analysis (ABA) services based on the following clinical indicators:</p>" +
      "<ul>" +
      "<li>[Describe skill deficit area 1 and clinical rationale for continued services.]</li>" +
      "<li>[Describe skill deficit area 2 and clinical rationale.]</li>" +
      "<li>[Describe behavior reduction need and clinical rationale, if applicable.]</li>" +
      "<li>[Describe generalization and maintenance needs.]</li>" +
      "</ul>" +
      "<p>Without continued ABA services, {{client_name}} would be at risk of regression in acquired skills and would not have the structured supports necessary to make meaningful progress toward greater independence.</p>",
  },
  {
    title: "Language & Communication",
    content:
      "<p><strong>Current Level:</strong> {{client_name}} demonstrates the following communication skills:</p>" +
      "<ul>" +
      "<li><strong>Expressive Language:</strong> [Describe current expressive communication \u2014 verbal output, AAC use, sign language, or other modalities.]</li>" +
      "<li><strong>Receptive Language:</strong> [Describe current receptive communication and instruction-following skills.]</li>" +
      "<li><strong>Pragmatic / Social Communication:</strong> [Describe social language use, turn-taking, topic maintenance, and conversational skills.]</li>" +
      "</ul>" +
      "<p><strong>Standardized Assessment:</strong> [Assessment tool, date administered, and summary of results.]</p>" +
      "<p><strong>Progress Since Last Authorization:</strong> [Summarize measurable changes in communication skills during the prior service period.]</p>" +
      "<p><strong>Clinical Recommendations:</strong> [Describe planned communication interventions for the upcoming service period.]</p>",
  },
  {
    title: "Social / Emotional Skills",
    content:
      "<p><strong>Current Level:</strong> {{client_name}} demonstrates the following social and emotional skills:</p>" +
      "<ul>" +
      "<li><strong>Peer Interaction:</strong> [Describe ability to initiate and sustain peer interactions.]</li>" +
      "<li><strong>Emotional Regulation:</strong> [Describe ability to identify and manage emotional responses.]</li>" +
      "<li><strong>Play Skills:</strong> [Describe type and level of play observed \u2014 solitary, parallel, cooperative.]</li>" +
      "<li><strong>Group Participation:</strong> [Describe ability to follow group norms and participate in group activities.]</li>" +
      "</ul>" +
      "<p><strong>Progress Since Last Authorization:</strong> [Summarize measurable changes in social/emotional functioning.]</p>" +
      "<p><strong>Clinical Recommendations:</strong> [Describe planned social/emotional interventions for the upcoming service period.]</p>",
  },
  {
    title: "Challenging Behavior",
    content:
      "<p><strong>Identified Target Behaviors:</strong> [List challenging behaviors currently targeted for reduction.]</p>" +
      "<p><strong>Functional Assessment Summary:</strong> A functional behavior assessment has been conducted. The following hypothesized function(s) have been identified:</p>" +
      "<ul>" +
      "<li><strong>Behavior:</strong> [Behavior name] \u2014 <strong>Function:</strong> [Escape / Attention / Sensory / Access to tangibles]</li>" +
      "</ul>" +
      "<p><strong>Current Frequency / Severity:</strong> [Describe current behavior rates and clinical impact on participation and safety.]</p>" +
      "<p><strong>Behavior Intervention Plan:</strong> A Behavior Intervention Plan (BIP) is in place. Key strategies include:</p>" +
      "<ul>" +
      "<li>[Antecedent modification strategy]</li>" +
      "<li>[Replacement behavior / alternative skill being taught]</li>" +
      "<li>[Consequence strategy \u2014 reinforcement of appropriate behavior]</li>" +
      "</ul>" +
      "<p><strong>Progress Since Last Authorization:</strong> [Summarize measurable changes in behavior frequency or intensity.]</p>",
  },
  {
    title: "Adaptive Behavior",
    content:
      "<p><strong>Current Level:</strong> {{client_name}} demonstrates the following adaptive behavior skills:</p>" +
      "<ul>" +
      "<li><strong>Self-Care / Daily Living:</strong> [Describe current independence in hygiene, dressing, eating, and toileting.]</li>" +
      "<li><strong>Home Skills:</strong> [Describe participation in household routines and chores.]</li>" +
      "<li><strong>Community Skills:</strong> [Describe behavior and independence in community settings such as stores, appointments, and transportation.]</li>" +
      "<li><strong>Safety Skills:</strong> [Describe awareness and appropriate response to safety-related situations.]</li>" +
      "</ul>" +
      "<p><strong>Standardized Assessment:</strong> [Assessment tool, date administered, and results summary.]</p>" +
      "<p><strong>Progress Since Last Authorization:</strong> [Summarize measurable changes in adaptive behavior.]</p>" +
      "<p><strong>Clinical Recommendations:</strong> [Describe planned adaptive behavior targets for the upcoming service period.]</p>",
  },
  {
    title: "Mastered Goals and Objectives",
    content:
      "<p>The following goals and objectives were mastered during the prior service period:</p>" +
      "<table>" +
      "<thead><tr><th>Category</th><th>Goal / Operational Definition</th><th>Date Mastered</th></tr></thead>" +
      "<tbody>" +
      "<tr><td>[Category]</td><td>[Goal description and mastery criterion]</td><td>[MM/DD/YYYY]</td></tr>" +
      "<tr><td></td><td></td><td></td></tr>" +
      "<tr><td></td><td></td><td></td></tr>" +
      "</tbody>" +
      "</table>",
  },
  {
    title: "Current Goals and Objectives",
    content:
      "<p>The following goals and objectives are targeted for the current service period:</p>" +
      "<table>" +
      "<thead><tr><th>Behavior</th><th>Objective / Operational Definition</th><th>Start Date</th><th>Baseline Level</th><th>Current Level</th></tr></thead>" +
      "<tbody>" +
      "<tr><td>[Behavior]</td><td>[Objective and mastery criterion]</td><td>[MM/DD/YYYY]</td><td>[Baseline]</td><td>[Current]</td></tr>" +
      "<tr><td></td><td></td><td></td><td></td><td></td></tr>" +
      "<tr><td></td><td></td><td></td><td></td><td></td></tr>" +
      "</tbody>" +
      "</table>",
  },
  {
    title: "Coordination With Providers",
    content:
      "<p>{{client_name}}\u2019s ABA treatment team collaborates with the following providers to ensure coordinated, comprehensive care:</p>" +
      "<ul>" +
      "<li><strong>Speech-Language Pathology:</strong> [Provider name / Agency \u2014 frequency of contact and coordination notes]</li>" +
      "<li><strong>Occupational Therapy:</strong> [Provider name / Agency \u2014 frequency of contact and coordination notes]</li>" +
      "<li><strong>School / Special Education:</strong> [School name \u2014 IEP goals and ABA program alignment]</li>" +
      "<li><strong>Pediatrician / Psychiatrist:</strong> [Provider name \u2014 medication management and health coordination]</li>" +
      "</ul>" +
      "<p>Coordination activities include [describe: joint team meetings, shared data reports, written summaries, telephone consultations] occurring [frequency].</p>",
  },
  {
    title: "Team Training",
    content:
      "<p>Team training is provided to ensure consistent implementation of behavior intervention strategies across all settings and caregivers.</p>" +
      "<p><strong>Training Topics for This Service Period:</strong></p>" +
      "<ul>" +
      "<li>[Strategy or skill training topic 1]</li>" +
      "<li>[Strategy or skill training topic 2]</li>" +
      "<li>Data collection procedures, graphing, and interpretation</li>" +
      "<li>Implementation fidelity of behavior intervention plans</li>" +
      "</ul>" +
      "<p><strong>Training Format:</strong> [In-person modeling / role-play / written materials / video review]</p>" +
      "<p><strong>Frequency:</strong> [Describe planned training frequency \u2014 e.g., monthly team meetings, weekly supervisor check-ins.]</p>",
  },
  {
    title: "Parent / Guardian Involvement",
    content:
      "<p>Parent and guardian involvement is a core component of {{client_name}}\u2019s ABA treatment program. Active caregiver participation supports generalization and maintenance of acquired skills across home and community settings.</p>" +
      "<p><strong>Current Level of Involvement:</strong> [Describe current caregiver participation \u2014 attendance at sessions, implementation of strategies at home, and communication with the supervising BCBA.]</p>" +
      "<p><strong>Planned Parent Training Goals:</strong></p>" +
      "<ul>" +
      "<li>[Specific parent training goal 1]</li>" +
      "<li>[Specific parent training goal 2]</li>" +
      "<li>[Generalization and maintenance strategies]</li>" +
      "</ul>" +
      "<p><strong>Communication Plan:</strong> [Describe method and frequency of caregiver communication \u2014 e.g., weekly data summaries, biweekly BCBA calls, session notes via client portal.]</p>",
  },
  {
    title: "Clinical Emergency / Crisis Plan",
    content:
      "<p>A crisis plan is in place to ensure the safety of {{client_name}}, caregivers, and treatment team members in the event of a clinical emergency.</p>" +
      "<p><strong>Emergency Contact:</strong> [Primary caregiver name and phone number]</p>" +
      "<p><strong>Crisis Indicators:</strong></p>" +
      "<ul>" +
      "<li>[Describe behaviors or conditions that constitute a clinical emergency for this client.]</li>" +
      "</ul>" +
      "<p><strong>Crisis Response Protocol:</strong></p>" +
      "<ol>" +
      "<li>Ensure the immediate safety of the client and all individuals in the environment.</li>" +
      "<li>Remove access to any dangerous objects or stimuli.</li>" +
      "<li>Contact the supervising BCBA immediately.</li>" +
      "<li>Contact the primary caregiver or emergency contact person.</li>" +
      "<li>[Additional step specific to this client or setting.]</li>" +
      "<li>Document the incident per agency protocol within 24 hours.</li>" +
      "</ol>" +
      "<p><strong>Emergency Services:</strong> If there is an immediate risk of harm to self or others, call 911.</p>",
  },
  {
    title: "Transition Plan",
    content:
      "<p>A transition plan has been developed to support {{client_name}}\u2019s movement between service settings, programs, or levels of care.</p>" +
      "<p><strong>Current Transition Goal:</strong> [Describe the anticipated transition \u2014 e.g., from clinic-based to school-based services, from intensive to maintenance level, toward discharge from ABA.]</p>" +
      "<p><strong>Timeline:</strong> [Anticipated transition date or criteria-based milestone.]</p>" +
      "<p><strong>Transition Steps:</strong></p>" +
      "<ul>" +
      "<li>[Describe preparatory skills being targeted in advance of the transition.]</li>" +
      "<li>[Describe coordination with the receiving provider or educational team.]</li>" +
      "<li>[Describe caregiver preparation and training for the transition.]</li>" +
      "</ul>" +
      "<p><strong>Supports at Receiving Setting:</strong> [Describe what supports will be available to the client after transition is complete.]</p>",
  },
  {
    title: "Discharge Criteria",
    content:
      "<p>Discharge from ABA services will be considered when {{client_name}} meets the following clinical criteria:</p>" +
      "<ul>" +
      "<li>Consistent demonstration of targeted skills at mastery criterion across multiple settings and caregivers.</li>" +
      "<li>Significant reduction or elimination of target challenging behaviors to a clinically acceptable level.</li>" +
      "<li>Caregiver training is complete and caregivers demonstrate capacity to maintain acquired skills independently.</li>" +
      "<li>[Specific individualized discharge criterion for this client.]</li>" +
      "</ul>" +
      "<p><strong>Current Status Toward Discharge:</strong> {{client_name}} is [not yet approaching / approaching / actively progressing toward] discharge criteria as of {{assessment_date}}.</p>" +
      "<p>Discharge planning will be conducted collaboratively with the family, funding source, and receiving providers as clinically appropriate.</p>",
  },
  {
    title: "Treatment Recommendations / Hours",
    content:
      "<p>Based on the clinical assessment conducted on {{assessment_date}}, the following treatment services and hours are recommended for {{client_name}} for the upcoming authorization period:</p>" +
      "<table>" +
      "<thead><tr><th>Service</th><th># Hrs Presently Receiving</th><th>Recommendation</th><th>Rationale</th></tr></thead>" +
      "<tbody>" +
      "<tr><td>Direct ABA \u2014 Behavior Technician (RBT)</td><td></td><td></td><td></td></tr>" +
      "<tr><td>Clinical Supervision \u2014 BCBA</td><td></td><td></td><td></td></tr>" +
      "<tr><td>Parent / Caregiver Training</td><td></td><td></td><td></td></tr>" +
      "<tr><td>Team Consultation</td><td></td><td></td><td></td></tr>" +
      "</tbody>" +
      "</table>",
  },
  {
    title: "Daily Schedule",
    content:
      "<p>The following schedule outlines planned ABA service hours for {{client_name}} during the authorization period:</p>" +
      "<table>" +
      "<thead><tr><th>Sunday</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th></tr></thead>" +
      "<tbody>" +
      "<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>" +
      "<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>" +
      "</tbody>" +
      "</table>",
  },
  {
    title: "Summary / Contact Information",
    content:
      "<p>This assessment and treatment plan was completed by {{provider_name}} on {{assessment_date}} for {{client_name}} (Date of Birth: {{dob}}).</p>" +
      "<p>The information contained in this report reflects the clinical judgment of the supervising BCBA based on direct observation, caregiver interviews, review of prior records, and standardized assessments completed during the assessment period.</p>" +
      "<p><strong>Supervising BCBA:</strong> {{provider_name}}</p>" +
      "<p><strong>BCBA Certification Number:</strong> [BCBA Cert #]</p>" +
      "<p><strong>Contact Phone:</strong> [Phone Number]</p>" +
      "<p><strong>Contact Email:</strong> [Email Address]</p>" +
      "<p><strong>Clinic / Agency:</strong> A+ Center</p>" +
      "<p>This report is confidential and intended solely for the use of the identified client, their authorized caregivers, and treating providers. Unauthorized disclosure is prohibited.</p>",
  },
];

const MAX_SECTION_CONTENT_LENGTH = 150000;

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h2",
  "h3",
  "h4",
  "li",
  "ol",
  "p",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);

const ALLOWED_HTML_ATTRS = {
  a: new Set(["href", "target", "rel"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"])
};

const DANGEROUS_HTML_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "svg",
  "math"
]);

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeHtmlAttributes(tagName, rawAttrs = "") {
  const allowedAttrs = ALLOWED_HTML_ATTRS[tagName] || new Set();
  const attrs = new Map();
  const attrPattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = attrPattern.exec(rawAttrs)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] ?? match[3] ?? match[4] ?? "";
    if (attrName.startsWith("on") || attrName === "style" || !allowedAttrs.has(attrName)) continue;
    if ((attrName === "href" || attrName === "src") && /^\s*javascript:/i.test(attrValue)) continue;

    if ((attrName === "colspan" || attrName === "rowspan") && !/^\d{1,2}$/.test(attrValue)) continue;
    attrs.set(attrName, attrValue);
  }

  if (tagName === "a") {
    attrs.set("target", "_blank");
    attrs.set("rel", "noreferrer");
  }

  return Array.from(attrs.entries())
    .map(([name, value]) => ` ${name}="${escapeHtmlAttribute(value)}"`)
    .join("");
}

function normalizeEmptyHtml(html) {
  return html
    .replace(/<p><br><\/p>/gi, "")
    .replace(/<div><br><\/div>/gi, "")
    .trim();
}

function sanitizeHtmlContent(value) {
  if (value === undefined || value === null) return "";
  const withoutDangerousBlocks = String(value)
    .slice(0, MAX_SECTION_CONTENT_LENGTH)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");

  const sanitized = withoutDangerousBlocks.replace(
    /<\s*(\/)?\s*([a-zA-Z][\w:-]*)([^>]*)>/g,
    (_match, closingSlash, rawTagName, rawAttrs) => {
      const tagName = rawTagName.toLowerCase();
      if (DANGEROUS_HTML_TAGS.has(tagName)) return "";
      if (!ALLOWED_HTML_TAGS.has(tagName)) return "";
      if (closingSlash) return `</${tagName}>`;
      return `<${tagName}${sanitizeHtmlAttributes(tagName, rawAttrs)}>`;
    }
  );

  return normalizeEmptyHtml(sanitized);
}

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function replacePlaceholders(html, values) {
  return sanitizeHtmlContent(html).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, rawKey) => {
    const value = values[String(rawKey).toLowerCase()];
    if (value === undefined || value === null || value === "") return match;
    return escapeHtmlText(value);
  });
}

async function getRelevantProviderName(clientId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const appointments = await prisma.appointment.findMany({
    where: {
      clientId,
      startsAt: { gte: today },
      status: { notIn: ["CANCELLED", "NO_SHOW"] }
    },
    orderBy: { startsAt: "asc" },
    take: 20,
    include: { provider: { select: { fullName: true } } }
  });

  const providerNames = new Set(
    appointments
      .map((appointment) => appointment.provider?.fullName || appointment.providerNameSnapshot || "")
      .map((name) => name.trim())
      .filter(Boolean)
  );

  return providerNames.size === 1 ? Array.from(providerNames)[0] : "";
}

async function buildPlaceholderValues(clientId) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;

  const providerName = await getRelevantProviderName(clientId);
  const address = decryptText(client.addressEncrypted) || "";
  const assessmentDate = new Date();

  return {
    client,
    values: {
      client_name: client.fullName,
      dob: formatDate(client.dob),
      address,
      assessment_date: formatDate(assessmentDate),
      provider_name: providerName
    }
  };
}

function normalizeIncomingSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section, i) => {
      const title = typeof section === "string" ? section : section?.title;
      const trimmedTitle = typeof title === "string" ? title.trim() : "";
      if (!trimmedTitle) return null;
      return {
        title: trimmedTitle,
        order: typeof section?.order === "number" ? section.order : i,
        content: sanitizeHtmlContent(typeof section === "string" ? "" : section?.content)
      };
    })
    .filter(Boolean);
}

// ── List templates ────────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const templates = await prisma.assessmentTemplate.findMany({
    include: { sections: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true } } },
    orderBy: { createdAt: "desc" },
  });
  return res.json(templates);
});

// ── Get single template with sections ────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: req.params.id },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });
  return res.json(template);
});

// ── Create template ───────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const body = req.body || {};
  const name  = requireString(body.name, "name");
  const type  = body.type || "ASSESSMENT";
  // Decide which sections to seed: caller may pass custom array or use defaults
  const incomingSections = normalizeIncomingSections(body.sections);
  const sections =
    incomingSections.length > 0
      ? incomingSections
      : type === "ASSESSMENT"
        ? DEFAULT_ABA_SECTIONS.map((s, i) => ({ title: s.title, order: i, content: s.content }))
        : [];

  const template = await prisma.assessmentTemplate.create({
    data: {
      name,
      type,
      description: body.description || null,
      sections: {
        create: sections.map((section, i) => ({
          title: section.title,
          order: typeof section.order === "number" ? section.order : i,
          content: sanitizeHtmlContent(section.content),
        })),
      },
    },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  await writeAuditLog(req, { action: "TEMPLATE_CREATED", entityType: "AssessmentTemplate", entityId: template.id });
  return res.status(201).json(template);
});

// ── Update template metadata ──────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const body = req.body || {};
  const template = await prisma.assessmentTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: "Template not found" });
  const updated = await prisma.assessmentTemplate.update({
    where: { id: req.params.id },
    data: {
      name:        body.name        !== undefined ? String(body.name)        : undefined,
      description: body.description !== undefined ? String(body.description || "") : undefined,
      type:        body.type        !== undefined ? String(body.type)        : undefined,
    },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  return res.json(updated);
});

// ── Delete template ───────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const template = await prisma.assessmentTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: "Template not found" });
  await prisma.assessmentTemplate.delete({ where: { id: req.params.id } });
  await writeAuditLog(req, { action: "TEMPLATE_DELETED", entityType: "AssessmentTemplate", entityId: req.params.id });
  return res.status(204).send();
});

// ── Duplicate template ────────────────────────────────────────────────────────
router.post("/:id/duplicate", async (req, res) => {
  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: req.params.id },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });

  const name = req.body?.name ? requireString(req.body.name, "name") : `${template.name} Copy`;
  const duplicate = await prisma.assessmentTemplate.create({
    data: {
      name,
      type: template.type,
      description: template.description,
      sections: {
        create: template.sections.map((section, i) => ({
          title: section.title,
          order: i,
          content: sanitizeHtmlContent(section.content),
        })),
      },
    },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  await writeAuditLog(req, { action: "TEMPLATE_DUPLICATED", entityType: "AssessmentTemplate", entityId: duplicate.id });
  return res.status(201).json(duplicate);
});

// ── Generate an editable client-linked report from template ───────────────────
router.post("/:id/generate-report", async (req, res) => {
  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: req.params.id },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });

  const clientId = requireString(req.body?.clientId, "clientId");
  const placeholderContext = await buildPlaceholderValues(clientId);
  if (!placeholderContext) return res.status(404).json({ error: "Client not found" });

  const title = req.body?.title
    ? requireString(req.body.title, "title")
    : `${template.name} - ${placeholderContext.client.fullName}`;

  const report = await prisma.assessmentReport.create({
    data: {
      templateId: template.id,
      clientId,
      title,
      status: "DRAFT",
      sections: {
        create: template.sections.map((section, i) => ({
          title: section.title,
          order: typeof section.order === "number" ? section.order : i,
          content: replacePlaceholders(section.content || "", placeholderContext.values),
        })),
      },
    },
    include: {
      client: { select: { id: true, fullName: true } },
      template: { select: { id: true, name: true } },
      sections: { orderBy: { order: "asc" } },
    },
  });

  await writeAuditLog(req, { action: "REPORT_CREATED", entityType: "AssessmentReport", entityId: report.id });
  return res.status(201).json(report);
});

// ── Replace / reorder all sections at once ───────────────────────────────────
router.put("/:id/sections", async (req, res) => {
  const template = await prisma.assessmentTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: "Template not found" });
  const sections = normalizeIncomingSections(req.body.sections);
  if (!sections.length) return res.status(400).json({ error: "sections array required" });
  await prisma.assessmentTemplateSection.deleteMany({ where: { templateId: req.params.id } });
  await prisma.assessmentTemplateSection.createMany({
    data: sections.map((s, i) => ({
      templateId: req.params.id,
      title:   s.title,
      order:   typeof s.order === "number" ? s.order : i,
      content: sanitizeHtmlContent(s.content),
    })),
  });
  const refreshed = await prisma.assessmentTemplate.findUnique({
    where: { id: req.params.id },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  return res.json(refreshed);
});

// ── Add a section ─────────────────────────────────────────────────────────────
router.post("/:id/sections", async (req, res) => {
  const template = await prisma.assessmentTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: "Template not found" });
  const maxOrder = await prisma.assessmentTemplateSection.aggregate({
    where: { templateId: req.params.id },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;
  const section = await prisma.assessmentTemplateSection.create({
    data: {
      templateId: req.params.id,
      title:   requireString(req.body.title, "title"),
      order:   nextOrder,
      content: sanitizeHtmlContent(req.body.content),
    },
  });
  return res.status(201).json(section);
});

// ── Update a section ──────────────────────────────────────────────────────────
router.put("/:id/sections/:sectionId", async (req, res) => {
  const section = await prisma.assessmentTemplateSection.findFirst({
    where: { id: req.params.sectionId, templateId: req.params.id },
  });
  if (!section) return res.status(404).json({ error: "Section not found" });
  const updated = await prisma.assessmentTemplateSection.update({
    where: { id: req.params.sectionId },
    data: {
      title:   req.body.title   !== undefined ? String(req.body.title)   : undefined,
      content: req.body.content !== undefined ? sanitizeHtmlContent(req.body.content) : undefined,
      order:   req.body.order   !== undefined ? Number(req.body.order)   : undefined,
    },
  });
  return res.json(updated);
});

// ── Delete a section ──────────────────────────────────────────────────────────
router.delete("/:id/sections/:sectionId", async (req, res) => {
  const section = await prisma.assessmentTemplateSection.findFirst({
    where: { id: req.params.sectionId, templateId: req.params.id },
  });
  if (!section) return res.status(404).json({ error: "Section not found" });
  await prisma.assessmentTemplateSection.delete({ where: { id: req.params.sectionId } });
  return res.status(204).send();
});

export default router;
