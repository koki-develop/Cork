import type { EditingEntry, StatusEntry } from "@/types";

/** Order-sensitive join used as a cheap equality key for status lists. */
export const labelKey = (entries: { label: string }[]): string =>
  entries.map((e) => e.label).join("\x00");

/** Strips blank entries and trims labels — the canonical form sent to the backend. */
export const buildCandidateStatuses = (entries: EditingEntry[]): StatusEntry[] =>
  entries
    .map((e) => e.label.trim())
    .filter((label) => label.length > 0)
    .map((label) => ({ label }));

/** True if any two candidate labels collide case-insensitively. */
export const hasDuplicateLabel = (candidate: StatusEntry[]): boolean => {
  const lowered = candidate.map((c) => c.label.toLowerCase());
  return new Set(lowered).size !== lowered.length;
};

/** Order-sensitive equality on the StatusEntry list. */
export const statusEntriesEqual = (a: StatusEntry[], b: StatusEntry[]): boolean =>
  a.length === b.length && a.every((entry, i) => entry.label === b[i]?.label);

/**
 * Builds the `oldLabel → newLabel` map used by the backend to migrate task
 * frontmatter on rename. Only entries whose persisted label differs from the
 * current trimmed label appear in the map.
 */
export const buildRenameMap = (
  next: EditingEntry[],
  persistedLabelsById: Map<string, string>,
): Record<string, string> => {
  const renameMap: Record<string, string> = {};
  for (const entry of next) {
    const prevLabel = persistedLabelsById.get(entry.id);
    const trimmed = entry.label.trim();
    if (prevLabel !== undefined && prevLabel !== trimmed) {
      renameMap[prevLabel] = trimmed;
    }
  }
  return renameMap;
};
