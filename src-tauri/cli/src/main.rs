use clap::Parser;

/// Cork — Kanban board for local Markdown files.
#[derive(Parser)]
#[command(name = "cork", version = env!("CORK_VERSION"), about, long_about = None)]
struct Cli {}

fn main() {
    Cli::parse();
    // Skeleton only — subcommands will be added in a later change.
    println!("cork {} — CLI skeleton.", env!("CORK_VERSION"));
}
