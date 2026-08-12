import { useMemo, useRef, useState } from "react";
import {
  mergeTemplatePreview,
  REMINDER_TEMPLATE_VARIABLES,
  stripHtmlForPreview
} from "../../lib/reminderTemplateUtils";

function insertIntoField(el, text, currentValue, onUpdate) {
  if (!el) return;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const next = currentValue.slice(0, start) + text + currentValue.slice(end);
  onUpdate(next);
  const pos = start + text.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

/**
 * @param {{
 *   title: string;
 *   subtitle?: string;
 *   subject: string | null;
 *   bodyTemplate: string;
 *   hasSubject: boolean;
 *   kind: "email" | "sms";
 *   disabled: boolean;
 *   onSubjectChange?: (v: string) => void;
 *   onBodyChange: (v: string) => void;
 *   onSave: () => Promise<void>;
 *   suggestedDefaults?: { subject: string | null; bodyTemplate: string } | null;
 * }} props
 */
export default function ReminderTemplateEditor({
  title,
  subtitle,
  subject,
  bodyTemplate,
  hasSubject,
  kind,
  disabled,
  onSubjectChange,
  onBodyChange,
  onSave,
  suggestedDefaults
}) {
  const bodyRef = useRef(null);
  const subjectRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const mergedBody = useMemo(() => mergeTemplatePreview(bodyTemplate), [bodyTemplate]);
  const mergedSubject = useMemo(
    () => (hasSubject ? mergeTemplatePreview(subject || "") : ""),
    [subject, hasSubject]
  );

  const previewPlain = useMemo(
    () => (kind === "email" ? stripHtmlForPreview(mergedBody) : mergedBody),
    [kind, mergedBody]
  );

  const smsSegmentHint =
    kind === "sms" && previewPlain.length > 160
      ? `About ${Math.ceil(previewPlain.length / 153)} texts on most phones — consider shortening.`
      : null;

  const insertToken = (id) => {
    const token = `{{${id}}}`;
    insertIntoField(bodyRef.current, token, bodyTemplate || "", onBodyChange);
  };

  const insertSubjectToken = (id) => {
    if (!onSubjectChange) return;
    const token = `{{${id}}}`;
    insertIntoField(subjectRef.current, token, subject || "", onSubjectChange);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const restoreSuggested = () => {
    if (!suggestedDefaults?.bodyTemplate) return;
    if (
      !window.confirm(
        "Replace the current text with A+ Center’s suggested wording? You can edit again before saving."
      )
    ) {
      return;
    }
    if (hasSubject && onSubjectChange && suggestedDefaults.subject != null) {
      onSubjectChange(suggestedDefaults.subject);
    }
    onBodyChange(suggestedDefaults.bodyTemplate);
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      {hasSubject && onSubjectChange && (
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Email subject
          </label>
          <input
            ref={subjectRef}
            type="text"
            className="saas-input text-[15px]"
            disabled={disabled}
            value={subject || ""}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="e.g. Reminder: your appointment on {{appointment_date}}"
          />
          <p className="mt-1 text-xs text-slate-400">You can use the same fields as in the message below.</p>
          <div className="mt-2 max-w-full overflow-x-auto pb-1">
            <div className="flex w-max flex-wrap gap-1.5">
              {REMINDER_TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={`subj-${v.id}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => insertSubjectToken(v.id)}
                  className="rounded-md border border-slate-100 bg-slate-50/80 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-40"
                >
                  + {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {kind === "email" ? "Message" : "Text message"}
        </label>
        <textarea
          ref={bodyRef}
          className="saas-textarea min-h-[160px] w-full resize-y text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400"
          disabled={disabled}
          value={bodyTemplate || ""}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={
            kind === "email"
              ? "Write your reminder as you would in an email. Use the buttons below to add names, date, and time."
              : "Write a short text. Tap a field below to insert the appointment details."
          }
          spellCheck
        />
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Insert a field</p>
        <p className="mb-2 text-xs text-slate-500">Adds a placeholder where your cursor is. No need to type codes yourself.</p>
        <div className="flex flex-wrap gap-2">
          {REMINDER_TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={disabled}
              onClick={() => insertToken(v.id)}
              title={v.hint}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-900 disabled:opacity-40"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {kind === "sms" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>
            <span className="font-medium text-slate-700">Length (preview):</span> {previewPlain.length} characters
          </span>
          {previewPlain.length > 160 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-900 ring-1 ring-amber-100">
              Long SMS — may split into multiple messages
            </span>
          )}
          {smsSegmentHint && <span className="text-slate-500">{smsSegmentHint}</span>}
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <p className="mb-3 text-xs text-slate-500">
          Example using sample names and times. Real reminders use each appointment’s details.
        </p>
        {hasSubject && (
          <div className="mb-3 rounded-lg border border-white bg-white/90 px-3 py-2 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Subject</p>
            <p className="text-sm font-medium text-slate-900">{mergedSubject || "(empty subject)"}</p>
          </div>
        )}
        {kind === "email" ? (
          <div className="rounded-lg border border-white bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
            <div
              className="reminder-email-preview max-w-none space-y-2 text-sm leading-relaxed text-slate-700 [&_a]:text-indigo-600 [&_p]:mb-2 [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{
                __html: mergedBody || "<p class=\"text-slate-400\">Nothing to preview yet.</p>"
              }}
            />
            <details className="mt-3 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-500">Plain text version</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-600">{previewPlain || "—"}</pre>
            </details>
          </div>
        ) : (
          <div className="rounded-lg border border-white bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm">
            {previewPlain || <span className="text-slate-400">Nothing to preview yet.</span>}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {suggestedDefaults?.bodyTemplate && (
          <button type="button" className="btn-secondary text-sm" disabled={disabled} onClick={restoreSuggested}>
            Use suggested wording
          </button>
        )}
        <button type="button" className="btn-primary" disabled={disabled || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save message"}
        </button>
        {disabled && <span className="text-xs text-amber-800">Only admins can edit templates.</span>}
      </div>
    </div>
  );
}
