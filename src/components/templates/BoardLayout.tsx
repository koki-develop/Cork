import type { ReactNode } from "react";

export type BoardLayoutProps = {
  header: ReactNode;
  children: ReactNode;
};

export function BoardLayout({ header, children }: BoardLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {header}
      <div className="flex flex-1 gap-5 overflow-x-auto overflow-y-hidden p-6">
        {children}
      </div>
    </div>
  );
}
