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
/// containing only `updates` is prepended.
pub fn update(content: &str, updates: &[(&str, serde_json::Value)]) -> String {
    let matter = Matter::<YAML>::new();
    match matter.parse::<serde_json::Value>(content) {
        Ok(entity) => {
            let body = entity.content.trim_start_matches(['\n', '\r']);
            let mut data = entity.data.unwrap_or(serde_json::json!({}));
            if let Some(obj) = data.as_object_mut() {
                for (key, value) in updates {
                    obj.insert(key.to_string(), value.clone());
                }
            }
            let yaml = serialize(&data);
            format!("---\n{}---\n{}", yaml, body)
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
    }
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
