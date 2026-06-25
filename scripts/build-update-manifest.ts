import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

// Builds the `latest.json` manifest that `tauri-plugin-updater` clients fetch
// from `https://github.com/koki-develop/Cork/releases/latest/download/latest.json`.
// Invoked by `.github/workflows/release-please.yml`'s `release` job after the
// `.app.tar.gz` and `.app.tar.gz.sig` have been uploaded to the release.

const REPO_OWNER = "koki-develop";
const REPO_NAME = "Cork";

function buildManifest(args: { version: string; signature: string; notes: string }): string {
  const manifest = {
    version: args.version,
    notes: args.notes,
    pub_date: new Date().toISOString(),
    platforms: {
      "darwin-aarch64": {
        signature: args.signature,
        url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${args.version}/Cork_${args.version}_aarch64.app.tar.gz`,
      },
    },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      version: { type: "string" },
      signature: { type: "string" },
      notes: { type: "string" },
      out: { type: "string", short: "o" },
    },
  });

  if (!values.version) {
    console.error("Error: --version is required (e.g. 0.16.0, no `v` prefix)");
    process.exit(1);
  }
  if (!values.signature) {
    console.error("Error: --signature is required (path to .app.tar.gz.sig)");
    process.exit(1);
  }
  if (!values.out) {
    console.error("Error: --out is required");
    process.exit(1);
  }

  const versionPattern = /^\d+\.\d+\.\d+$/;
  if (!versionPattern.test(values.version)) {
    console.error(
      `Error: Invalid version format "${values.version}". Expected x.y.z without 'v' prefix`,
    );
    process.exit(1);
  }

  const signature = readFileSync(values.signature, "utf8").trim();
  const notes =
    values.notes && values.notes.length > 0
      ? values.notes
      : `See release notes at https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${values.version}`;

  const content = buildManifest({
    version: values.version,
    signature,
    notes,
  });

  writeFileSync(values.out, content);
  console.log(`Manifest written to: ${values.out}`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
