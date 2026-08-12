import { useEffect } from "react";

function isTextInput(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export default function useHotkey({ key, ctrlOrMeta = false, shift = false, enabled = true, onTrigger }) {
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (event) => {
      if (ctrlOrMeta && !(event.ctrlKey || event.metaKey)) return;
      if (shift !== event.shiftKey) return;
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (!ctrlOrMeta && isTextInput(event.target)) return;
      event.preventDefault();
      onTrigger();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, ctrlOrMeta, shift, enabled, onTrigger]);
}
