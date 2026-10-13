import { useState, useEffect, useRef } from "react";

/**
 * A searchable dropdown for selecting clients by typing their full name,
 * first name, or last name. Filters client list as the user types.
 */
export function SearchableClientSelect({ clients, value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filteredClients, setFilteredClients] = useState(clients);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Filter clients based on search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredClients(clients);
      return;
    }

    const search = searchText.toLowerCase();
    const filtered = clients.filter((client) => {
      const fullName = client.fullName?.toLowerCase() || "";
      const firstName = client.firstName?.toLowerCase() || "";
      const lastName = client.lastName?.toLowerCase() || "";
      
      // Match if any word of the full name matches any word the user typed
      const searchWords = search.split(/\s+/).filter(Boolean);
      return searchWords.every(
        (word) =>
          fullName.includes(word) ||
          firstName.includes(word) ||
          lastName.includes(word)
      );
    });
    
    setFilteredClients(filtered);
  }, [searchText, clients]);

  // Get the selected client's display name
  const selectedClient = clients.find((c) => c.id === value);
  const displayValue = selectedClient?.fullName || "";

  // Close dropdown when clicking outside (but not on the input itself)
  useEffect(() => {
    function handleClickOutside(e) {
      // Don't close if clicking the input or inside the container
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    // Small delay to let focus events process first
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Always focus the input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Use requestAnimationFrame to ensure the DOM has rendered
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* When a client is selected and dropdown is closed, show the selection as a chip */}
      {displayValue && !isOpen ? (
        <div
          className="saas-input cursor-pointer flex items-center justify-between gap-2"
          onClick={() => !disabled && setIsOpen(true)}
        >
          <span className="truncate text-sm text-slate-800">{displayValue}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setSearchText("");
              setIsOpen(false);
            }}
            className="shrink-0 text-slate-400 hover:text-slate-600 transition"
            aria-label="Clear"
          >
            ✕
          </button>
        </div>
      ) : (
        /* Search input - always editable when open or no selection */
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className="saas-input pl-8 text-sm"
            placeholder="Search client by name…"
            value={searchText}
            onFocus={() => {
              if (!disabled) {
                setIsOpen(true);
              }
            }}
            onChange={(e) => {
              setSearchText(e.target.value);
              setIsOpen(true);
            }}
            onBlur={() => {
              // Don't close dropdown immediately - let click handler decide
              // This prevents losing focus when clicking in the dropdown
            }}
            autoComplete="off"
            disabled={disabled}
          />
          {searchText && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearchText("");
                inputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Dropdown list */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg">
          <div className="max-h-48 overflow-y-auto">
            {filteredClients.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500 italic">
                No clients found
              </div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => {
                    onChange(client.id);
                    setIsOpen(false);
                    setSearchText("");
                  }}
                  className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
                    value === client.id
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {client.fullName}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
