export default {
  "*.{js,jsx,ts,tsx}": "oxlint --fix",
  "*.{js,jsx,ts,tsx,css,json,jsonc,md,html}": "oxfmt",
  "src-tauri/src/**/*.rs": () =>
    "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- --deny warnings",
};
