---
name: artifacts
description: Give HTML, SVG, Mermaid, and chart fences a stable id so a revision becomes the next version in the phone preview.
---

# Artifacts

When you write a fenced block the user can preview (`html`, `svg`, `mermaid`, or `chart`), put an id and a short title on the info line:

~~~
```html id=sales-dashboard title="Vendite"
```
~~~

Rules:

- Reuse the same id when you revise that artifact. A later block with the same id is the next version (v2, v3), not a new file.
- Use a new id for a different artifact.
- The id is lowercase letters, digits and hyphens, 2 to 64 characters, and it cannot start or end with a hyphen. Put the title in double quotes.
- Keep the artifact self-contained. No CDN scripts, no remote fonts, no secrets. Inline the styles and the data.
- A revision is the full updated block with the same id. The preview versions the whole block, so a patch fragment is not a version.
- The user can send "Correggi l'artefatto id" or "Modifica l'artefatto id" from the preview. Revise that id. Do not ask them to paste the code again when the block is already in the chat.
- If that message contains `Stessa prima riga, non un artefatto nuovo: \`svg id=name\``, the next block must use that exact info line. Do not invent another id and do not add a second artifact.

## Chart (Vega-Lite)

Use a `chart` fence (or `vega-lite` / `vegalite`; same artifact kind). The body is one Vega-Lite JSON object. Data must be inline under `data.values`. No `data.url`, no image URLs, no CDN, no secrets.

```chart id=sales title="Vendite"
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "data": { "values": [{ "month": "Jan", "sales": 28 }] },
  "mark": "bar",
  "encoding": {
    "x": { "field": "month", "type": "ordinal" },
    "y": { "field": "sales", "type": "quantitative" }
  }
}
```

A later block with the same id is the next version.
