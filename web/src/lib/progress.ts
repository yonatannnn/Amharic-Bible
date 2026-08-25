/**
 * Imperative hooks for the global <TopProgress> bar (mounted in the root layout).
 * Use for actions that aren't plain <a> navigations — OAuth redirects, sign-out,
 * programmatic router pushes — so the same top bar shows as on every page change.
 */
export function startProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("topprogress:start"));
}

export function doneProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("topprogress:done"));
}
