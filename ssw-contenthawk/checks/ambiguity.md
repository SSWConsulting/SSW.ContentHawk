---
id: ambiguity
severity: low
enabled: true
---

Flag content a reader could reasonably misinterpret or be unable to act on. Look for:

- Vague instructions: "configure it appropriately", "the usual way", "somewhere in settings" — with
  no concrete path, value, or command.
- Undefined pronouns or referents: "it", "this", "that file", "the above" where the antecedent is
  unclear.
- Unexplained jargon, acronyms, or product-specific terms used before they're defined.
- Missing prerequisites or steps: a procedure that assumes state the reader hasn't been told to set
  up, or jumps between steps.
- Ambiguous ordering or conditionals: "you may want to…", "optionally…", without saying when it
  applies.

Each finding should quote the ambiguous phrase and state the specific question a reader would be
left asking. Do not flag intentional brevity that is still unambiguous.
