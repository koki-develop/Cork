import type { ReactNode } from "react";

export type WelcomeLayoutProps = {
  children: ReactNode;
};

export function WelcomeLayout({ children }: WelcomeLayoutProps) {
  // `data-tauri-drag-region="deep"` makes the welcome surface draggable by
  // its empty space. Without it, a brand-new "New Window" — which starts
  // here with `TitleBarStyle::Overlay` on macOS — has no draggable chrome
  // and the user cannot move it. The `app-region: no-drag` rules in
  // `src/style.css` exempt interactive elements so the hero CTA and Recent
  // Workspaces items still click normally.
  return (
    <main
      data-tauri-drag-region="deep"
      className="flex min-h-screen flex-col items-center justify-center gap-8 px-8 pt-12 pb-8 select-none"
    >
      {children}
    </main>
  );
}
