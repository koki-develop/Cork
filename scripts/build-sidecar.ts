import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Builds the `cork` CLI and stages it as a Tauri sidecar so `tauri build` / `tauri dev`
// embed it into `Cork.app/Contents/MacOS/cork-cli`. Tauri requires the binary to carry a
// `-<target-triple>` suffix (see tauri.conf.json `bundle.externalBin`), which it strips when
// bundling. The Homebrew Cask then symlinks the embedded binary onto PATH as `cork`.

const scriptDir = dirname(fileURLToPath(import.meta.url));
const srcTauri = join(scriptDir, "..", "src-tauri");

function hostTargetTriple(): string {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const line = out.split("\n").find((l) => l.startsWith("host:"));
  if (!line) {
    throw new Error("could not determine host target triple from `rustc -vV`");
  }
  return line.slice("host:".length).trim();
}

function main() {
  console.log("Building cork CLI (release)...");
  execFileSync("cargo", ["build", "--release", "-p", "cork-cli"], {
    cwd: srcTauri,
    stdio: "inherit",
  });

  const triple = hostTargetTriple();
  const source = join(srcTauri, "target", "release", "cork-cli");
  const binariesDir = join(srcTauri, "binaries");
  const dest = join(binariesDir, `cork-cli-${triple}`);

  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(source, dest);
  chmodSync(dest, 0o755);

  console.log(`Sidecar staged: ${dest}`);
}

main();
