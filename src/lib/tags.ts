/**
 * Appends `value` (trimmed) to `current`. Returns `current` unchanged if
 * `value` is blank or already present, so callers can use referential
 * inequality (`next !== current`) to detect whether to fire onChange.
 */
export const commitPending = (current: string[], value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return current;
  if (current.includes(trimmed)) return current;
  return [...current, trimmed];
};

/**
 * True if every character of `query` appears in `candidate` in order
 * (case-insensitive, gaps allowed). Empty query matches anything.
 */
export const fuzzySubsequenceMatch = (candidate: string, query: string): boolean => {
  if (!query) return true;
  const c = candidate.toLowerCase();
  const q = query.toLowerCase();
  let ci = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ci < c.length && c[ci] !== q[qi]) ci++;
    if (ci === c.length) return false;
    ci++;
  }
  return true;
};

/**
 * Indices in `candidate` of the characters matched by `query`'s subsequence
 * scan, or `null` if no match. Empty query returns `[]`. Used by autocomplete
 * UI to bold the matched characters.
 */
export const fuzzySubsequenceMatchIndices = (candidate: string, query: string): number[] | null => {
  if (!query) return [];
  const c = candidate.toLowerCase();
  const q = query.toLowerCase();
  const indices: number[] = [];
  let ci = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ci < c.length && c[ci] !== q[qi]) ci++;
    if (ci === c.length) return null;
    indices.push(ci);
    ci++;
  }
  return indices;
};
