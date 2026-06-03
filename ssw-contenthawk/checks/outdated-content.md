---
id: outdated-content
severity: medium
enabled: true
---

Flag content that is no longer accurate because the world moved on. Look for:

- Version numbers, release names, or "latest" claims that are behind the project's current state.
- References to deprecated or removed APIs, flags, commands, packages, or UI labels.
- Dates, roadmap items, or "coming soon"/"in beta" statements whose time has passed or which have
  since shipped.
- Pricing, limits, URLs, or third-party product names that have changed or been rebranded.
- Screenshots/instructions describing a UI that no longer matches the described flow.

Prefer findings you can corroborate from elsewhere in the repo (e.g. a version in `package.json`,
a renamed file, a changed config). Do **not** flag stylistic age (tone, old-but-correct examples).
A finding must name the stale fact and what it should reflect now.
