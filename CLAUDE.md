@AGENTS.md

## Claude Code

- The agent-guardrails plugin provides the approval hooks (git commit/push, destructive commands, external writes), Prettier-on-edit, the `final-reviewer` agent, and the `epic-planning` and `coding-standards` skills; none of these are copied into this repo, and this repo's own docs take precedence over `coding-standards`
- Prettier-on-edit runs the repo's installed Prettier, and this repo has no Prettier config, so edited `.ts` files are rewritten with Prettier's defaults (double quotes, unlike most of the code). See "Legacy And Intentional Inconsistencies" in `docs/CODING_STANDARDS.md`
- Area rules: `.claude/rules/` (see the Code Style table in `AGENTS.md`)
- Slash commands: `.claude/commands/` holds five user-invoked audits that write to `reports/`. They inline `.claude/snippets/project-context.md` (a summary of `AGENTS.md`) and `.claude/snippets/report-format.md`
- `.mcp.json` configures the Cloudflare Bindings and Observability MCP servers; the Cloudflare "Ask before" boundary in `AGENTS.md` applies to every call through them
