# Agent workflow

Project skills live under `.claude/skills/`.

Recommended flow:

```text
Inspect source material
→ choose artefact type
→ reuse Core where suitable
→ create new UI locally
→ validate
→ preview
→ export
→ checkpoint significant changes
```

Skills provide judgement; the `mydash` CLI provides deterministic capability. Agents should not maintain parallel indexes or bypass the filesystem contracts.
