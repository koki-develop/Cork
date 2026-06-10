export type McpSettings = {
  enabled: boolean;
  token: string;
};

export type McpStatus =
  | { kind: "stopped" }
  | { kind: "running"; port: number }
  | { kind: "failed"; error: string };
