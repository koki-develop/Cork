export interface StatusEntry {
  label: string;
}

export type EditingEntry = StatusEntry & { id: string };
