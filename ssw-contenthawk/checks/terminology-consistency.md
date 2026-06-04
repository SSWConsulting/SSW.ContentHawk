---
id: terminology-consistency
severity: low
enabled: true
---

Flag inconsistent naming for the same concept across the content. Look for:

- A product/feature/component referred to by multiple names or spellings/casings
  (e.g. "TinaCMS" vs "Tina CMS" vs "tinacms"; "sign in" vs "log in" vs "login").
- Inconsistent capitalization of defined terms, headings, or UI labels.
- Mixed terms for the same action or object in a procedure (e.g. "post" vs "article" vs "entry").
- Acronyms expanded differently in different places, or expanded inconsistently with their use.

Where the repo or config implies a canonical form (e.g. the actual package name, a brand in a
settings file), prefer that as the standard and flag deviations from it. Group occurrences of the
same inconsistency into one finding with the variants and the suggested canonical term. Don't flag
genuinely distinct concepts that merely look similar.
