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
