use gray_matter::engine::YAML;
use gray_matter::Matter;
use serde::de::DeserializeOwned;
use yaml_rust2::yaml::Hash as YamlHash;
use yaml_rust2::{Yaml, YamlEmitter};

/// Parse YAML frontmatter as `T`, returning the body separately.
/// On any parse failure returns `(None, content.to_string())`.
pub fn parse<T: DeserializeOwned>(content: &str) -> (Option<T>, String) {
    let matter = Matter::<YAML>::new();
    match matter.parse::<T>(content) {
        Ok(entity) => (entity.data, entity.content),
        Err(_) => (None, content.to_string()),
    }
}

/// Upsert keys into the YAML frontmatter while preserving the body and any
/// unrelated frontmatter fields. If the document has no frontmatter, one
/// containing only `updates` is prepended. The returned string is always
/// terminated by a newline (so callers can pass it directly to `fs::write`
/// without producing files that violate the POSIX text-file convention).
pub fn update(content: &str, updates: &[(&str, serde_json::Value)]) -> String {
    let matter = Matter::<YAML>::new();
    let result = match matter.parse::<serde_json::Value>(content) {
        Ok(entity) => {
            let body = entity.content.trim_start_matches(['\n', '\r']);
            let mut data = entity.data.unwrap_or(serde_json::json!({}));
            if let Some(obj) = data.as_object_mut() {
                for (key, value) in updates {
                    obj.insert(key.to_string(), value.clone());
                }
            }
            let yaml = serialize(&data);
            format!("---\n{}---\n\n{}", yaml, body)
        }
        Err(_) => {
            let mut fm = String::from("---\n");
            for (key, value) in updates {
                fm.push_str(&format!("{}: {}\n", key, value));
            }
            fm.push_str("---\n\n");
            fm.push_str(content);
            fm
        }
    };
    ensure_trailing_newline(result)
}

/// Like `update` but for removal. Documents without frontmatter pass
/// through unchanged (no FM is added). Always newline-terminated. Returns
/// `Err` if the document looked like it had frontmatter (`---` prefix)
/// but failed to parse — silently writing back the unparsed content would
/// be a data-integrity hazard (the caller would think the keys were
/// removed when they were not).
pub fn remove_keys(content: &str, keys: &[&str]) -> Result<String, String> {
    if !content.starts_with("---\n") && !content.starts_with("---\r\n") {
        return Ok(ensure_trailing_newline(content.to_string()));
    }
    let matter = Matter::<YAML>::new();
    match matter.parse::<serde_json::Value>(content) {
        Ok(entity) => {
            let body = entity.content.trim_start_matches(['\n', '\r']);
            let mut data = entity.data.unwrap_or(serde_json::json!({}));
            if let Some(obj) = data.as_object_mut() {
                for key in keys {
                    obj.remove(*key);
                }
            }
            let yaml = serialize(&data);
            Ok(ensure_trailing_newline(format!(
                "---\n{}---\n\n{}",
                yaml, body
            )))
        }
        Err(e) => Err(format!("Failed to parse frontmatter: {}", e)),
    }
}

/// Append a trailing `\n` to `s` if it doesn't already end with one. No-op
/// for empty strings.
pub fn ensure_trailing_newline(mut s: String) -> String {
    if !s.is_empty() && !s.ends_with('\n') {
        s.push('\n');
    }
    s
}

/// Serialize a JSON object as the YAML payload inside `---` markers
/// (markers themselves are *not* included; the trailing newline is).
pub fn serialize(value: &serde_json::Value) -> String {
    let yaml = json_to_yaml(value);
    let mut out = String::new();
    {
        let mut emitter = YamlEmitter::new(&mut out);
        if emitter.dump(&yaml).is_err() {
            return String::new();
        }
    }
    let stripped = out.strip_prefix("---\n").unwrap_or(&out).to_string();
    if stripped.ends_with('\n') {
        stripped
    } else {
        format!("{}\n", stripped)
    }
}

