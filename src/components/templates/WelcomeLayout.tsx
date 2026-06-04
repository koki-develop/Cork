import type { ReactNode } from "react";

export type WelcomeLayoutProps = {
  children: ReactNode;
};

export function WelcomeLayout({ children }: WelcomeLayoutProps) {
  return (
    <main className="flex min-h-screen select-none flex-col items-center justify-center">
      {children}
    </main>
  );
}
