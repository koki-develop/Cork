export interface Task {
  id: string;
  title: string;
  status: string;
  body: string;
  order: number | null;
}
