use serde::{Serialize, Serializer};
use std::fmt;

#[derive(Debug)]
pub enum CommandError {
    NoWorkspace,
    AccessDenied,
    EmptyTitle,
    DuplicateTask,
    MissingFrontmatter,
    Io(std::io::Error),
    Other(String),
}

impl CommandError {
    pub fn other(e: impl fmt::Display) -> Self {
        Self::Other(e.to_string())
    }
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoWorkspace => write!(f, "No directory selected"),
            Self::AccessDenied => write!(f, "Access denied"),
            Self::EmptyTitle => write!(f, "Title cannot be empty"),
            Self::DuplicateTask => write!(f, "A task with this title already exists"),
            Self::MissingFrontmatter => write!(f, "No frontmatter"),
            Self::Io(e) => write!(f, "{e}"),
            Self::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for CommandError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

pub type CmdResult<T> = Result<T, CommandError>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    #[test]
    fn display_matches_legacy_messages() {
        assert_eq!(CommandError::NoWorkspace.to_string(), "No directory selected");
        assert_eq!(CommandError::AccessDenied.to_string(), "Access denied");
        assert_eq!(CommandError::EmptyTitle.to_string(), "Title cannot be empty");
        assert_eq!(
            CommandError::DuplicateTask.to_string(),
            "A task with this title already exists"
        );
        assert_eq!(CommandError::MissingFrontmatter.to_string(), "No frontmatter");
        assert_eq!(
            CommandError::Other("boom".into()).to_string(),
            "boom"
        );
    }

    #[test]
    fn display_io_delegates_to_inner() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "missing thing");
        let expected = io_err.to_string();
        let err = CommandError::Io(io_err);
        assert_eq!(err.to_string(), expected);
    }

    #[test]
    fn serialize_emits_plain_string_for_wire_compat_io_variant() {
        let io_err = std::io::Error::other("nope");
        let inner_msg = io_err.to_string();
        let json = serde_json::to_string(&CommandError::Io(io_err)).unwrap();
        assert_eq!(json, format!("\"{}\"", inner_msg));
    }

    #[test]
    fn serialize_emits_plain_string_for_wire_compat() {
        let json = serde_json::to_string(&CommandError::AccessDenied).unwrap();
        assert_eq!(json, "\"Access denied\"");

        let json = serde_json::to_string(&CommandError::NoWorkspace).unwrap();
        assert_eq!(json, "\"No directory selected\"");
    }

    #[test]
    fn from_io_error_wraps_into_io_variant() {
        let io_err = std::io::Error::other("x");
        let err: CommandError = io_err.into();
        assert!(matches!(err, CommandError::Io(_)));
    }

    #[test]
    fn other_constructor_stores_display_value() {
        let err = CommandError::other("hello");
        assert!(matches!(err, CommandError::Other(ref s) if s == "hello"));

        // Accepts anything that impls Display, not just &str.
        let err = CommandError::other(42);
        assert!(matches!(err, CommandError::Other(ref s) if s == "42"));
    }

    #[test]
    fn source_returns_inner_io_error_only() {
        let io_err = std::io::Error::other("boom");
        let err = CommandError::Io(io_err);
        assert!(err.source().is_some());

        assert!(CommandError::AccessDenied.source().is_none());
        assert!(CommandError::Other("x".into()).source().is_none());
    }

    #[test]
    fn cmd_result_can_propagate_io_via_question_mark() {
        fn op() -> CmdResult<()> {
            let _ = std::fs::read_to_string("/definitely/not/a/real/path/cork-test")?;
            Ok(())
        }
        let result = op();
        assert!(matches!(result, Err(CommandError::Io(_))));
    }
}
