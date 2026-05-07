import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

// Default ABA assessment report sections with rich HTML content and {{placeholders}}.
// Used only when creating a new ABA_ASSESSMENT report template.
// Client-specific values are resolved at report-generation time via replacePlaceholders().
const DEFAULT_ABA_SECTIONS: { title: string; content: string }[] = [
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
      "<table><thead><tr><th>Category</th><th>Goal / Operational Definition</th><th>Date Mastered</th></tr></thead>" +
      "<tbody>" +
      "<tr><td>[Category]</td><td>[Goal description and mastery criterion]</td><td>[MM/DD/YYYY]</td></tr>" +
      "<tr><td></td><td></td><td></td></tr>" +
      "<tr><td></td><td></td><td></td></tr>" +
      "</tbody></table>",
  },
  {
    title: "Current Goals and Objectives",
    content:
      "<p>The following goals and objectives are targeted for the current service period:</p>" +
      "<table><thead><tr><th>Behavior</th><th>Objective / Operational Definition</th><th>Start Date</th><th>Baseline Level</th><th>Current Level</th></tr></thead>" +
      "<tbody>" +
      "<tr><td>[Behavior]</td><td>[Objective and mastery criterion]</td><td>[MM/DD/YYYY]</td><td>[Baseline]</td><td>[Current]</td></tr>" +
      "<tr><td></td><td></td><td></td><td></td><td></td></tr>" +
      "<tr><td></td><td></td><td></td><td></td><td></td></tr>" +
      "</tbody></table>",
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
      "<table><thead><tr><th>Service</th><th># Hrs Presently Receiving</th><th>Recommendation</th><th>Rationale</th></tr></thead>" +
      "<tbody>" +
      "<tr><td>Direct ABA \u2014 Behavior Technician (RBT)</td><td></td><td></td><td></td></tr>" +
      "<tr><td>Clinical Supervision \u2014 BCBA</td><td></td><td></td><td></td></tr>" +
      "<tr><td>Parent / Caregiver Training</td><td></td><td></td><td></td></tr>" +
      "<tr><td>Team Consultation</td><td></td><td></td><td></td></tr>" +
      "</tbody></table>",
  },
  {
    title: "Daily Schedule",
    content:
      "<p>The following schedule outlines planned ABA service hours for {{client_name}} during the authorization period:</p>" +
      "<table><thead><tr><th>Sunday</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th></tr></thead>" +
      "<tbody>" +
      "<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>" +
      "<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>" +
      "</tbody></table>",
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

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.reportTemplate.findMany({
    where: { isActive: true },
    include: {
      sections: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true } },
      _count: { select: { reports: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, type = "ABA_ASSESSMENT", description } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Use rich default sections for ABA_ASSESSMENT templates; empty for others
  const sectionData: { title: string; content: string }[] =
    Array.isArray(body.sections) && body.sections.length > 0
      ? body.sections.map((s: unknown) => ({
          title:   typeof s === "string" ? s : (s as { title: string }).title,
          content: typeof s === "string" ? "" : sanitizeHtml((s as { content?: string }).content ?? ""),
        })).filter((s: { title: string }) => s.title)
      : type === "ABA_ASSESSMENT"
        ? DEFAULT_ABA_SECTIONS
        : [];

  const template = await prisma.reportTemplate.create({
    data: {
      name: name.trim(),
      type,
      description: description || null,
      sections: {
        create: sectionData.map((s, i) => ({ title: s.title, order: i, content: s.content })),
      },
    },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(template, { status: 201 });
}
