export const labelKey = (entries: { label: string }[]): string =>
  entries.map((e) => e.label).join("\x00");
