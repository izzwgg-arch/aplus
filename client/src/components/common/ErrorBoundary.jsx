import { Component } from "react";
import { isChunkLoadError, reportClientError } from "../../lib/errorReporting";

const RELOAD_FLAG = "chunk-reload-attempted";

/**
 * Catches a render error and shows it, instead of the blank white page React
 * leaves behind when nothing catches it.
 *
 * - Mount it with `key={routeKey}` so navigating to another page resets it.
 * - A stale lazy-route chunk (the server was redeployed while this tab was
 *   open, so the file it asks for no longer exists) is fixed by one reload of
 *   the page; that reload is done automatically, once, so the user never has
 *   to know.
 * - Everything else is reported to the server log and shown with a message,
 *   a "Try again", a "Reload" and a "Go back" button.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error)) {
      let attempted = false;
      try {
        const key = `${RELOAD_FLAG}:${window.location.pathname}`;
        attempted = sessionStorage.getItem(key) === "1";
        if (!attempted) sessionStorage.setItem(key, "1");
      } catch {
        attempted = false;
      }
      if (!attempted) {
        window.location.reload();
        return;
      }
    }
    reportClientError(error, { source: this.props.source || "ErrorBoundary", componentStack: info?.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    const message = chunk
      ? "This page was updated on the server. Reload to get the new version."
      : (error?.message || String(error));

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-slate-900">
                {chunk ? "A newer version is available" : "Something went wrong on this page"}
              </h1>
              <p className="mt-1 text-sm text-slate-600 break-words">{message}</p>
              {!chunk && (
                <p className="mt-2 text-xs text-slate-400">
                  The error has been recorded. If it keeps happening, tell us what you were doing when it appeared.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Reload page
                </button>
                {!chunk && (
                  <button
                    type="button"
                    onClick={this.reset}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Go back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
