const TAG_FILTER_OPERATORS = [
  "contains",
  "not_contains",
  "contains_any",
  "contains_all",
  "is_empty",
  "is_not_empty",
] as const;

export type TagFilterOperator = (typeof TAG_FILTER_OPERATORS)[number];

export type TagOperatorWithTags = "contains" | "not_contains" | "contains_any" | "contains_all";

export type TagOperatorWithoutTags = "is_empty" | "is_not_empty";

export type TagFilter =
  | { id: string; operator: TagOperatorWithoutTags }
  | { id: string; operator: TagOperatorWithTags; tags: string[] };

export type StoredFilter =
  | { operator: TagOperatorWithoutTags }
  | { operator: TagOperatorWithTags; tags: string[] };
