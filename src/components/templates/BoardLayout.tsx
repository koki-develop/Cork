import type { ReactNode } from "react";

export type BoardLayoutProps = {
  header: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
};

export function BoardLayout({ header, toolbar, children }: BoardLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {header}
      {toolbar}
      <div className="flex flex-1 gap-5 overflow-x-auto overflow-y-hidden p-6">
        {children}
      </div>
    </div>
  );
}
