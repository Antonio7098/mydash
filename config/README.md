# Workspace configuration

Configuration is file-based and version-controlled.

`user` identifies the current workspace user. Artefact-aware CLI commands
scope to it by default, and each schema-version-2 artefact manifest must declare
its own `user`. This is a local organisational boundary, not authentication.

JSON schemas are added by Bootstrap 03. No manually maintained dashboard index will be stored here; artefacts are discovered from the filesystem.
