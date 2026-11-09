import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function TimesheetReconciliationPage() {
  const toast = useToast();

  // State for input
  const [timesheetType, setTimesheetType] = useState("regular"); // "regular" or "bcba"
  const [rawInput, setRawInput] = useState("");
  const [parsedEntries, setParsedEntries] = useState([]);
  const [showParsed, setShowParsed] = useState(false);

  // State for reconciliation
  const [reconciling, setReconciling] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedFixes, setSelectedFixes] = useState([]);
  const [applying, setApplying] = useState(false);

  // Parse timesheet data
  const parseInput = () => {
    try {
      const data = JSON.parse(rawInput);
      if (!Array.isArray(data.entries)) {
        throw new Error("Input must contain 'entries' array");
      }
      setParsedEntries(data.entries);
      setShowParsed(true);
      toast?.success(`Parsed ${data.entries.length} entries`);
    } catch (err) {
      toast?.error(`Parse error: ${err.message}`);
    }
  };

  // Reconcile the timesheet
  const reconcile = async () => {
    if (!parsedEntries.length) {
      toast?.error("No entries to reconcile");
      return;
    }

    setReconciling(true);
    try {
      const endpoint = timesheetType === "regular"
        ? "/timesheet-reconciliation/reconcile-regular"
        : "/timesheet-reconciliation/reconcile-bcba";

      const response = await api.post(endpoint, {
        entries: parsedEntries
      });

      setResults(response.data);
      setSelectedFixes([]);
      toast?.success(`Reconciliation complete: ${response.data.summary.flagsCount} issues found`);
    } catch (err) {
      console.error("Reconciliation error:", err);
      toast?.error(err?.response?.data?.error || "Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };

  // Select a fix
  const toggleFix = (resultIndex, fixType) => {
    const key = `${resultIndex}:${fixType}`;
    setSelectedFixes(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  // Apply selected fixes
  const applySelectedFixes = async () => {
    if (!selectedFixes.length) {
      toast?.error("Select fixes to apply");
      return;
    }

    setApplying(true);
    try {
      // Build fixes array from selections
      const fixes = [];
      selectedFixes.forEach(key => {
        const [indexStr, fixType] = key.split(':');
        const index = parseInt(indexStr);
        const result = results.results[index];

        if (fixType === 'UPDATE_SESSION_TIME' && result.matchingSession) {
          fixes.push({
            type: 'UPDATE_SESSION_TIME',
            sessionId: result.matchingSession.id,
            newStartTime: new Date(`${result.timesheetEntry.date.split('T')[0]}T${result.timesheetEntry.timeIn}:00`),
            newEndTime: new Date(`${result.timesheetEntry.date.split('T')[0]}T${result.timesheetEntry.timeOut}:00`)
          });
        } else if (fixType === 'MARK_SUPERVISED' && result.matchingSession) {
          fixes.push({
            type: 'MARK_SUPERVISED',
            sessionId: result.matchingSession.id,
            supervisorId: result.matchingSession.supervisorId
          });
        }
      });

      if (!fixes.length) {
        toast?.error("No fixable items selected");
        return;
      }

      const response = await api.post("/timesheet-reconciliation/apply-fixes", { fixes });
      toast?.success(`Applied ${response.data.appliedCount} fixes`);

      // Clear selections and refresh
      setSelectedFixes([]);
      setResults(null);
      setParsedEntries([]);
      setRawInput("");
    } catch (err) {
      console.error("Apply fixes error:", err);
      toast?.error(err?.response?.data?.error || "Failed to apply fixes");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ margin: 0, marginBottom: 8 }}>Timesheet Reconciliation</h1>
      <p style={{ margin: 0, marginBottom: 24, color: "#666", fontSize: 13 }}>
        Check timesheets against sessions for accuracy and supervision matching
      </p>

      {/* Input Section */}
      {!results && (
        <div style={{ background: "white", padding: 24, borderRadius: 8, marginBottom: 24 }}>
          <h2 style={{ margin: 0, marginBottom: 16, fontSize: 16 }}>1. Upload Timesheet</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Timesheet Type
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {["regular", "bcba"].map(type => (
                <label key={type} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="type"
                    value={type}
                    checked={timesheetType === type}
                    onChange={(e) => setTimesheetType(e.target.value)}
                  />
                  <span style={{ fontSize: 13 }}>
                    {type === "regular" ? "Provider/Child" : "BCBA"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Timesheet Data (JSON)
            </label>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={`{
  "entries": [
    {
      "provider": "Avrohom Y Rolnitzky",
      "child": "Aaron Wertzberger",
      "date": "sun 10/25/2026",
      "timeIn": "7:30 AM",
      "timeOut": "8:00 AM",
      "hours": 0.5,
      "type": "DR",
      "location": "Home"
    }
  ]
}`}
              style={{
                width: "100%",
                minHeight: 200,
                padding: 12,
                border: "1px solid #ddd",
                borderRadius: 6,
                fontFamily: "monospace",
                fontSize: 11,
                fontColor: "#333"
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={parseInput}
              disabled={!rawInput.trim()}
              style={{
                padding: "8px 16px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                opacity: rawInput.trim() ? 1 : 0.5
              }}
            >
              Parse Entries
            </button>
          </div>

          {showParsed && parsedEntries.length > 0 && (
            <>
              <div style={{ marginTop: 24, padding: 12, background: "#f0fdf4", borderRadius: 6, border: "1px solid #86efac" }}>
                <p style={{ margin: 0, fontSize: 12, color: "#166534" }}>
                  ✓ Parsed {parsedEntries.length} entries. Click "Reconcile" to check against sessions.
                </p>
              </div>

              <button
                onClick={reconcile}
                disabled={reconciling}
                style={{
                  marginTop: 16,
                  padding: "8px 16px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  opacity: reconciling ? 0.5 : 1
                }}
              >
                {reconciling ? "Reconciling..." : "Reconcile"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Results Section */}
      {results && (
        <div>
          <div style={{ background: "white", padding: 24, borderRadius: 8, marginBottom: 24 }}>
            <h2 style={{ margin: 0, marginBottom: 16, fontSize: 16 }}>2. Review Results</h2>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "#f3f4f6", padding: 12, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Total Entries</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{results.summary.total}</div>
              </div>
              <div style={{ background: "#fef3c7", padding: 12, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>With Issues</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{results.summary.withFlags}</div>
              </div>
              <div style={{ background: "#dbeafe", padding: 12, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Issue Types</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{Object.keys(results.summary.flagsByType).length}</div>
              </div>
              <div style={{ background: "#f0fdf4", padding: 12, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Fixable</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {results.results.filter(r => r.canFix.length > 0).length}
                </div>
              </div>
            </div>

            {/* Issue Type Breakdown */}
            {Object.keys(results.summary.flagsByType).length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ margin: 0, marginBottom: 12, fontSize: 13 }}>Issue Breakdown</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(results.summary.flagsByType).map(([type, count]) => (
                    <div key={type} style={{
                      background: "#f3f4f6",
                      padding: "4px 12px",
                      borderRadius: 99,
                      fontSize: 12
                    }}>
                      {type}: {count}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #ddd" }}>
                    <th style={{ padding: 8, textAlign: "left" }}>Timesheet Entry</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Status</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Issues</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((result, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: 8 }}>
                        <div style={{ fontSize: 11, color: "#666" }}>
                          <div><strong>{result.timesheetEntry.provider || result.timesheetEntry.bcba}</strong></div>
                          <div>{result.timesheetEntry.child || result.timesheetEntry.client}</div>
                          <div>{result.timesheetEntry.date?.split('T')[0]}</div>
                          {result.timesheetEntry.timeIn && (
                            <div>{result.timesheetEntry.timeIn} - {result.timesheetEntry.timeOut}</div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: 8 }}>
                        {result.flags.length === 0 ? (
                          <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                            ✓ OK
                          </span>
                        ) : (
                          <span style={{ background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                            {result.flags.length} issue(s)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {result.flags.length > 0 ? (
                          <div style={{ fontSize: 11 }}>
                            {result.flags.map((flag, fIdx) => (
                              <div key={fIdx} style={{ marginBottom: 4, color: flag.severity === 'error' ? '#dc2626' : '#b45309' }}>
                                • {flag.type}
                                {flag.message && <div style={{ fontSize: 10, marginTop: 2 }}>{flag.message}</div>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#999" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {result.canFix.length > 0 && (
                          <div>
                            {result.canFix.map(fixType => (
                              <label key={fixType} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", marginBottom: 4 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedFixes.includes(`${idx}:${fixType}`)}
                                  onChange={() => toggleFix(idx, fixType)}
                                />
                                <span style={{ fontSize: 11 }}>{fixType}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedFixes.length > 0 && (
              <button
                onClick={applySelectedFixes}
                disabled={applying}
                style={{
                  marginTop: 24,
                  padding: "10px 20px",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: applying ? 0.5 : 1
                }}
              >
                {applying ? "Applying..." : `Apply ${selectedFixes.length} Fix(es)`}
              </button>
            )}

            <button
              onClick={() => {
                setResults(null);
                setParsedEntries([]);
                setRawInput("");
                setTimesheetType("regular");
                setShowParsed(false);
              }}
              style={{
                marginTop: 24,
                marginLeft: 8,
                padding: "10px 20px",
                background: "#6b7280",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimesheetReconciliationPage;
