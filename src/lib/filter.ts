import type { TagFilter } from "@/types";

/** A filter is "valid" (= contributes to the AND chain) when it carries enough
 *  data to express a real predicate. Operand-less operators (`is_empty` /
 *  `is_not_empty`) are always valid; tag-based operators require at least one
 *  tag. Empty-operand tag filters are treated as no-ops by `matches_filter` on
 *  the Rust side, so they don't change results — we keep them out of the
 *  visible count and prune them when the popover closes. */
export function isValidFilter(f: TagFilter): boolean {
  return "tags" in f ? f.tags.length > 0 : true;
}
