export interface Task {
  id: string;
  title: string;
  status: string;
  body: string;
  order: number | null;
  tags: string[];
}

export type TaskUpdates = Partial<
  Pick<Task, "title" | "status" | "body" | "tags"> & { order: number }
>;
