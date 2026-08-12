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
 * When `appointmentId` is set (appointment checkout), the charge amount can be
 * edited; the server shortens/lengthens the session and invoice to match hours = amount ÷ hourly rate.
 *
 * Usage:
 *   <SolaPaymentModal
 *     invoice={invoice}
 *     clientId={clientId}
 *     appointmentId={optionalForAppointmentFlow}
 *     onBillingSynced={(data) => merge appointment + invoice from data)}
 *     onSuccess={(payment) => { ... }}
 *     onClose={() => { ... }}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../lib/api.js";
import { CARDKNOX_IFIELD_FRAME_URL, loadCardknoxIFieldsScript } from "../../lib/cardknoxIfields.js";

/* ─── tiny helpers ─────────────────────────────────────────────────────────── */

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function hourlyRateFromInvoice(invoice) {
  const li = invoice?.lineItems?.[0];
  const u = Number(li?.unitPrice);
  return Number.isFinite(u) && u > 0 ? u : null;
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

/* ─── iFields constants ─────────────────────────────────────────────────────── */
const IFIELD_STYLE = {
  border: "none",
  "font-size": "14px",
  width: "100%",
  padding: "10px 12px",
  "box-sizing": "border-box",
  color: "#1e293b",
};

/* ─── CardNotPresentForm ────────────────────────────────────────────────────── */

function CardNotPresentForm({
  invoice,
  clientId,
  chargeAmount,
  onSuccess,
  onError,
  disabled,
}) {
  const [iFieldsKey, setIFieldsKey] = useState(null);
  const [keyError, setKeyError] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [billingName, setBillingName] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const cardTokenRef = useRef(null);
  const cvvTokenRef = useRef(null);

  useEffect(() => {
    api
      .get("/payments/sola-ifields-key")
      .then((res) => setIFieldsKey(res.data.iFieldsKey))
      .catch((err) => {
        const msg = err?.response?.data?.error || "Could not load payment form — check Sola credentials in Settings.";
        setKeyError(msg);
        onError(msg);
      });
  }, [onError]);

  useEffect(() => {
    if (!iFieldsKey) return;
    let cancelled = false;

    loadCardknoxIFieldsScript({ timeoutMs: 25000 })
      .then(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled) return;
            try {
              window.setAccount(iFieldsKey, "APlus Center", "1.0");
              if (window.setIfieldStyle) {
                window.setIfieldStyle("card-number", IFIELD_STYLE);
                window.setIfieldStyle("cvv", IFIELD_STYLE);
              }
              if (window.enableAutoFormatting) {
                window.enableAutoFormatting(" ");
              }
              setReady(true);
              setTimeout(() => window.focusIfield?.("card-number"), 150);
            } catch (e) {
              console.error("[ifields] init error", e);
              onError("Card form failed to initialize — please refresh and try again.");
            }
          });
        });
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[ifields] load error", e);
          const msg = e?.message || "Could not load secure card entry.";
          setKeyError(msg);
          onError(msg);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [iFieldsKey, onError]);

  function getToken() {
    return new Promise((resolve, reject) => {
      if (!window.getTokens) {
        reject(new Error("Card form not ready — please wait a moment"));
        return;
      }
      if (!cardTokenRef.current || !cvvTokenRef.current) {
        reject(new Error("Card form is missing token fields"));
        return;
      }
      cardTokenRef.current.value = "";
      cvvTokenRef.current.value = "";
      window.getTokens(
        () => {
          const xCardNum = cardTokenRef.current.value;
          const xCVV = cvvTokenRef.current.value;
          if (!xCardNum || !xCVV) {
            reject(new Error("Could not read card details — please re-enter"));
            return;
          }
          resolve({ xCardNum, xCVV });
        },
        (err) => reject(new Error(err?.message || "Card tokenization failed")),
        6000
      );
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const amt = round2(Number(chargeAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      onError("Enter a valid charge amount.");
      return;
    }
    if (amt > round2(Number(invoice.balanceDue || 0)) + 0.01) {
      onError("Charge amount cannot exceed the balance due.");
      return;
    }
    setLoading(true);
    try {
      const exp = expiry.replace(/\D/g, "");
      if (exp.length !== 4) {
        throw new Error("Expiry must be in MMYY format");
      }
      const { xCardNum, xCVV } = await getToken();
      const res = await api.post("/payments/charge", {
        xCardNum,
        xCVV,
        xExp: exp,
        amount: amt,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId || clientId,
        billingName: billingName || undefined,
        billingZip: billingZip || undefined,
        description: `Payment for invoice ${invoice.invoiceNumber || invoice.id}`,
      });
      onSuccess(res.data);
    } catch (err) {
      onError(err?.response?.data?.error || err?.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  if (keyError) {
    return <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{keyError}</div>;
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
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Card Number</label>
        <div className="border border-slate-300 rounded-lg bg-white overflow-hidden" style={{ height: "44px" }}>
          <iframe
            data-ifields-id="card-number"
            data-ifields-placeholder="•••• •••• •••• ••••"
            src={CARDKNOX_IFIELD_FRAME_URL}
            title="Card number"
            style={{ width: "100%", height: "44px", border: "none", display: "block", padding: "0 12px" }}
          />
        </div>
        <input ref={cardTokenRef} name="xCardNum" data-ifields-id="card-number-token" type="hidden" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">CVV</label>
          <div className="border border-slate-300 rounded-lg bg-white overflow-hidden" style={{ height: "44px" }}>
            <iframe
              data-ifields-id="cvv"
              data-ifields-placeholder="•••"
              src={CARDKNOX_IFIELD_FRAME_URL}
              title="CVV"
              style={{ width: "100%", height: "44px", border: "none", display: "block", padding: "0 12px" }}
            />
          </div>
          <input ref={cvvTokenRef} name="xCVV" data-ifields-id="cvv-token" type="hidden" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expiry (MM/YY)</label>
          <input
            type="text"
            placeholder="MM/YY"
            maxLength={5}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ height: "44px" }}
          />
        </div>
      </div>

      <label data-ifields-id="card-data-error" className="block min-h-5 text-xs text-red-600" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name on Card</label>
          <input
            type="text"
            placeholder="Full name"
            value={billingName}
            onChange={(e) => setBillingName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ height: "44px" }}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Billing ZIP</label>
          <input
            type="text"
            placeholder="ZIP code"
            value={billingZip}
            onChange={(e) => setBillingZip(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ height: "44px" }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || disabled || !ready}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        {loading ? "Processing…" : !ready ? "Initializing…" : `Charge ${fmtMoney(chargeAmount)}`}
      </button>
    </form>
  );
}

/* ─── CardReaderForm ────────────────────────────────────────────────────────── */

function CardReaderForm({ invoice, clientId, chargeAmount, onSuccess, onError, disabled }) {
  const [loading, setLoading] = useState(false);

  async function handleSendToReader() {
    const amt = round2(Number(chargeAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      onError("Enter a valid charge amount.");
      return;
    }
    if (amt > round2(Number(invoice.balanceDue || 0)) + 0.01) {
      onError("Charge amount cannot exceed the balance due.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/payments/cloudim-charge", {
        amount: amt,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId || clientId,
        description: `Payment for invoice ${invoice.invoiceNumber || invoice.id}`,
      });
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
          Clicking &quot;Send to Reader&quot; will push the charge to the connected terminal. Ask the client to present
          their card when prompted on the device.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
        <span className="text-sm text-slate-600">Amount to charge</span>
        <span className="text-lg font-bold text-slate-900">{fmtMoney(chargeAmount)}</span>
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
        ) : (
          "Send to Reader"
        )}
      </button>
    </div>
  );
}

/* ─── Main modal ────────────────────────────────────────────────────────────── */

export default function SolaPaymentModal({
  invoice,
  clientId,
  appointmentId = null,
  onBillingSynced = null,
  onSuccess,
  onClose,
}) {
  const [tab, setTab] = useState("card");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [amountStr, setAmountStr] = useState("");
  const [syncingBilling, setSyncingBilling] = useState(false);
  const debounceRef = useRef(null);
  const invoiceRef = useRef(invoice);
  invoiceRef.current = invoice;

  const chargeAmount = round2(parseFloat(String(amountStr).replace(/,/g, "")) || 0);
  const rate = hourlyRateFromInvoice(invoice);
  const hoursPreview = rate && chargeAmount > 0 ? round2(chargeAmount / rate) : null;

  useEffect(() => {
    setAmountStr(String(invoice?.balanceDue ?? ""));
  }, [invoice?.id]);

  const runBillingSync = useCallback(
    async (target) => {
      const inv = invoiceRef.current;
      if (!appointmentId || !inv?.id) return;
      const t = round2(Number(target));
      if (!Number.isFinite(t) || t <= 0) return;
      const invTotal = round2(Number(inv.total ?? inv.balanceDue ?? 0));
      if (Math.abs(t - invTotal) < 0.02) return;
      setSyncingBilling(true);
      setError(null);
      try {
        const { data } = await api.post(`/appointments/${appointmentId}/sync-billing-to-amount`, { amount: t });
        onBillingSynced?.(data);
        if (data?.invoice?.balanceDue != null) {
          setAmountStr(String(data.invoice.balanceDue));
        }
      } catch (err) {
        const msg = err?.response?.data?.error || err?.message || "Could not update session length";
        setError(msg);
      } finally {
        setSyncingBilling(false);
      }
    },
    [appointmentId, onBillingSynced]
  );

  useEffect(() => {
    if (!appointmentId || success) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const t = round2(parseFloat(String(amountStr).replace(/,/g, "")) || 0);
    if (!Number.isFinite(t) || t <= 0) return;
    debounceRef.current = setTimeout(() => {
      runBillingSync(t);
    }, 550);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amountStr, appointmentId, success, runBillingSync]);

  function handleSuccess(payment) {
    setSuccess(payment);
    setTimeout(() => {
      onSuccess?.(payment);
    }, 1800);
  }

  if (!invoice || Number(invoice.balanceDue || 0) <= 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
          <p className="text-green-600 font-semibold text-lg">Invoice is fully paid!</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm text-slate-500 underline">
            Close
          </button>
        </div>
      </div>
    );
  }

  const maxCharge = round2(Number(invoice.balanceDue || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Collect Payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">Invoice {invoice.invoiceNumber || invoice.id}</p>
          </div>
          <button
            type="button"
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
          <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
            {appointmentId ? (
              <>
                <p className="text-xs font-medium opacity-80 mb-1">Amount to charge</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold opacity-90">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="flex-1 bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-2xl font-bold text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-white/80"
                    placeholder="0.00"
                    disabled={!!success}
                  />
                </div>
                <p className="text-xs opacity-80 mt-2">
                  Max {fmtMoney(maxCharge)} (current invoice). Session length updates to match hours ÷ hourly rate.
                  {syncingBilling && <span className="ml-2 font-medium">Updating…</span>}
                </p>
                {rate != null && hoursPreview != null && Number.isFinite(hoursPreview) && (
                  <p className="text-xs opacity-90 mt-1">
                    ≈ <strong>{hoursPreview}</strong> hours at {fmtMoney(rate)}/hr
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs font-medium opacity-80 mb-1">Balance Due</p>
                <p className="text-3xl font-bold">{fmtMoney(invoice.balanceDue)}</p>
              </>
            )}
          </div>

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
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <TabBtn
                  active={tab === "card"}
                  onClick={() => {
                    setTab("card");
                    setError(null);
                  }}
                >
                  Card Entry
                </TabBtn>
                <TabBtn
                  active={tab === "reader"}
                  onClick={() => {
                    setTab("reader");
                    setError(null);
                  }}
                >
                  Card Reader
                </TabBtn>
              </div>

              {tab === "card" && (
                <CardNotPresentForm
                  invoice={invoice}
                  clientId={clientId}
                  chargeAmount={chargeAmount}
                  onSuccess={handleSuccess}
                  onError={setError}
                  disabled={!!success}
                />
              )}
              {tab === "reader" && (
                <CardReaderForm
                  invoice={invoice}
                  clientId={clientId}
                  chargeAmount={chargeAmount}
                  onSuccess={handleSuccess}
                  onError={setError}
                  disabled={!!success}
                />
              )}
            </>
          )}

          <p className="text-center text-xs text-slate-400">
            Secured by Sola Payments · PCI Compliant · Card data never touches our servers
          </p>
        </div>
      </div>
    </div>
  );
}
