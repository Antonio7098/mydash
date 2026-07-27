# Agent workflow

Active project skills and their complete workflow guidance live under
`.claude/skills/`. This page is an orientation guide for contributors, not an
instruction dependency for the skills.

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

Skills provide judgement; the `mydash` CLI provides deterministic capability.
Agents should not maintain parallel indexes or bypass the filesystem
contracts. See the authoritative [CLI reference](cli-reference.md) and
[HTTP API reference](api-reference.md) for exact interfaces.
