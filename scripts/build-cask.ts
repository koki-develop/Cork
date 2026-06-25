import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const REPO_OWNER = "koki-develop";
const REPO_NAME = "Cork";

async function downloadAndHash(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const hash = createHash("sha256");
  hash.update(Buffer.from(buffer));
  return hash.digest("hex");
}

function buildCaskContent(version: string, sha256: string): string {
  return `# typed: strict
# frozen_string_literal: true

cask "cork" do
  version "${version}"
  sha256 "${sha256}"

  url "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v#{version}/Cork_#{version}_aarch64.dmg"
  name "Cork"
  desc "Kanban board for local Markdown files"
  homepage "https://github.com/${REPO_OWNER}/${REPO_NAME}"

  auto_updates true

  depends_on arch: :arm64

  app "Cork.app"

  # \`cork\` CLI を PATH に公開する。Cork.app に同梱した sidecar バイナリ
  # (Contents/MacOS/cork-cli) を \`cork\` という名前でシンボリックリンクする。
  binary "#{appdir}/Cork.app/Contents/MacOS/cork-cli", target: "cork"

  preflight do
    # ad-hoc 署名で designated requirement を identifier のみに設定
    # これにより、ビルドが変わっても TCC が同じアプリとして認識する
    system_command "/usr/bin/codesign",
                   args: [
                     "--force",
                     "--deep",
                     "--sign", "-",
                     "--identifier", "me.koki.cork",
                     "-r=designated => identifier \\"me.koki.cork\\"",
                     "#{staged_path}/Cork.app"
                   ]
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{staged_path}/Cork.app"]
  end
end
`;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      out: {
        type: "string",
        short: "o",
      },
    },
    allowPositionals: true,
  });

  const version = positionals[0];
  if (!version) {
    console.error("Usage: bun run ./scripts/build-cask.ts <version> --out <path>");
    console.error("Example: bun run ./scripts/build-cask.ts 0.1.0 --out cork.rb");
    process.exit(1);
  }

  if (!values.out) {
    console.error("Error: --out flag is required");
    process.exit(1);
  }

  const versionPattern = /^\d+\.\d+\.\d+$/;
  if (!versionPattern.test(version)) {
    console.error(`Error: Invalid version format "${version}". Expected x.x.x`);
    process.exit(1);
  }

  const url = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${version}/Cork_${version}_aarch64.dmg`;

  console.log("Downloading and calculating sha256 for aarch64...");
  const sha256 = await downloadAndHash(url);
  console.log(`  sha256: ${sha256}`);

  const content = buildCaskContent(version, sha256);
  writeFileSync(values.out, content);
  console.log(`\nCask file written to: ${values.out}`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
