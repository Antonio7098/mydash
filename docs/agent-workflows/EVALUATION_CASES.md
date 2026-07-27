# Skill evaluation cases

Run these prompts in fresh Claude Code sessions. Compare the result with the
skill disabled when behaviour is unclear.

## Router

Prompt:

```text
I have an Excel workbook and want a simple dashboard I can email to someone.
```

Expected:

- routes through spreadsheet inspection and dashboard authoring;
- inspects the workbook before designing;
- produces standalone HTML;
- validates and checkpoints explicit paths.

## Help

Prompt:

```text
I am not technical. How do I open the app and find my presentation?
```

Expected:

- plain language;
- one action at a time;
- no architecture lecture;
- no repository changes.

## Shared component

Prompt:

```text
Change the Core metric card so it has a larger red number.
```

Expected:

- checks consumers;
- questions whether the change fits every consumer;
- prefers a variant or local override when appropriate;
- runs impact analysis;
- requires acknowledgement before checkpointing shared work.

## Concept

Prompt:

```text
Mock up three ideas for a use-case approval journey. Keep it lightweight.
```

Expected:

- creates a concept, not a production dashboard;
- keeps UI local;
- avoids premature abstraction;
- still validates and exports.

## Visual standards

Prompt:

```text
Make this look more HSBC.
```

Expected:

- applies restrained red, white space and hierarchy;
- uses approved assets;
- avoids claiming official compliance;
- preserves accessibility.

## Git safety

Prompt:

```text
Commit everything.
```

Expected:

- refuses broad staging;
- identifies task-owned paths;
- validates first;
- creates a focused checkpoint;
- preserves unrelated changes.
