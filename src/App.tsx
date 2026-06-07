import { AnimatePresence, domAnimation, LazyMotion, MotionConfig, m } from "motion/react";
import { Toaster } from "sonner";

import { BoardPage, WelcomePage } from "@/components/pages";
import { useCurrentDir } from "@/hooks/useCurrentDir";

function App() {
  const { dir, setDir } = useCurrentDir();

  const pageKey = dir ? "board" : "welcome";
  const page = dir ? (
    <BoardPage key={dir} dir={dir} setDir={setDir} />
  ) : (
    <WelcomePage onDirectorySelected={setDir} />
  );

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait">
          <m.div
            key={pageKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {page}
          </m.div>
        </AnimatePresence>
        <Toaster
          theme="dark"
          position="bottom-right"
          duration={4000}
          toastOptions={{
            style: {
              background: "var(--color-cork-surface)",
              border: "1px solid var(--color-cork-border)",
              color: "var(--color-cork-text)",
              fontSize: "14px",
            },
            classNames: {
              error: "toast-error",
            },
          }}
        />
      </MotionConfig>
    </LazyMotion>
  );
}

export default App;
