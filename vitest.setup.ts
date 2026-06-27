// Top-level import is the side-effect contract of `vitest-browser-react`:
// it `page.extend`s `render`/`renderHook` and registers `beforeEach(cleanup)`.
// `expect.element` DOM matchers come from `@vitest/browser` directly — do not
// also install `@testing-library/jest-dom`, it would shadow the built-ins.
//
// A bare specifier (`setupFiles: ["vitest-browser-react"]`) was tried and
// failed at runtime: `vitest-browser-react/dist/index.js` does
// `import ReactDOMClient from "react-dom/client"`, and the bare-setupFile
// path skips Vite's React-plugin CJS-interop, leaving `react-dom/client`
// without a default export. Routing through a `.ts` setupFile makes Vite
// apply the full plugin pipeline.
import "vitest-browser-react";
