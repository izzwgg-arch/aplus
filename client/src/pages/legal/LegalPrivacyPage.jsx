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

export default function LegalPrivacyPage() {
  return (
    <>
      <head>
        <title>Privacy Policy — A-Plus Center</title>
        <meta
          name="description"
          content="A-Plus Center Privacy Policy — how we collect, use, and protect your data securely, including QuickBooks/Intuit integration and payment processing."
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
              <Link to="/legal/eula" className="text-blue-600 hover:underline">Terms (EULA)</Link>
            </nav>
          </div>
        </header>

        {/* ── Body ── */}
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-6 py-12">
            {/* Title block */}
            <div className="mb-10">
              <h1 className="text-4xl font-extrabold text-slate-900 mb-2">Privacy Policy</h1>
              <p className="text-slate-500 text-sm">Effective Date: {EFFECTIVE_DATE}</p>
              <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-3 text-emerald-800 text-sm">
                Your privacy matters to us. This policy explains what data we collect, why we collect it, and how we protect it.
              </div>
            </div>

            {/* Table of contents */}
            <nav className="mb-10 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Contents</p>
              <ol className="space-y-1 text-sm text-blue-700 list-decimal list-inside columns-2">
                <li><a href="#introduction" className="hover:underline">Introduction</a></li>
                <li><a href="#information-collected" className="hover:underline">Information Collected</a></li>
                <li><a href="#how-data-used" className="hover:underline">How Data Is Used</a></li>
                <li><a href="#quickbooks" className="hover:underline">QuickBooks Integration</a></li>
                <li><a href="#data-sharing" className="hover:underline">Data Sharing</a></li>
                <li><a href="#data-security" className="hover:underline">Data Storage & Security</a></li>
                <li><a href="#user-rights" className="hover:underline">Your Rights</a></li>
                <li><a href="#retention" className="hover:underline">Data Retention</a></li>
                <li><a href="#cookies" className="hover:underline">Cookies & Tracking</a></li>
                <li><a href="#updates" className="hover:underline">Updates to Policy</a></li>
                <li><a href="#contact" className="hover:underline">Contact</a></li>
              </ol>
            </nav>

            <Section id="introduction" title="1. Introduction">
              <p>
                <strong>A-Plus Center</strong> ("we," "our," or "us") operates the A-Plus Center platform — a
                web-based practice management system designed for ABA (Applied Behavior Analysis) therapy providers.
                This Privacy Policy describes how we collect, use, disclose, and safeguard information when you use
                our platform.
              </p>
              <p>
                By using A-Plus Center, you consent to the data practices described in this policy. If you do not
                agree, please discontinue use of the platform immediately.
              </p>
            </Section>

            <Section id="information-collected" title="2. Information We Collect">
              <p>We collect the following categories of information:</p>

              <div className="space-y-4">
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800 mb-1">Client & Clinical Data</p>
                  <ul className="list-disc ml-5 space-y-1 text-sm">
                    <li>Client names, dates of birth, and contact information</li>
                    <li>Appointment and scheduling records</li>
                    <li>ABA therapy session data and progress notes</li>
                    <li>Insurance provider information</li>
                    <li>Assessment and data-tracking records</li>
                  </ul>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800 mb-1">User Account Data</p>
                  <ul className="list-disc ml-5 space-y-1 text-sm">
                    <li>Name, email address, and role/title</li>
                    <li>Encrypted password (we never store plain-text passwords)</li>
                    <li>Login activity and session information</li>
                    <li>Audit log entries for actions performed in the platform</li>
                  </ul>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800 mb-1">Billing & Payment Metadata</p>
                  <ul className="list-disc ml-5 space-y-1 text-sm">
                    <li>Invoice records, amounts, and payment status</li>
                    <li>Payment confirmation IDs from payment processors</li>
                    <li>
                      <strong>We do NOT store full card numbers or CVV codes.</strong> Card data is tokenized by
                      PCI-DSS-compliant payment processors and never transmitted to or stored on A-Plus Center servers.
                    </li>
                  </ul>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-800 mb-1">Technical & Usage Data</p>
                  <ul className="list-disc ml-5 space-y-1 text-sm">
                    <li>IP address and browser/device information</li>
                    <li>Pages visited and features used (for improving the platform)</li>
                    <li>Error logs for debugging and reliability purposes</li>
                  </ul>
                </div>
              </div>
            </Section>

            <Section id="how-data-used" title="3. How We Use Your Data">
              <p>We use the information we collect to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li><strong>Scheduling:</strong> Manage client appointments, availability, and provider assignments.</li>
                <li><strong>ABA Tracking:</strong> Record and report on therapy session data, goals, and client progress.</li>
                <li><strong>Invoicing & Billing:</strong> Generate, send, and track invoices and payments.</li>
                <li><strong>Reporting:</strong> Produce practice management and compliance reports.</li>
                <li><strong>Communications:</strong> Send automated appointment reminders via email and/or SMS on your behalf.</li>
                <li><strong>Platform improvement:</strong> Analyze usage patterns to fix bugs and improve features.</li>
                <li><strong>Security:</strong> Detect, investigate, and prevent fraudulent or unauthorized access.</li>
                <li><strong>Legal compliance:</strong> Fulfill legal and regulatory obligations.</li>
              </ul>
              <p>We do not sell your data or use it for advertising purposes.</p>
            </Section>

            <Section id="quickbooks" title="4. QuickBooks / Intuit Integration">
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-5 py-4 text-blue-900">
                <p className="font-bold text-base mb-2">QuickBooks Data Usage Statement</p>
                <p className="text-sm leading-relaxed">
                  We use <strong>Intuit QuickBooks APIs</strong> to sync invoices, payments, and financial data between
                  A-Plus Center and your connected QuickBooks account. We only access and use QuickBooks data that is
                  strictly necessary for invoicing and accounting purposes within the platform. We do not sell,
                  redistribute, or use QuickBooks data for any purpose other than providing the accounting sync
                  feature you have explicitly enabled.
                </p>
              </div>

              <p>Specifically, the QuickBooks integration:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Authenticates using Intuit's <strong>OAuth 2.0</strong> protocol — we never store your QuickBooks username or password.</li>
                <li>Reads and writes invoice data (customer names, line items, amounts, payment status) to keep records synchronized.</li>
                <li>Accesses only the QuickBooks company files you explicitly authorize.</li>
                <li>Allows you to disconnect the integration at any time from your Settings page, after which we immediately revoke access tokens.</li>
              </ul>
              <p>
                Use of the QuickBooks integration is also governed by{" "}
                <a
                  href="https://quickbooks.intuit.com/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Intuit's Privacy Policy
                </a>{" "}
                and{" "}
                <a
                  href="https://developer.intuit.com/app/developer/homepage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Intuit Developer Terms of Service
                </a>.
              </p>
            </Section>

            <Section id="data-sharing" title="5. Data Sharing & Disclosure">
              <p>
                We do <strong>not sell</strong> your personal data or client data to any third party. We share
                data only in the following limited circumstances:
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li>
                  <strong>QuickBooks / Intuit:</strong> Invoice and payment data is synced to your authorized
                  QuickBooks account solely to provide the accounting integration feature.
                </li>
                <li>
                  <strong>Payment Processors (Sola Payments / Cardknox / PaymentHub):</strong> Payment transaction
                  data (amount, invoice reference, tokenized card data) is shared with your connected payment
                  processor to execute authorized payments. These processors are PCI-DSS compliant.
                </li>
                <li>
                  <strong>SMS / Communication Providers:</strong> Client phone numbers and appointment details may
                  be shared with a telephony provider solely to deliver reminders you configure.
                </li>
                <li>
                  <strong>Legal requirements:</strong> We may disclose data if required to do so by law, court
                  order, or governmental authority.
                </li>
              </ul>
              <p>We require all third-party service providers to maintain appropriate confidentiality and security standards.</p>
            </Section>

            <Section id="data-security" title="6. Data Storage & Security">
              <p>
                Protecting your data is a core responsibility. We employ the following safeguards:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li><strong>Encryption at rest:</strong> Sensitive fields (addresses, notes, clinical details) are encrypted in the database using AES encryption.</li>
                <li><strong>Encryption in transit:</strong> All data transmitted between your browser and our servers uses TLS/HTTPS.</li>
                <li><strong>Access controls:</strong> Role-based access controls ensure staff members only see data relevant to their role.</li>
                <li><strong>Server security:</strong> Our servers are hosted on a dedicated VPS with firewall protections, regular security updates, and restricted root access.</li>
                <li><strong>Audit logging:</strong> All significant data operations are logged with timestamps and user identity for accountability and compliance.</li>
                <li><strong>No card data storage:</strong> We never store raw card numbers, CVV codes, or magnetic stripe data on our servers.</li>
              </ul>
              <p>
                While we strive to use commercially acceptable means to protect your information, no method of
                transmission or storage is 100% secure. We cannot guarantee absolute security.
              </p>
            </Section>

            <Section id="user-rights" title="7. Your Rights">
              <p>
                Depending on your jurisdiction, you may have the following rights regarding your personal data:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data.</li>
                <li><strong>Deletion:</strong> Request deletion of your data, subject to legal retention requirements.</li>
                <li><strong>Data portability:</strong> Request an export of your data in a machine-readable format.</li>
                <li><strong>Withdraw consent:</strong> Where processing is based on consent, you may withdraw it at any time.</li>
              </ul>
              <p>
                To exercise any of these rights, contact us at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">{SUPPORT_EMAIL}</a>.
                We will respond within 30 days.
              </p>
            </Section>

            <Section id="retention" title="8. Data Retention">
              <p>
                We retain your data only for as long as necessary to provide the services you have requested and to
                comply with applicable legal obligations. Specifically:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Active client and session records are retained for the duration of your account and for a minimum period required by applicable healthcare regulations.</li>
                <li>Invoice and payment records are retained as required for tax and financial compliance purposes (typically 7 years).</li>
                <li>Audit logs are retained for a minimum of 2 years.</li>
                <li>Upon account termination or deletion request, we will delete or anonymize your data within a reasonable period, except where retention is legally required.</li>
              </ul>
            </Section>

            <Section id="cookies" title="9. Cookies & Tracking">
              <p>
                A-Plus Center uses minimal tracking technologies:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>
                  <strong>Authentication cookies:</strong> We use secure, HTTP-only session cookies strictly to maintain your authenticated session. These are necessary for the platform to function.
                </li>
                <li>
                  <strong>No third-party advertising trackers:</strong> We do not use Google Analytics, Facebook Pixel, or similar advertising trackers.
                </li>
                <li>
                  <strong>Local storage:</strong> Some user preferences (such as UI state) may be stored in your browser's local storage for convenience.
                </li>
              </ul>
            </Section>

            <Section id="updates" title="10. Updates to This Policy">
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our practices, technology,
                or legal requirements. When we make material changes, we will update the effective date at the top
                of this page and, where feasible, notify you within the platform or via email.
              </p>
              <p>
                Your continued use of the platform after any change constitutes your acceptance of the updated policy.
              </p>
            </Section>

            <Section id="contact" title="11. Contact Us">
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy or our data practices,
                please contact us:
              </p>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4 text-sm space-y-1">
                <p className="font-semibold text-slate-900">A-Plus Center</p>
                <p>Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">{SUPPORT_EMAIL}</a></p>
              </div>
              <p className="text-xs text-slate-500">
                For QuickBooks / Intuit-related data requests, please specify "QuickBooks Data Request" in your email subject.
              </p>
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