fn json_to_yaml(value: &serde_json::Value) -> Yaml {
    match value {
        serde_json::Value::Null => Yaml::Null,
        serde_json::Value::Bool(b) => Yaml::Boolean(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Yaml::Integer(i)
            } else if let Some(u) = n.as_u64() {
                if u <= i64::MAX as u64 {
                    Yaml::Integer(u as i64)
                } else {
                    Yaml::Real(u.to_string())
                }
            } else if let Some(f) = n.as_f64() {
                Yaml::Real(format_yaml_float(f))
            } else {
                Yaml::Null
            }
        }
        serde_json::Value::String(s) => Yaml::String(s.clone()),
        serde_json::Value::Array(arr) => Yaml::Array(arr.iter().map(json_to_yaml).collect()),
        serde_json::Value::Object(obj) => {
            let mut h = YamlHash::new();
            for (k, v) in obj {
                h.insert(Yaml::String(k.clone()), json_to_yaml(v));
            }
            Yaml::Hash(h)
        }
    }
}

fn format_yaml_float(f: f64) -> String {
    if f.is_nan() {
        ".nan".to_string()
    } else if f.is_infinite() {
        if f.is_sign_positive() {
            ".inf".to_string()
        } else {
            "-.inf".to_string()
        }
    } else {
        let s = format!("{}", f);
        if s.contains('.') || s.contains('e') || s.contains('E') {
            s
        } else {
            format!("{}.0", s)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize, Debug, PartialEq)]
    struct TestFm {
        status: Option<String>,
        #[serde(default)]
        order: Option<f64>,
    }

    // --- parse ---------------------------------------------------------------

    #[test]
    fn parse_returns_data_and_body_for_valid_fm() {
        // gray_matter strips the trailing newline from body during parsing —
        // documented behaviour we depend on through the call chain.
        let content = "---\nstatus: todo\norder: 3\n---\nhello body\n";
        let (fm, body) = parse::<TestFm>(content);
        assert_eq!(
            fm,
            Some(TestFm {
                status: Some("todo".to_string()),
                order: Some(3.0),
            })
        );
        assert_eq!(body, "hello body");
    }

    #[test]
    fn parse_returns_none_when_no_frontmatter() {
        let content = "no frontmatter here";
        let (fm, body) = parse::<TestFm>(content);
        assert!(fm.is_none());
        assert_eq!(body, content);
    }

    #[test]
    fn parse_returns_none_for_empty_input() {
        let (fm, body) = parse::<TestFm>("");
        assert!(fm.is_none());
        assert_eq!(body, "");
    }

    #[test]
    fn parse_treats_unknown_keys_loosely() {
        // Extra fields not in TestFm are silently dropped by serde.
        let content = "---\nstatus: doing\norder: 1\nextra: ignored\n---\nbody\n";
        let (fm, _) = parse::<TestFm>(content);
        assert_eq!(fm.unwrap().status.as_deref(), Some("doing"));
    }

    #[test]
    fn parse_handles_missing_optional_field() {
        // `order` has #[serde(default)] in TestFm, so absence is fine.
        let content = "---\nstatus: blocked\n---\n";
        let (fm, _) = parse::<TestFm>(content);
        assert_eq!(
            fm,
            Some(TestFm {
                status: Some("blocked".to_string()),
                order: None,
            })
        );
    }

    #[test]
    fn parse_into_generic_json_value_works() {
        let content = "---\nstatus: x\nextra: {a: 1, b: [2, 3]}\n---\nbody";
        let (fm, _) = parse::<serde_json::Value>(content);
        let fm = fm.unwrap();
        assert_eq!(fm["status"], serde_json::json!("x"));
        assert_eq!(fm["extra"]["a"], serde_json::json!(1));
        assert_eq!(fm["extra"]["b"], serde_json::json!([2, 3]));
    }

    // --- update --------------------------------------------------------------

    #[test]
    fn update_modifies_existing_key() {
        let content = "---\nstatus: todo\n---\nbody\n";
        let updated = update(content, &[("status", serde_json::json!("done"))]);
        let (fm, body) = parse::<TestFm>(&updated);
        assert_eq!(fm.unwrap().status.as_deref(), Some("done"));
        // First-pass round trip loses the trailing newline (gray_matter strip)
        // but the body content is otherwise intact.
        assert_eq!(body, "body");
    }

    #[test]
    fn update_adds_new_key_when_missing() {
        let content = "---\nstatus: todo\n---\nbody\n";
        let updated = update(content, &[("order", serde_json::json!(5.0))]);
        let (fm, _) = parse::<TestFm>(&updated);
        let fm = fm.unwrap();
        assert_eq!(fm.status.as_deref(), Some("todo"));
        assert_eq!(fm.order, Some(5.0));
    }

    #[test]
    fn update_preserves_unrelated_fields() {
        let content = "---\nstatus: todo\nlabels:\n  - a\n  - b\n---\nbody\n";
        let updated = update(content, &[("status", serde_json::json!("done"))]);
        let (fm, _) = parse::<serde_json::Value>(&updated);
        let fm = fm.unwrap();
        assert_eq!(fm["labels"], serde_json::json!(["a", "b"]));
        assert_eq!(fm["status"], serde_json::json!("done"));
    }

    #[test]
    fn update_prepends_fm_when_missing() {
        let content = "just a plain body";
        let updated = update(content, &[("status", serde_json::json!("todo"))]);
        assert!(updated.starts_with("---\n"));
        assert!(updated.contains("status: todo"));
        assert!(updated.ends_with("just a plain body\n"));
    }

    #[test]
    fn update_applies_multiple_updates_in_order() {
        let content = "---\nstatus: todo\n---\nbody";
        let updated = update(
            content,
            &[
                ("status", serde_json::json!("done")),
                ("order", serde_json::json!(2.0)),
            ],
        );
        let (fm, _) = parse::<TestFm>(&updated);
        let fm = fm.unwrap();
        assert_eq!(fm.status.as_deref(), Some("done"));
        assert_eq!(fm.order, Some(2.0));
    }

    #[test]
    fn update_keeps_body_intact_on_status_change() {
        // Original repro for the bug fixed in ee55da7: updates must not
        // prepend an extra "---" or strip the inner body content. Multi-line
        // content (including blank lines) must survive, and the file must
        // remain newline-terminated.
        let original = "---\nstatus: todo\n---\nLine one.\n\nLine two.\n";
        let updated = update(original, &[("status", serde_json::json!("doing"))]);
        let body_start = updated.find("\n---\n").unwrap() + 5;
        assert_eq!(&updated[body_start..], "\nLine one.\n\nLine two.\n");
        // No stray extra "---" markers were prepended.
        assert_eq!(updated.matches("---").count(), 2);
    }

    #[test]
    fn update_always_ends_with_newline_even_if_input_did_not() {
        let content = "---\nstatus: todo\n---\nbody";
        let updated = update(content, &[("status", serde_json::json!("done"))]);
        assert!(
            updated.ends_with('\n'),
            "result must end with a newline: {updated:?}"
        );
        // And only one — no doubled blank line at EOF.
        assert!(!updated.ends_with("\n\n"));
    }

    #[test]
    fn update_preserves_single_trailing_newline_when_present() {
        let content = "---\nstatus: todo\n---\nbody\n";
        let updated = update(content, &[("status", serde_json::json!("done"))]);
        assert!(updated.ends_with('\n'));
        assert!(!updated.ends_with("\n\n"));
    }

    #[test]
    fn update_empty_body_still_ends_with_newline() {
        let content = "---\nstatus: todo\n---\n";
        let updated = update(content, &[("status", serde_json::json!("done"))]);
        assert!(updated.ends_with('\n'));
    }

    #[test]
    fn update_is_idempotent_on_subsequent_runs() {
        // Regression guard: gray_matter strips the trailing newline from body,
        // so without the trailing-newline guarantee the first update would
        // strip the body's "\n" and the second update would be a no-op diff.
        // With the fix the file is byte-stable after the first save.
        let content = "---\nstatus: todo\n---\nbody\n";
        let first = update(content, &[("status", serde_json::json!("doing"))]);
        let second = update(&first, &[("status", serde_json::json!("doing"))]);
        assert_eq!(first, second);
    }

    #[test]
    fn update_no_fm_branch_also_ends_with_newline() {
        // Force the "no frontmatter" branch by feeding malformed content. The
        // returned string still has to end with a newline.
        let content = "no frontmatter";
        let updated = update(content, &[("status", serde_json::json!("todo"))]);
        assert!(updated.ends_with('\n'));
    }

    // --- ensure_trailing_newline --------------------------------------------

    #[test]
    fn ensure_trailing_newline_adds_when_missing() {
        assert_eq!(ensure_trailing_newline("abc".to_string()), "abc\n");
    }

    #[test]
    fn ensure_trailing_newline_is_idempotent_when_present() {
        assert_eq!(ensure_trailing_newline("abc\n".to_string()), "abc\n");
    }

    #[test]
    fn ensure_trailing_newline_leaves_empty_alone() {
        // An empty string stays empty — we don't want to write a stray "\n"
        // file just because the input was empty.
        assert_eq!(ensure_trailing_newline(String::new()), "");
    }

    #[test]
    fn ensure_trailing_newline_does_not_collapse_existing_double_newline() {
        assert_eq!(ensure_trailing_newline("abc\n\n".to_string()), "abc\n\n");
    }

    // --- serialize -----------------------------------------------------------

    #[test]
    fn serialize_string_value() {
        let yaml = serialize(&serde_json::json!({"status": "todo"}));
        assert_eq!(yaml, "status: todo\n");
    }

    #[test]
    fn serialize_integer_value() {
        let yaml = serialize(&serde_json::json!({"order": 3}));
        assert_eq!(yaml, "order: 3\n");
    }

    #[test]
    fn serialize_date_like_string_roundtrips_as_string() {
        // A `YYYY-MM-DD` value must survive serialize → parse as the *string*
        // "2026-06-15", not get re-interpreted as a YAML date/timestamp scalar.
        // This pins the round-trip the task `date` field depends on.
        let yaml = serialize(&serde_json::json!({"date": "2026-06-15"}));
        let doc = format!("---\n{}---\n\nbody\n", yaml);
        let (fm, _) = parse::<serde_json::Value>(&doc);
        let fm = fm.unwrap();
        assert_eq!(fm["date"], serde_json::json!("2026-06-15"));
    }

    #[test]
    fn serialize_float_keeps_decimal() {
        let yaml = serialize(&serde_json::json!({"order": 3.5}));
        assert_eq!(yaml, "order: 3.5\n");
    }

    #[test]
    fn serialize_float_with_zero_fraction_gets_dot_zero_suffix() {
        // Without the .0 suffix, downstream YAML parsers would re-interpret as int.
        let yaml = serialize(&serde_json::json!({"order": 3.0}));
        assert_eq!(yaml, "order: 3.0\n");
    }

    #[test]
    fn serialize_null_value() {
        let yaml = serialize(&serde_json::json!({"x": null}));
        assert_eq!(yaml, "x: ~\n");
    }

    #[test]
    fn serialize_bool_value() {
        let yaml = serialize(&serde_json::json!({"flag": true}));
        assert_eq!(yaml, "flag: true\n");
    }

    #[test]
    fn serialize_array_value() {
        let yaml = serialize(&serde_json::json!({"labels": ["a", "b"]}));
        assert!(yaml.contains("labels:"));
        assert!(yaml.contains("- a"));
        assert!(yaml.contains("- b"));
    }

    #[test]
    fn serialize_nested_object_value() {
        let yaml = serialize(&serde_json::json!({"meta": {"k": "v"}}));
        assert!(yaml.contains("meta:"));
        assert!(yaml.contains("k: v"));
    }

    // --- format_yaml_float private function ----------------------------------

    #[test]
    fn format_yaml_float_handles_nan() {
        assert_eq!(format_yaml_float(f64::NAN), ".nan");
    }

    #[test]
    fn format_yaml_float_handles_infinities() {
        assert_eq!(format_yaml_float(f64::INFINITY), ".inf");
        assert_eq!(format_yaml_float(f64::NEG_INFINITY), "-.inf");
    }

    #[test]
    fn format_yaml_float_appends_dot_zero_when_integer_valued() {
        assert_eq!(format_yaml_float(0.0), "0.0");
        assert_eq!(format_yaml_float(1.0), "1.0");
        assert_eq!(format_yaml_float(-2.0), "-2.0");
    }

    #[test]
    fn format_yaml_float_preserves_fractional_form() {
        assert_eq!(format_yaml_float(1.5), "1.5");
        assert_eq!(format_yaml_float(0.1), "0.1");
        assert_eq!(format_yaml_float(-3.25), "-3.25");
    }

    // --- round-trip ----------------------------------------------------------

    #[test]
    fn update_then_parse_round_trip_preserves_order_float() {
        let content = "---\nstatus: todo\n---\nbody";
        let updated = update(content, &[("order", serde_json::json!(2.5))]);
        let (fm, _) = parse::<TestFm>(&updated);
        assert_eq!(fm.unwrap().order, Some(2.5));
    }

    #[test]
    fn update_then_parse_round_trip_preserves_integer_valued_float() {
        // The dot-zero suffix specifically guards against int re-interpretation.
        let content = "---\nstatus: todo\n---\nbody";
        let updated = update(content, &[("order", serde_json::json!(4.0))]);
        let (fm, _) = parse::<TestFm>(&updated);
        assert_eq!(fm.unwrap().order, Some(4.0));
    }

    // --- remove_keys --------------------------------------------------------

    #[test]
    fn remove_keys_removes_single_key() {
        let content = "---\nstatus: todo\ntags:\n  - a\n  - b\n---\nbody\n";
        let stripped = remove_keys(content, &["tags"]).unwrap();
        let (fm, _) = parse::<serde_json::Value>(&stripped);
        let fm = fm.unwrap();
        assert_eq!(fm["status"], serde_json::json!("todo"));
        assert!(fm.get("tags").is_none());
    }

    #[test]
    fn remove_keys_removes_multiple_keys() {
        let content = "---\nstatus: todo\norder: 3\ntags:\n  - a\n---\nbody\n";
        let stripped = remove_keys(content, &["tags", "order"]).unwrap();
        let (fm, _) = parse::<serde_json::Value>(&stripped);
        let fm = fm.unwrap();
        assert_eq!(fm["status"], serde_json::json!("todo"));
        assert!(fm.get("tags").is_none());
        assert!(fm.get("order").is_none());
    }

    #[test]
    fn remove_keys_is_noop_for_missing_key() {
        let content = "---\nstatus: todo\n---\nbody\n";
        let stripped = remove_keys(content, &["tags"]).unwrap();
        let (fm, _) = parse::<TestFm>(&stripped);
        assert_eq!(fm.unwrap().status.as_deref(), Some("todo"));
    }

    #[test]
    fn remove_keys_preserves_body() {
        let content = "---\nstatus: todo\ntags:\n  - x\n---\nLine one.\n\nLine two.\n";
        let stripped = remove_keys(content, &["tags"]).unwrap();
        let body_start = stripped.find("\n---\n").unwrap() + 5;
        assert_eq!(&stripped[body_start..], "\nLine one.\n\nLine two.\n");
    }

    #[test]
    fn remove_keys_no_fm_branch_is_noop() {
        let content = "no frontmatter here\n";
        let stripped = remove_keys(content, &["tags"]).unwrap();
        assert_eq!(stripped, content);
    }

    #[test]
    fn remove_keys_ends_with_newline() {
        let content = "---\nstatus: todo\ntags:\n  - a\n---\nbody";
        let stripped = remove_keys(content, &["tags"]).unwrap();
        assert!(stripped.ends_with('\n'));
    }

    #[test]
    fn remove_keys_errors_when_fm_marker_present_but_yaml_invalid() {
        // `---` prefix promises frontmatter, but the YAML body is garbage.
        // Returning Ok(content) silently would let a caller think the keys
        // were removed when they were not — must surface as Err.
        let content = "---\nstatus: todo\n   : : : invalid\n---\nbody\n";
        assert!(remove_keys(content, &["tags"]).is_err());
    }

    #[test]
    fn remove_keys_works_on_integer_and_string_values() {
        let content = "---\nstatus: todo\norder: 3\nlabel: foo\n---\nbody\n";
        let stripped = remove_keys(content, &["order", "label"]).unwrap();
        let (fm, _) = parse::<serde_json::Value>(&stripped);
        let fm = fm.unwrap();
        assert_eq!(fm["status"], serde_json::json!("todo"));
        assert!(fm.get("order").is_none());
        assert!(fm.get("label").is_none());
    }
}
