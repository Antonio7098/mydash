# Standalone HTML export

The export engine converts a resolved artefact into one HTML file that works
directly through `file://`.

## Build sequence

```text
artefact HTML entry
    ↓
resolve theme, preset and UI dependencies
    ↓
bundle JavaScript with esbuild
    ↓
inline stylesheets and CSS imports
    ↓
convert referenced images, fonts and media to data URIs
    ↓
embed artefact data and asset directories
    ↓
inject a local fetch-compatible runtime
    ↓
validate that no resource dependencies remain
    ↓
write atomically
```

## Runtime contract

The generated file exposes:

```js
window.MyDash.export
window.MyDash.resources
window.MyDash.assetSlots
window.MyDash.embedded.get(path)
window.MyDash.embedded.has(path)
window.MyDash.embedded.keys()
```

Literal and computed `fetch()` calls for embedded artefact files are intercepted.
Unknown or external fetches are refused.

## HTML asset slots

An artefact may request a resolved asset mapping:

```html
<img data-mydash-asset="brand-logo" alt="Brand">
```

The export replaces the source with the selected asset's data URI.

## Restrictions

Standalone export rejects:

- external scripts, stylesheets, fonts, images and media;
- symbolic-link resources;
- missing files;
- iframe `src` resources;
- CSS import cycles;
- unresolved or incompatible appearance dependencies;
- outputs above the configured size limit.

Links in normal `<a href>` elements may still navigate to websites because they
are not load-time dependencies.

A restrictive Content Security Policy prevents network connections and external
resource loading after the file is opened.
