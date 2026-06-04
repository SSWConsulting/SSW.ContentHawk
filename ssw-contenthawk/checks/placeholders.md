---
id: placeholders
severity: high
enabled: true
---

Flag unfinished, placeholder, or accidentally-published scratch content. Look for:

- Authoring markers left in: `TODO`, `FIXME`, `TBD`, `XXX`, `WIP`, `???`, "write this later".
- Lorem ipsum or obvious filler text.
- Template placeholders that were never filled: `<your-name>`, `{{value}}`, `REPLACE_ME`,
  `your-org`, `example.com`, `INSERT ... HERE`, default starter copy.
- Empty or stub sections: a heading followed by nothing, "Coming soon", "Documentation pending".
- Debug/scratch leftovers: commented-out drafts, "test test", placeholder image captions.

These are high severity because they read as unfinished to end users. Each finding should quote the
placeholder and where it is. Don't flag legitimate uses (e.g. a code sample deliberately teaching
the `<your-name>` convention, or `example.com` used correctly as IANA's reserved example domain).
