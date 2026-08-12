import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "April 15, 2025";
const SUPPORT_EMAIL  = "support@apluscenter.com";
const APP_NAME       = "A-Plus Center";

function Section({ id, title, children }) {
  return (
    <section id={id} className="mb-10">
      <h2 className="text-xl font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200">{title}</h2>
      <div className="text-slate-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function LegalEulaPage() {
  return (
    <>
      <head>
        <title>End-User License Agreement — A-Plus Center</title>
        <meta
          name="description"
          content="A-Plus Center End-User License Agreement (EULA) — the terms that govern your use of the A-Plus Center scheduling and practice management platform."
        />
        <meta name="robots" content="index,follow" />
      </head>

      <div className="min-h-screen bg-white flex flex-col">
        {/* ── Header ── */}
        <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-blue-700 hover:text-blue-800 transition">
              <svg className="w-7 h-7" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="#2563EB" />
                <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="system-ui">A+</text>
              </svg>
              <span className="font-bold text-lg text-slate-900">{APP_NAME}</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link to="/legal/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
            </nav>
          </div>
        </header>

        {/* ── Body ── */}
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-6 py-12">
            {/* Title block */}
            <div className="mb-10">
              <h1 className="text-4xl font-extrabold text-slate-900 mb-2">End-User License Agreement</h1>
              <p className="text-slate-500 text-sm">Effective Date: {EFFECTIVE_DATE}</p>
              <div className="mt-4 rounded-xl bg-blue-50 border border-blue-200 px-5 py-3 text-blue-800 text-sm">
                Please read this agreement carefully. By accessing or using A-Plus Center, you agree to be bound by these terms.
              </div>
            </div>

            {/* Table of contents */}
            <nav className="mb-10 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Contents</p>
              <ol className="space-y-1 text-sm text-blue-700 list-decimal list-inside columns-2">
                <li><a href="#introduction" className="hover:underline">Introduction</a></li>
                <li><a href="#license" className="hover:underline">License Grant</a></li>
                <li><a href="#acceptable-use" className="hover:underline">Acceptable Use</a></li>
                <li><a href="#user-responsibilities" className="hover:underline">User Responsibilities</a></li>
                <li><a href="#data-usage" className="hover:underline">Data Usage</a></li>
                <li><a href="#third-party" className="hover:underline">Third-Party Integrations</a></li>
                <li><a href="#liability" className="hover:underline">Limitation of Liability</a></li>
                <li><a href="#termination" className="hover:underline">Termination</a></li>
                <li><a href="#updates" className="hover:underline">Updates to Terms</a></li>
                <li><a href="#contact" className="hover:underline">Contact Information</a></li>
              </ol>
            </nav>

            <Section id="introduction" title="1. Introduction">
              <p>
                This End-User License Agreement ("Agreement") is a legal agreement between you ("User") and{" "}
                <strong>{APP_NAME}</strong> ("Company," "we," "us," or "our") governing your use of the A-Plus Center
                platform, including all related web-based software, features, and services (collectively, the "Software").
              </p>
              <p>
                By accessing, installing, or using the Software, you acknowledge that you have read, understood, and agree
                to be bound by this Agreement in its entirety. If you do not agree, you must immediately discontinue use of
                the Software.
              </p>
            </Section>

            <Section id="license" title="2. License Grant">
              <p>
                Subject to your compliance with this Agreement, A-Plus Center grants you a limited, non-exclusive,
                non-transferable, non-sublicensable, revocable license to access and use the Software solely for your
                internal business purposes related to ABA therapy practice management, client scheduling, invoicing, and
                related clinical or administrative activities.
              </p>
              <p>This license does not include the right to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Copy, modify, or distribute the Software or any portion thereof;</li>
                <li>Create derivative works based on the Software;</li>
                <li>Sublicense, sell, resell, transfer, assign, or otherwise commercialize the Software;</li>
                <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Software.</li>
              </ul>
            </Section>

            <Section id="acceptable-use" title="3. Acceptable Use">
              <p>You agree to use the Software only for lawful purposes and in accordance with this Agreement. You must not:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Use the Software to violate any applicable local, state, national, or international law or regulation;</li>
                <li>Engage in any fraudulent, abusive, or harmful activity via the Software;</li>
                <li>Attempt to gain unauthorized access to any part of the Software or its related systems or networks;</li>
                <li>Introduce any viruses, Trojan horses, malware, or other harmful code;</li>
                <li>Use automated systems (bots, scrapers, crawlers) to access the Software without prior written consent;</li>
                <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity;</li>
                <li>Interfere with or disrupt the integrity or performance of the Software.</li>
              </ul>
            </Section>

            <Section id="user-responsibilities" title="4. User Responsibilities">
              <p>
                As a User, you are solely responsible for:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>
                  <strong>Data accuracy:</strong> Ensuring that all client, billing, clinical, and scheduling data you
                  enter into the Software is accurate, current, and compliant with applicable regulations (including HIPAA
                  where applicable).
                </li>
                <li>
                  <strong>Account security:</strong> Maintaining the confidentiality of your login credentials. You agree
                  to notify us immediately of any unauthorized use of your account.
                </li>
                <li>
                  <strong>Regulatory compliance:</strong> Ensuring your use of the Software complies with all applicable
                  healthcare, privacy, and employment laws in your jurisdiction.
                </li>
                <li>
                  <strong>User management:</strong> Managing access for your staff or team members and ensuring they comply
                  with this Agreement.
                </li>
              </ul>
            </Section>

            <Section id="data-usage" title="5. Data Usage">
              <p>
                The Software processes and stores data on your behalf for the following purposes:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Client scheduling and appointment management;</li>
                <li>Applied Behavior Analysis (ABA) therapy session tracking and data collection;</li>
                <li>Invoicing and billing management;</li>
                <li>Insurance claim support and reporting;</li>
                <li>Staff and provider management;</li>
                <li>Automated reminders and client communications.</li>
              </ul>
              <p>
                All data is handled in accordance with our{" "}
                <Link to="/legal/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
                We implement industry-standard security measures to protect your data. You retain ownership of all
                client and business data you input into the Software.
              </p>
            </Section>

            <Section id="third-party" title="6. Third-Party Integrations">
              <p>
                The Software integrates with third-party services to extend its functionality. By using these
                integrations, you agree to the applicable terms and policies of those third parties:
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li>
                  <strong>QuickBooks / Intuit:</strong> The Software uses Intuit's QuickBooks APIs to sync invoices,
                  payments, and financial data with your QuickBooks account. Your use of this integration is subject to{" "}
                  <a
                    href="https://quickbooks.intuit.com/privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Intuit's Privacy Policy
                  </a>{" "}
                  and Terms of Service. A-Plus Center does not store your QuickBooks credentials; authentication is
                  handled directly through Intuit's OAuth 2.0 service.
                </li>
                <li>
                  <strong>Payment Processors (PaymentHub / Cardknox / Sola Payments):</strong> Payment processing
                  integrations are provided by licensed third-party payment processors. Card data is never stored on
                  A-Plus Center servers; it is tokenized and handled entirely by the payment processor in compliance
                  with PCI-DSS standards.
                </li>
                <li>
                  <strong>SMS / Communication Providers:</strong> Automated reminder and communication features may use
                  third-party telephony services (e.g., VoIP.ms). Messaging is subject to the applicable provider's terms.
                </li>
              </ul>
              <p>
                We are not responsible for the availability, accuracy, or practices of any third-party services.
              </p>
            </Section>

            <Section id="liability" title="7. Limitation of Liability">
              <p>
                THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
                IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
                PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, A-PLUS CENTER SHALL NOT BE LIABLE FOR:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Any indirect, incidental, special, consequential, or punitive damages;</li>
                <li>Any loss of data, revenue, profits, goodwill, or business opportunities;</li>
                <li>Service interruptions, downtime, or data loss arising from technical failures or force majeure events;</li>
                <li>Unauthorized access to or alteration of your data by third parties.</li>
              </ul>
              <p>
                In no event shall our total aggregate liability exceed the amount paid by you for the Software in the
                twelve (12) months preceding the claim.
              </p>
            </Section>

            <Section id="termination" title="8. Termination">
              <p>
                This Agreement is effective until terminated. A-Plus Center may suspend or terminate your access to the
                Software immediately, without prior notice or liability, if you breach any provision of this Agreement.
              </p>
              <p>
                Upon termination:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Your license to use the Software immediately ceases;</li>
                <li>You must discontinue all use of the Software;</li>
                <li>We will handle your data in accordance with our Privacy Policy and applicable data retention laws.</li>
              </ul>
              <p>
                You may terminate your account at any time by contacting us at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">{SUPPORT_EMAIL}</a>.
              </p>
            </Section>

            <Section id="updates" title="9. Updates to Terms">
              <p>
                We reserve the right to modify this Agreement at any time. When we make material changes, we will
                update the effective date above and, where feasible, provide notice within the Software or via email.
              </p>
              <p>
                Your continued use of the Software after any such changes constitutes your acceptance of the new terms.
                If you do not agree to the modified terms, you must stop using the Software.
              </p>
            </Section>

            <Section id="contact" title="10. Contact Information">
              <p>
                If you have questions or concerns about this Agreement, please contact us:
              </p>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4 text-sm space-y-1">
                <p className="font-semibold text-slate-900">A-Plus Center</p>
                <p>Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">{SUPPORT_EMAIL}</a></p>
              </div>
            </Section>
          </div>
        </main>

        {/* ── Footer ── */}
        <footer className="border-t border-slate-200 bg-slate-50">
          <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
            <p>© {new Date().getFullYear()} A-Plus Center. All rights reserved.</p>
            <nav className="flex gap-4">
              <Link to="/legal/eula" className="hover:text-slate-900 transition">Terms (EULA)</Link>
              <Link to="/legal/privacy" className="hover:text-slate-900 transition">Privacy Policy</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
