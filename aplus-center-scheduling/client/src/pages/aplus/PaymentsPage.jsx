import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../lib/api";
import { CARDKNOX_IFIELD_FRAME_URL, loadCardknoxIFieldsScript } from "../../lib/cardknoxIfields.js";
import { useToast } from "../../context/ToastContext";

/* ── Searchable client picker ───────────────────────────────────────────────── */
function ClientPicker({ clients, value, onChange }) {
  const [query,    setQuery]    = useState("");
  const [open,     setOpen]     = useState(false);
  const containerRef            = useRef(null);

  const selected  = clients.find((c) => c.id === value);
  const filtered  = query.trim()
    ? clients.filter((c) => c.fullName.toLowerCase().includes(query.toLowerCase()))
    : clients;

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(client) {
    onChange(client.id);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`saas-input flex items-center gap-2 cursor-text ${open ? "ring-2 ring-blue-500 border-blue-500" : ""}`}
        onClick={() => setOpen(true)}
      >
        {!open && selected ? (
          <span className="flex-1 text-sm text-slate-800 truncate">{selected.fullName}</span>
        ) : (
          <input
            autoFocus={open}
            className="flex-1 text-sm outline-none bg-transparent min-w-0"
            placeholder={selected ? selected.fullName : "Search client…"}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        )}
        {value && (
          <button type="button" onClick={(e) => { e.stopPropagation(); clear(); }}
            className="text-slate-400 hover:text-slate-600 text-xs shrink-0">✕</button>
        )}
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-slate-400 italic">No clients found</li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${c.id === value ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700"}`}
                onMouseDown={(e) => { e.preventDefault(); select(c); }}
              >
                {c.fullName}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

const IFIELD_STYLE = {
  border: "none",
  "font-size": "14px",
  width: "100%",
  padding: "10px 12px",
  "box-sizing": "border-box",
  color: "#1e293b",
};

const initialChargeForm = {
  clientId: "",
  invoiceId: "",
  amount: "",
  currency: "USD",
  description: "",
  expiry: "",
  billingName: "",
  billingEmail: "",
  billingZip: "",
  savePaymentMethod: false
};

export default function PaymentsPage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    totalProcessed: 0,
    totalRefunded: 0,
    netCollected: 0,
    failedPayments: 0,
    pendingPayments: 0
  });
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [clientId, setClientId] = useState(searchParams.get("clientId") || "");
  const [invoiceId, setInvoiceId] = useState(searchParams.get("invoiceId") || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState("paymentDate");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showCharge, setShowCharge] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [chargeForm, setChargeForm] = useState(initialChargeForm);
  const [refundForm, setRefundForm] = useState({ amount: "", reason: "", notes: "" });

  // iFields state for the Charge Card modal
  const [iFieldsKey,   setIFieldsKey]   = useState(null);
  const [iFieldsError, setIFieldsError] = useState(null);
  const [iReady,       setIReady]       = useState(false);  // true after setAccount called
  const iInitializedRef  = useRef(false);
  const iTokenResolveRef = useRef(null);
  const cardTokenRef     = useRef(null);
  const cvvTokenRef      = useRef(null);

  const selectedInvoice = useMemo(() => invoices.find((invoice) => invoice.id === chargeForm.invoiceId) || null, [invoices, chargeForm.invoiceId]);
  const selectedClientInvoices = useMemo(() => invoices.filter((invoice) => !chargeForm.clientId || invoice.clientId === chargeForm.clientId), [invoices, chargeForm.clientId]);

  const buildParams = (nextPage = page, nextLimit = 20) => {
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("limit", String(nextLimit));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (clientId) params.set("clientId", clientId);
    if (invoiceId) params.set("invoiceId", invoiceId);
    if (startDate) params.set("startDate", new Date(startDate).toISOString());
    if (endDate) params.set("endDate", new Date(endDate).toISOString());
    return params;
  };

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const params = buildParams(nextPage, 20);
      const [paymentsRes, clientsRes, invoicesRes] = await Promise.all([
        api.get(`/payments?${params.toString()}`),
        api.get("/clients"),
        api.get("/invoices")
      ]);
      setItems(paymentsRes.data.items || []);
      setSummary(paymentsRes.data.summary || summary);
      setTotal(Number(paymentsRes.data.total || 0));
      setPage(Number(paymentsRes.data.page || nextPage));
      setClients(clientsRes.data || []);
      setInvoices(invoicesRes.data || []);
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not load payments.");
    } finally {
      setLoading(false);
    }
  };

  const openDetails = async (paymentId) => {
    setSelectedPaymentId(paymentId);
    try {
      const { data } = await api.get(`/payments/${paymentId}`);
      setSelectedPayment(data);
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not load payment details.");
    }
  };

  // Fetch iFields key when charge modal opens
  useEffect(() => {
    if (!showCharge) return;
    if (iFieldsKey) return;
    api.get("/payments/sola-ifields-key")
      .then((res) => setIFieldsKey(res.data.iFieldsKey))
      .catch((err) => setIFieldsError(err?.response?.data?.error || "Could not load card form. Check Sola credentials in Settings."));
  }, [showCharge]);

  useEffect(() => {
    if (!iFieldsKey || iInitializedRef.current) return;
    let cancelled = false;
    let completed = false;

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
              iInitializedRef.current = true;
              completed = true;
              setIReady(true);
              setTimeout(() => window.focusIfield?.("card-number"), 150);
            } catch (e) {
              console.error("[ifields-payments] init error", e);
              setIFieldsError("Card form failed to initialize — please refresh.");
            }
          });
        });
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[ifields-payments] load error", e);
          setIFieldsError(e?.message || "Could not load secure card entry.");
        }
      });

    return () => {
      cancelled = true;
      if (!completed) iInitializedRef.current = false;
    };
  }, [iFieldsKey]);

  function getChargeToken() {
    return new Promise((resolve, reject) => {
      if (!window.getTokens) { reject(new Error("Card form not ready")); return; }
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
        (err) => reject(new Error(err?.message || "Tokenization failed")),
        5000
      );
    });
  }

  function resetChargeModal() {
    setShowCharge(false);
    setChargeForm(initialChargeForm);
    iInitializedRef.current = false;
    setIReady(false);
    setIFieldsError(null);
  }

  const submitCharge = async (event) => {
    event.preventDefault();
    setProcessing(true);
    try {
      const exp = String(chargeForm.expiry || "").replace(/\D/g, "");
      if (exp.length !== 4) {
        throw new Error("Expiry must be entered as MM/YY");
      }
      const { xCardNum, xCVV } = await getChargeToken();
      const payload = {
        xCardNum,
        xCVV,
        xExp:        exp,
        clientId:    chargeForm.clientId   || undefined,
        invoiceId:   chargeForm.invoiceId  || undefined,
        amount:      Number(chargeForm.amount),
        currency:    chargeForm.currency,
        description: chargeForm.description || undefined,
        billingName: chargeForm.billingName || undefined,
        billingEmail: chargeForm.billingEmail || undefined,
        billingZip:  chargeForm.billingZip  || undefined,
      };
      const { data } = await api.post("/payments/charge", payload);
      toast?.success(`Charge created: ${money(data.amount, data.currency)}`);
      resetChargeModal();
      await load(1);
      await openDetails(data.id);
    } catch (error) {
      toast?.error(error?.response?.data?.error || error?.message || "Charge failed.");
    } finally {
      setProcessing(false);
    }
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    if (!selectedPayment) return;
    setProcessing(true);
    try {
      await api.post(`/payments/${selectedPayment.id}/refunds`, {
        amount: Number(refundForm.amount),
        reason: refundForm.reason,
        notes: refundForm.notes
      });
      toast?.success("Refund submitted.");
      setShowRefund(false);
      setRefundForm({ amount: "", reason: "", notes: "" });
      await load(page);
      await openDetails(selectedPayment.id);
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Refund failed.");
    } finally {
      setProcessing(false);
    }
  };

  const refreshStatus = async (paymentId) => {
    setProcessing(true);
    try {
      await api.post(`/payments/${paymentId}/refresh-status`);
      toast?.success("Payment status refreshed.");
      await load(page);
      if (selectedPaymentId === paymentId) await openDetails(paymentId);
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Status refresh failed.");
    } finally {
      setProcessing(false);
    }
  };

  const exportCsv = async () => {
    try {
      const params = buildParams(1, 5000);
      const { data } = await api.get(`/payments?${params.toString()}`);
      const rows = data.items || [];
      const header = [
        "date",
        "client",
        "invoice",
        "amount",
        "refunded",
        "net",
        "card",
        "status",
        "processor",
        "external_payment_id"
      ];
      const body = rows.map((payment) => [
        new Date(payment.paymentDate).toISOString(),
        payment.client?.fullName || "",
        payment.invoice?.invoiceNumber || "",
        Number(payment.amount || 0).toFixed(2),
        Number(payment.refundedAmount || 0).toFixed(2),
        Number((payment.netAmount ?? (payment.amount - payment.refundedAmount)) || 0).toFixed(2),
        payment.cardBrand ? `${payment.cardBrand} ${payment.cardLast4 || ""}` : "",
        payment.status || "",
        payment.processor || "",
        payment.externalPaymentId || ""
      ]);
      const csv = [header, ...body]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast?.success("Payments CSV exported.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not export payments.");
    }
  };

  useEffect(() => {
    load(1);
  }, [search, status, clientId, invoiceId, startDate, endDate, sortBy, sortDir]);

  const remainingRefundable = selectedPayment
    ? Math.max(0, Number(selectedPayment.amount || 0) - Number(selectedPayment.refundedAmount || 0))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payments</h1>
          <p className="mt-1 text-sm text-slate-500">Process charges, monitor payment outcomes, and manage refunds.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv}>Export CSV</button>
          <button className="btn-primary" onClick={() => setShowCharge(true)}>Charge Card</button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <div className="card"><p className="text-xs text-slate-500">Total Processed</p><p className="text-xl font-semibold">{money(summary.totalProcessed)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Total Refunded</p><p className="text-xl font-semibold">{money(summary.totalRefunded)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Net Collected</p><p className="text-xl font-semibold">{money(summary.netCollected)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Failed Payments</p><p className="text-xl font-semibold">{summary.failedPayments}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Pending Payments</p><p className="text-xl font-semibold">{summary.pendingPayments}</p></div>
      </section>

      <section className="card space-y-3">
        <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-8">
          <input className="saas-input lg:col-span-2" placeholder="Search client/invoice/payment/last4" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="saas-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["PENDING", "AUTHORIZED", "SUCCEEDED", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELED"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="saas-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.fullName}</option>)}
          </select>
          <select className="saas-input" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">All invoices</option>
            {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber || invoice.id}</option>)}
          </select>
          <input className="saas-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className="saas-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <select className="saas-input" value={`${sortBy}:${sortDir}`} onChange={(e) => {
            const [nextSortBy, nextSortDir] = e.target.value.split(":");
            setSortBy(nextSortBy);
            setSortDir(nextSortDir);
          }}>
            <option value="paymentDate:desc">Newest</option>
            <option value="paymentDate:asc">Oldest</option>
            <option value="amount:desc">Amount high-low</option>
            <option value="amount:asc">Amount low-high</option>
          </select>
        </div>

        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Invoice</th>
                <th className="px-3 py-2 text-left">Amount</th>
                <th className="px-3 py-2 text-left">Refunded</th>
                <th className="px-3 py-2 text-left">Net</th>
                <th className="px-3 py-2 text-left">Card</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Processor</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, index) => (
                <tr key={`sk-${index}`}><td colSpan={10} className="px-3 py-3"><div className="skeleton-line w-full" /></td></tr>
              ))}
              {!loading && items.map((payment) => (
                <tr key={payment.id} className="border-t border-slate-200 hover:bg-slate-50">
                  <td className="px-3 py-2">{new Date(payment.paymentDate).toLocaleString()}</td>
                  <td className="px-3 py-2">{payment.client?.fullName || "-"}</td>
                  <td className="px-3 py-2">{payment.invoice?.invoiceNumber || "-"}</td>
                  <td className="px-3 py-2">{money(payment.amount, payment.currency)}</td>
                  <td className="px-3 py-2">{money(payment.refundedAmount, payment.currency)}</td>
                  <td className="px-3 py-2">{money((payment.netAmount ?? (payment.amount - payment.refundedAmount)), payment.currency)}</td>
                  <td className="px-3 py-2">{payment.cardBrand ? `${payment.cardBrand} •••• ${payment.cardLast4 || ""}` : "-"}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{payment.status}</span></td>
                  <td className="px-3 py-2">{payment.processor}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn-secondary py-1 text-xs" onClick={() => openDetails(payment.id)}>View</button>
                      <button className="btn-secondary py-1 text-xs" onClick={() => refreshStatus(payment.id)}>Refresh</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !items.length && (
                <tr><td colSpan={10} className="px-3 py-6"><div className="empty-state">No payments found for this filter set.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-600">
          <p>Showing page {page} of {Math.max(1, Math.ceil(total / 20))}</p>
          <div className="flex gap-2">
            <button className="btn-secondary py-1" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
            <button className="btn-secondary py-1" disabled={page * 20 >= total} onClick={() => load(page + 1)}>Next</button>
          </div>
        </div>
      </section>

      {selectedPayment && (
        <section className="card space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Payment Details</h2>
              <p className="text-sm text-slate-500">Internal ID: {selectedPayment.id}</p>
              <p className="text-sm text-slate-500">External ID: {selectedPayment.externalPaymentId}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(selectedPayment.externalPaymentId || "")}>Copy external ID</button>
              <button
                className="btn-primary"
                disabled={!["SUCCEEDED", "AUTHORIZED", "PARTIALLY_REFUNDED"].includes(selectedPayment.status) || remainingRefundable <= 0}
                onClick={() => {
                  setRefundForm((prev) => ({ ...prev, amount: String(remainingRefundable.toFixed(2)) }));
                  setShowRefund(true);
                }}
              >
                Refund payment
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <p><strong>Status:</strong> {selectedPayment.status}</p>
              <p><strong>Amount:</strong> {money(selectedPayment.amount, selectedPayment.currency)}</p>
              <p><strong>Refunded:</strong> {money(selectedPayment.refundedAmount, selectedPayment.currency)}</p>
              <p><strong>Net:</strong> {money((selectedPayment.netAmount ?? (selectedPayment.amount - selectedPayment.refundedAmount)), selectedPayment.currency)}</p>
              <p><strong>Fee:</strong> {money(selectedPayment.feeAmount, selectedPayment.currency)}</p>
              <p><strong>Payment date:</strong> {new Date(selectedPayment.paymentDate).toLocaleString()}</p>
              <p><strong>Captured:</strong> {selectedPayment.capturedAt ? new Date(selectedPayment.capturedAt).toLocaleString() : "-"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <p><strong>Client:</strong> {selectedPayment.client?.fullName || "-"}</p>
              <p><strong>Invoice:</strong> {selectedPayment.invoice?.invoiceNumber || "-"}</p>
              <p><strong>Card:</strong> {selectedPayment.cardBrand ? `${selectedPayment.cardBrand} •••• ${selectedPayment.cardLast4 || ""}` : "-"}</p>
              <p><strong>Billing Name:</strong> {selectedPayment.billingName || "-"}</p>
              <p><strong>Billing Email:</strong> {selectedPayment.billingEmail || "-"}</p>
              <p><strong>Billing ZIP:</strong> {selectedPayment.billingZip || "-"}</p>
              <p><strong>Receipt:</strong> {selectedPayment.receiptUrl ? <a className="text-primary-600 underline" href={selectedPayment.receiptUrl} target="_blank" rel="noreferrer">Open receipt</a> : "-"}</p>
              <p><strong>Failure:</strong> {selectedPayment.failureMessage || "-"}</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-900">Refund history</h3>
            <div className="space-y-2">
              {(selectedPayment.refunds || []).map((refund) => (
                <div key={refund.id} className="rounded border border-slate-200 p-2">
                  <p>{money(refund.amount, refund.currency)} · {refund.status}</p>
                  <p className="text-xs text-slate-500">{new Date(refund.createdAt).toLocaleString()} · {refund.reason || "No reason"}</p>
                </div>
              ))}
              {!(selectedPayment.refunds || []).length && <p className="text-slate-500">No refunds recorded.</p>}
            </div>
          </div>
        </section>
      )}

      {showCharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Charge Card</h3>
              <button className="btn-secondary" onClick={resetChargeModal}>Close</button>
            </div>

            {iFieldsError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {iFieldsError}
              </div>
            )}

            <form onSubmit={submitCharge} className="space-y-4">
              {/* Client + Invoice row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Client</label>
                  <ClientPicker
                    clients={clients}
                    value={chargeForm.clientId}
                    onChange={(id) => setChargeForm((prev) => ({ ...prev, clientId: id, invoiceId: "" }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Invoice (optional)</label>
                  <select className="saas-input h-[42px]" value={chargeForm.invoiceId}
                    onChange={(e) => setChargeForm((prev) => ({ ...prev, invoiceId: e.target.value }))}>
                    <option value="">None</option>
                    {selectedClientInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber || inv.id}{inv.balanceDue ? ` — $${Number(inv.balanceDue).toFixed(2)} due` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount + Description */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount <span className="text-red-500">*</span></label>
                  <input className="saas-input" type="number" min="0.01" step="0.01" placeholder="0.00" required
                    value={chargeForm.amount}
                    onChange={(e) => setChargeForm((prev) => ({ ...prev, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                  <input className="saas-input" placeholder="Reason for charge"
                    value={chargeForm.description}
                    onChange={(e) => setChargeForm((prev) => ({ ...prev, description: e.target.value }))} />
                </div>
              </div>

              {selectedInvoice && (
                <p className="text-xs text-slate-500">
                  Invoice balance due: <strong>{money(selectedInvoice.balanceDue, "USD")}</strong>
                </p>
              )}

              {/* ── iFields card entry ─────────────────────────────────── */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Card Details</p>

                {/* Card Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Card Number <span className="text-red-500">*</span></label>
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

                <div className="grid grid-cols-3 gap-3">
                  {/* CVV */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">CVV <span className="text-red-500">*</span></label>
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
                  {/* Expiry */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expiry</label>
                    <input type="text" placeholder="MM/YY" maxLength={5} value={chargeForm.expiry}
                      onChange={(e) => setChargeForm((prev) => ({ ...prev, expiry: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ height: "44px" }} />
                  </div>
                  {/* Billing ZIP */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">ZIP</label>
                    <input type="text" placeholder="ZIP" value={chargeForm.billingZip}
                      onChange={(e) => setChargeForm((prev) => ({ ...prev, billingZip: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ height: "44px" }} />
                  </div>
                </div>

                {/* Billing Name / Email */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name on Card</label>
                    <input type="text" placeholder="Full name" value={chargeForm.billingName}
                      onChange={(e) => setChargeForm((prev) => ({ ...prev, billingName: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ height: "44px" }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Billing Email</label>
                    <input type="email" placeholder="email@example.com" value={chargeForm.billingEmail}
                      onChange={(e) => setChargeForm((prev) => ({ ...prev, billingEmail: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ height: "44px" }} />
                  </div>
                </div>
                <label data-ifields-id="card-data-error" className="block min-h-5 text-xs text-red-600" />
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-slate-400">Secured by Sola Payments · PCI Compliant</p>
                <button
                  type="submit"
                  className="btn-primary px-6 py-2.5 text-sm"
                  disabled={processing || !iReady || !chargeForm.amount}
                >
                  {processing ? "Processing…" : !iReady ? "Initializing…" : `Charge ${chargeForm.amount ? money(chargeForm.amount) : ""}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRefund && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Issue Refund</h3>
              <button className="btn-secondary" onClick={() => setShowRefund(false)}>Close</button>
            </div>
            <form onSubmit={submitRefund} className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p>Original amount: {money(selectedPayment.amount, selectedPayment.currency)}</p>
                <p>Already refunded: {money(selectedPayment.refundedAmount, selectedPayment.currency)}</p>
                <p>Remaining refundable: {money(remainingRefundable, selectedPayment.currency)}</p>
              </div>
              <input className="saas-input" type="number" min="0.01" max={remainingRefundable} step="0.01" value={refundForm.amount} onChange={(e) => setRefundForm((prev) => ({ ...prev, amount: e.target.value }))} />
              <input className="saas-input" placeholder="Reason" value={refundForm.reason} onChange={(e) => setRefundForm((prev) => ({ ...prev, reason: e.target.value }))} />
              <textarea className="saas-textarea min-h-[90px]" placeholder="Internal notes" value={refundForm.notes} onChange={(e) => setRefundForm((prev) => ({ ...prev, notes: e.target.value }))} />
              <div className="flex justify-between">
                <button type="button" className="btn-secondary" onClick={() => setRefundForm((prev) => ({ ...prev, amount: String(remainingRefundable.toFixed(2)) }))}>Full Refund</button>
                <button className="btn-primary" disabled={processing}>{processing ? "Refunding..." : "Submit Refund"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
