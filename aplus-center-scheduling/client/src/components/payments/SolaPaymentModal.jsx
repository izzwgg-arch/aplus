/**
 * SolaPaymentModal
 *
 * Inline payment modal rendered inside AppointmentDetailsDrawer.
 * Two modes:
 *   "card"   — Card Not Present. Embeds Sola iFields iFrames for secure
 *              card-number, CVV and expiry entry. On submit, calls getToken()
 *              to obtain a single-use token, then POSTs to /api/payments/charge.
 *   "reader" — Card Present. POSTs to /api/payments/cloudim-charge which
 *              sends the transaction to the CloudIM physical terminal.
 *
 * Usage:
 *   <SolaPaymentModal
 *     invoice={invoice}
 *     clientId={clientId}
 *     onSuccess={(payment) => { ... }}
 *     onClose={() => { ... }}
 *   />
 */

import { useEffect, useRef, useState } from "react";
import api from "../../lib/api.js";

const IFIELDS_SCRIPT_URL = "https://cdn.cardknox.com/ifields/2.15.2302.0801/ifields.min.js";

/* ─── tiny helpers ─────────────────────────────────────────────────────────── */

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── iFields loader ────────────────────────────────────────────────────────── */

function loadIFieldsScript(callback) {
  if (document.getElementById("sola-ifields-script")) {
    callback();
    return;
  }
  const script  = document.createElement("script");
  script.id     = "sola-ifields-script";
  script.src    = IFIELDS_SCRIPT_URL;
  script.async  = true;
  script.onload = callback;
  document.head.appendChild(script);
}

/* ─── IFields card iframe URL ───────────────────────────────────────────────── */
const IFIELD_URL = "https://cdn.cardknox.com/ifields/2.15.2302.0801/ifield.htm";
const IFIELD_STYLE = [
  "font-family:Arial,sans-serif",
  "font-size:14px",
  "color:#1e293b",
  "background:#ffffff",
  "width:100%",
  "border:none",
  "outline:none",
  "padding:0",
].join(";");

/* ─── CardNotPresentForm ────────────────────────────────────────────────────── */

