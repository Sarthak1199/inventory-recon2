import { useSearchParams } from "react-router-dom";

/**
 * Persists a flat set of string filters in the current URL's query params.
 * Because the params live on the page's own URL, they're automatically
 * scoped per route (no cross-page leakage) and survive browser back/forward
 * or any navigation that restores this exact URL — no separate "hydrate on
 * mount" step is needed, since useSearchParams already reflects whatever the
 * URL says on first render. A plain link to the bare path (no query string)
 * always starts every filter back at its default.
 */
export function usePersistedFilters<T extends Record<string, string>>(
  defaults: T
): [T, (patch: Partial<T>) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = searchParams.get(key);
    if (value !== null) (filters as Record<string, string>)[key] = value;
  }

  function setFilters(patch: Partial<T>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of Object.keys(patch)) {
          const value = patch[key as keyof T] as string | undefined;
          if (!value || value === defaults[key]) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      },
      { replace: true }
    );
  }

  return [filters, setFilters];
}
