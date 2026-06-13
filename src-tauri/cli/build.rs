use std::path::Path;

/// Injects the version from the repository's `package.json` (the single source of
/// truth that release-please bumps) as the `CORK_VERSION` compile-time env var, so
/// the CLI's `--version` always matches the app without a second version to maintain.
fn main() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let package_json = Path::new(manifest_dir).join("../../package.json");
    println!("cargo:rerun-if-changed={}", package_json.display());

    let contents = std::fs::read_to_string(&package_json)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", package_json.display()));
    let json: serde_json::Value =
        serde_json::from_str(&contents).expect("package.json is not valid JSON");
    let version = json["version"]
        .as_str()
        .expect("package.json is missing a string \"version\" field");

    println!("cargo:rustc-env=CORK_VERSION={version}");
}
