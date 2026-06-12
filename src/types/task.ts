export interface Task {
  id: string;
  title: string;
  status: string;
  body: string;
  order: number | null;
  tags: string[];
  /** Due date as a canonical `YYYY-MM-DD` string, or null when unset. */
  date: string | null;
}

export type TaskUpdates = Partial<
  Pick<Task, "title" | "status" | "body" | "tags"> & {
    order: number;
    /** Canonical `YYYY-MM-DD` to set the due date, or `""` to clear it. */
    date: string;
  }
>;
