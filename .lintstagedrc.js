export default {
  "*": "biome check --write --no-errors-on-unmatched",
  "src-tauri/src/**/*.rs": () =>
    "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- --deny warnings",
};
