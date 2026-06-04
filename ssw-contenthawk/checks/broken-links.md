---
id: broken-links
severity: medium
enabled: true
---

Flag links and references that no longer resolve. Look for:

- Internal links to files, pages, or anchors that don't exist in the repo (relative paths,
  `#heading` anchors that don't match any heading, moved/renamed docs).
- Image/asset references whose target file is missing.
- External URLs that are obviously dead (placeholder domains, `example.com` left in real content,
  `localhost`, links to repos/pages known to be moved or archived).
- Markdown link syntax errors: empty `()`, mismatched brackets, `[text]` with no definition.

For internal targets, verify against the actual repo contents. For external URLs, flag the clearly
broken/placeholder ones; do not assume a live-looking URL is dead without evidence. Each finding
should give the link text, the target, and why it fails.
