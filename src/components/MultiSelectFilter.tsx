import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  id: string;
  label: string;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const buttonText =
    selected.length === 0
      ? `All ${label.toLowerCase()}`
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? `1 ${label.toLowerCase()}`)
        : `${selected.length} ${label.toLowerCase()} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span className="whitespace-nowrap">{buttonText}</span>
        <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-60 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {options.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">No options.</p>}
            {options.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="rounded border-gray-300 text-brand focus:ring-brand"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-lg border-t border-gray-100 px-2 pt-2 text-left text-xs text-brand hover:underline"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
