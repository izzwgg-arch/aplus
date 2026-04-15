/**
 * Cardknox iFields (used by Sola Payments) — single version + loader for the SPA.
 * @see https://cdn.cardknox.com/ifields/versions.htm
 */

export const CARDKNOX_IFIELDS_VERSION = "3.4.2602.2001";

export const CARDKNOX_IFIELDS_SCRIPT_URL = `https://cdn.cardknox.com/ifields/${CARDKNOX_IFIELDS_VERSION}/ifields.min.js`;

/** Must match the script version (Cardknox sample uses ifield.html). */
export const CARDKNOX_IFIELD_FRAME_URL = `https://cdn.cardknox.com/ifields/${CARDKNOX_IFIELDS_VERSION}/ifield.html`;

const SCRIPT_ELEMENT_ID = "aplus-cardknox-ifields";

const LEGACY_SCRIPT_IDS = ["sola-ifields-script"];

function removeLegacyScripts() {
  for (const id of LEGACY_SCRIPT_IDS) {
    document.getElementById(id)?.remove();
  }
}

function removeScriptIfWrongVersion() {
  const el = document.getElementById(SCRIPT_ELEMENT_ID);
  if (el && el.src && el.src !== CARDKNOX_IFIELDS_SCRIPT_URL) {
    el.remove();
  }
}

function globalsReady() {
  return typeof window !== "undefined" && typeof window.setAccount === "function" && typeof window.getTokens === "function";
}

/**
 * Loads ifields.min.js once and resolves when `setAccount` / `getTokens` exist on `window`.
 * Rejects on network/CSP failure or timeout (avoids infinite "Initializing…").
 */
export function loadCardknoxIFieldsScript({ timeoutMs = 25000 } = {}) {
  if (globalsReady()) {
    return Promise.resolve();
  }

  removeLegacyScripts();
  removeScriptIfWrongVersion();

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const fail = (message) => {
      reject(new Error(message));
    };

    const waitForGlobals = () => {
      if (globalsReady()) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        fail(
          "Card entry did not load in time. Check your network, disable extensions that block scripts, or verify the browser console for CSP errors."
        );
        return;
      }
      setTimeout(waitForGlobals, 50);
    };

    let el = document.getElementById(SCRIPT_ELEMENT_ID);
    if (el && el.src === CARDKNOX_IFIELDS_SCRIPT_URL) {
      waitForGlobals();
      return;
    }
    if (el) el.remove();

    el = document.createElement("script");
    el.id = SCRIPT_ELEMENT_ID;
    el.src = CARDKNOX_IFIELDS_SCRIPT_URL;
    el.async = true;
    el.crossOrigin = "anonymous";
    el.onerror = () => {
      el.remove();
      fail("Could not load the secure card script (cdn.cardknox.com). Check CSP / network.");
    };
    el.onload = () => waitForGlobals();
    document.head.appendChild(el);
  });
}
