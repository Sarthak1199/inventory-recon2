import { useEffect, useRef, useState } from "react";

export interface DateRange {
  from: string;
  to: string;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Last 7 days", range: () => ({ from: toISO(daysAgo(7)), to: toISO(new Date()) }) },
  { label: "Last 30 days", range: () => ({ from: toISO(daysAgo(30)), to: toISO(new Date()) }) },
  { label: "Last 90 days", range: () => ({ from: toISO(daysAgo(90)), to: toISO(new Date()) }) },
  { label: "All time", range: () => ({ from: "", to: "" }) },
];

export function DateRangeFilter({
  value,
  onChange,
  label: labelPrefix,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const rangeText = !value.from && !value.to ? "All time" : `${value.from || "..."} to ${value.to || "..."}`;
  const label = labelPrefix ? `${labelPrefix}: ${rangeText}` : rangeText;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="whitespace-nowrap">{label}</span>
        <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-gray-100 bg-white p-3 shadow-lg">
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  const r = p.range();
                  onChange(r);
                  setOpen(false);
                }}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:border-brand hover:text-brand"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-gray-500">From</label>
              <input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-gray-500">To</label>
              <input
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm"
              />
            </div>
            <button
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
              className="w-full rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
