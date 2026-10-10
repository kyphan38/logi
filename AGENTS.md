# Agent instructions (logi)

## Git: no co-author

Never add `Co-Authored-By:` (or any other author line) to a commit message
or a PR description. Git already records the author.

## Writing: no em dash

Never write the em dash `—` (U+2014), and never its escapes `&mdash;`,
`&#8212;` or `\u2014`. This covers everything: code, comments, UI text,
docs, commit messages and AI prompts.

Use a plain hyphen with spaces (` - `), a comma, a colon, or two short
sentences instead.

## Language: English in code

Write code comments, test names, assert messages, script logs and AI prompts
in plain English. Keep comments short: say why, not the history.

Vietnamese is fine only in: PLAN-*.md, roadmap/ and docs/ files; test data
or parsers that handle real Vietnamese text; proper names.

## UI copy: as little as possible

- If the title already says it, add no description.
- Otherwise one short line, about 10 words or less.
- No reasons or history in the UI. Put those in a code comment.
- Exception: in-app guide pages (none in logi yet).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
