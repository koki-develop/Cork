import type { ReactNode } from "react";

export type WelcomeLayoutProps = {
  children: ReactNode;
};

export function WelcomeLayout({ children }: WelcomeLayoutProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center select-none">
      {children}
    </main>
  );
}