function CardNotPresentForm({ invoice, clientId, onSuccess, onError, disabled }) {
  const [iFieldsKey, setIFieldsKey]   = useState(null);
  const [keyError,   setKeyError]     = useState(null);
  const [loading,    setLoading]      = useState(false);
  const [scriptReady,   setScriptReady]  = useState(false);
  const [cardReady,     setCardReady]    = useState(false);
  const [cvvReady,      setCvvReady]     = useState(false);
  const [billingName, setBillingName] = useState("");
  const [billingZip,  setBillingZip]  = useState("");
  const tokenResolveRef = useRef(null);
  const initializedRef  = useRef(false);

  // 1. Fetch iFields key from backend
  useEffect(() => {
    api.get("/payments/sola-ifields-key")
      .then((res) => setIFieldsKey(res.data.iFieldsKey))
      .catch((err) => {
        const msg = err?.response?.data?.error || "Could not load payment form. Check Sola credentials in Settings.";
        setKeyError(msg);
        onError(msg);
      });
  }, []);

  // 2. Load iFields script once we have the key
  useEffect(() => {
    if (!iFieldsKey) return;
    loadIFieldsScript(() => setScriptReady(true));
  }, [iFieldsKey]);

  // 3. Initialise iFields ONLY after script + BOTH iframes are loaded
  useEffect(() => {
    if (!scriptReady || !iFieldsKey || !cardReady || !cvvReady) return;
    if (initializedRef.current) return;
    if (!window.ifields) return;
    initializedRef.current = true;
    try {
      window.ifields.setAccount(iFieldsKey, "APlus Center", "1.0");
      window.ifields.setStyle(IFIELD_STYLE);
      window.ifields.addIfieldCallback("token", (data) => {
        if (tokenResolveRef.current) {
          tokenResolveRef.current(data);
          tokenResolveRef.current = null;
        }
      });
    } catch (e) {
      console.error("[ifields] init error", e);
    }
  }, [scriptReady, iFieldsKey, cardReady, cvvReady]);

  function getToken() {
    return new Promise((resolve, reject) => {
      if (!window.ifields) { reject(new Error("Card form not ready")); return; }
      tokenResolveRef.current = (data) => {
        if (data?.xToken) resolve(data.xToken);
        else reject(new Error(data?.errorMessage || "Could not read card — please re-enter"));
      };
      window.ifields.getTokens(
        () => {},
        (err) => reject(new Error(err?.message || "Card tokenization failed")),
        5000
      );
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const xToken = await getToken();
      const res = await api.post("/payments/charge", {
        xToken,
        amount:        invoice.balanceDue,
        invoiceId:     invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId:      invoice.clientId || clientId,
        billingName:   billingName || undefined,
        billingZip:    billingZip  || undefined,
        description:   `Payment for invoice ${invoice.invoiceNumber || invoice.id}`
      });
      onSuccess(res.data);
    } catch (err) {
      onError(err?.response?.data?.error || err?.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  const formReady = scriptReady && cardReady && cvvReady;

  if (keyError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        {keyError}
      </div>
    );
  }

  if (!iFieldsKey) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading payment form…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Card Number */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Card Number</label>
        <div className={`relative border rounded-lg bg-white overflow-hidden transition-colors ${formReady ? "border-slate-300 hover:border-blue-400" : "border-slate-200"}`}
          style={{ height: "44px" }}>
          <iframe
            data-ifields-id="card-number"
            data-ifields-placeholder="•••• •••• •••• ••••"
            src={IFIELD_URL}
            title="Card number"
            onLoad={() => setCardReady(true)}
            style={{ width: "100%", height: "44px", border: "none", display: "block", padding: "0 12px" }}
          />
          {!formReady && (
            <div className="absolute inset-0 flex items-center px-3 bg-white pointer-events-none">
              <span className="text-sm text-slate-300 animate-pulse">Loading…</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* CVV */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">CVV</label>
          <div className={`relative border rounded-lg bg-white overflow-hidden transition-colors ${formReady ? "border-slate-300 hover:border-blue-400" : "border-slate-200"}`}
            style={{ height: "44px" }}>
            <iframe
              data-ifields-id="cvv"
              data-ifields-placeholder="•••"
              src={IFIELD_URL}
              title="CVV"
              onLoad={() => setCvvReady(true)}
              style={{ width: "100%", height: "44px", border: "none", display: "block", padding: "0 12px" }}
            />
            {!formReady && (
              <div className="absolute inset-0 flex items-center px-3 bg-white pointer-events-none">
                <span className="text-sm text-slate-300 animate-pulse">…</span>
              </div>
            )}
          </div>
        </div>

        {/* Expiry — regular input, not tokenized */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expiry (MM/YY)</label>
          <input
            type="text"
            placeholder="MM/YY"
            maxLength={5}
            className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            style={{ height: "44px" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name on Card</label>
          <input type="text" placeholder="Full name" value={billingName}
            onChange={(e) => setBillingName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ height: "44px" }} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Billing ZIP</label>
          <input type="text" placeholder="ZIP code" value={billingZip}
            onChange={(e) => setBillingZip(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ height: "44px" }} />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || disabled || !formReady}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        {loading ? "Processing…" : !formReady ? "Loading card form…" : `Charge ${fmtMoney(invoice.balanceDue)}`}
      </button>
    </form>
  );
}

/* ─── CardReaderForm ────────────────────────────────────────────────────────── */

function CardReaderForm({ invoice, clientId, onSuccess, onError, disabled }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleSendToReader() {
    setLoading(true);
    setSent(false);
    try {
      const res = await api.post("/payments/cloudim-charge", {
        amount:        invoice.balanceDue,
        invoiceId:     invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId:      invoice.clientId || clientId,
        description:   `Payment for invoice ${invoice.invoiceNumber || invoice.id}`
      });
      setSent(true);
      onSuccess(res.data);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Terminal charge failed";
      onError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">Card Reader (CloudIM Terminal)</p>
        <p className="text-blue-700">
          Clicking "Send to Reader" will push the charge to the connected terminal.
          Ask the client to present their card when prompted on the device.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
        <span className="text-sm text-slate-600">Amount to charge</span>
        <span className="text-lg font-bold text-slate-900">{fmtMoney(invoice.balanceDue)}</span>
      </div>

      <button
        type="button"
        onClick={handleSendToReader}
        disabled={loading || disabled}
        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Waiting for terminal…
          </>
        ) : "Send to Reader"}
      </button>
    </div>
  );
}

/* ─── Main modal ────────────────────────────────────────────────────────────── */

export default function SolaPaymentModal({ invoice, clientId, onSuccess, onClose }) {
  const [tab, setTab]         = useState("card");
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);

  function handleSuccess(payment) {
    setSuccess(payment);
    // Give the user a moment to see the success message, then close
    setTimeout(() => {
      onSuccess?.(payment);
    }, 1800);
  }

  // Nothing to pay
  if (!invoice || Number(invoice.balanceDue || 0) <= 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
          <p className="text-green-600 font-semibold text-lg">Invoice is fully paid!</p>
          <button onClick={onClose} className="mt-4 text-sm text-slate-500 underline">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Collect Payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Invoice {invoice.invoiceNumber || invoice.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Balance due */}
          <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
            <p className="text-xs font-medium opacity-80 mb-1">Balance Due</p>
            <p className="text-3xl font-bold">{fmtMoney(invoice.balanceDue)}</p>
          </div>

          {/* Success state */}
          {success && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
              <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full mx-auto mb-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-800 font-semibold">Payment Approved!</p>
              <p className="text-green-700 text-xs mt-1">
                Ref: {success.solaXRefNum || success.externalPaymentId}
              </p>
              <p className="text-green-600 text-xs mt-1">Receipt email has been sent to the client.</p>
            </div>
          )}

          {/* Error */}
          {error && !success && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!success && (
            <>
              {/* Tab switcher */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <TabBtn active={tab === "card"}   onClick={() => { setTab("card");   setError(null); }}>
                  Card Entry
                </TabBtn>
                <TabBtn active={tab === "reader"} onClick={() => { setTab("reader"); setError(null); }}>
                  Card Reader
                </TabBtn>
              </div>

              {/* Tab content */}
              {tab === "card" && (
                <CardNotPresentForm
                  invoice={invoice}
                  clientId={clientId}
                  onSuccess={handleSuccess}
                  onError={setError}
                  disabled={!!success}
                />
              )}
              {tab === "reader" && (
                <CardReaderForm
                  invoice={invoice}
                  clientId={clientId}
                  onSuccess={handleSuccess}
                  onError={setError}
                  disabled={!!success}
                />
              )}
            </>
          )}

          {/* Powered-by footer */}
          <p className="text-center text-xs text-slate-400">
            Secured by Sola Payments · PCI Compliant · Card data never touches our servers
          </p>
        </div>
      </div>
    </div>
  );
}
