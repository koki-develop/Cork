export default {
  "*.{js,jsx,ts,tsx}": "oxlint --fix",
  "*.{js,jsx,ts,tsx,css,json,jsonc,md,html}": "oxfmt",
  "src-tauri/**/*.rs": () =>
    "cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --all-targets -- --deny warnings",
};
