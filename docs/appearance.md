# Appearance

The viewer exposes three scopes:

- **Preview only**: temporary and encoded in the preview URL
- **Personal**: stored in browser localStorage for one artefact
- **Artefact default**: updates `artifact.json`, validates, creates a focused Git checkpoint and pushes safely when possible

Theme and preset are the main choices. Layout, component, primitive and asset slot overrides are advanced controls.

Artefact-default changes require a Git repository, a current workspace revision and a clean target manifest. Browsing, personal preferences and temporary previews do not require Git.
