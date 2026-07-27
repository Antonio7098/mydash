---
name: "HSBC Visual Standards"
description: "Applies the project’s restrained HSBC-inspired visual language, approved-asset discipline and accessibility rules. Use for dashboards, presentations, concepts, components and the navigator."
argument-hint: "[artefact or visual request]"
---

Apply the request in `$ARGUMENTS`. These are project defaults, not a substitute
for an official internal brand manual.

## Rules

- Use approved repository assets.
- Use red selectively, not as decoration everywhere.
- Preserve a white, spacious and precise visual character.
- Establish hierarchy before adding effects.
- Keep charts purposeful and labelled.
- Do not encode meaning by colour alone.
- Maintain keyboard support, focus visibility and readable contrast.
- Respect reduced motion.
- Do not redraw the HSBC mark from memory or extract it from screenshots.
- Do not claim official brand approval or compliance without an approved source.
- When official internal guidance is supplied, treat it as authoritative over
  this project default.

Use `/component` when the visual request affects a shared resource.

## Character and palette

Aim for calm, precise, professional, restrained, spacious and trustworthy.
Avoid decorative excess, novelty dashboards and dense control-room styling.
Use `#DB0011` as a selective primary accent on a white canvas, near-black
primary text, restrained neutral-grey secondary text and pale-grey borders.
Never turn every heading, card or metric red or use colour as the only status
carrier.

Prefer a clean system sans-serif unless an approved font exists. Use few sizes
and weights, obvious hierarchy, readable copy, no all-caps paragraphs and no
excessive letter spacing.

Use generous whitespace and a consistent grid. Keep primary actions obvious,
prefer a few strong groups over many bordered cards, use solid information
surfaces and reserve translucency for lightweight navigation/framing. Let
content determine card size.

## Artefact guidance

Dashboards lead with the decision, put the most important summary first, use
charts only for meaningful comparison/distribution/trend/relationship, include
units/dates/source context and intentionally handle empty/loading/error states.

Presentations use one primary idea per slide, short declarative titles, evidence
and diagrams instead of paragraphs, minimal repeated chrome and a narrative
from context through implication to action.

The Navigator remains minimal: white canvas, approved small top-left mark,
compact expandable navigation, category selector near the top centre,
miniature previews, solid title/action panels, restrained glass only on preview
mounts and no heavy application header.

## Accessibility and assets

Use semantic landmarks/headings, readable contrast, keyboard navigation,
visible focus, text alternatives, reduced-motion support, usable touch targets
and narrow/wide viewport tests. Essential information must not depend on hover.

Use approved repository assets. Never redraw a mark, extract logos from
screenshots or invent brand graphics. If no approved asset exists, use a
neutral placeholder and state what is required. `mydash-brand-mark` is an
approved project fallback for internal prototypes, not an HSBC logo; never
describe it as one.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
5. Report validation, commit, push and remaining obstacles honestly.
