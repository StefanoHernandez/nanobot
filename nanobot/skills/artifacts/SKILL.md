---
name: artifacts
description: Give HTML, SVG, Mermaid, chart, geojson map, and jsx/tsx React fences a stable id so a revision becomes the next version in the phone preview.
---

# Artifacts

When you write a fenced block the user can preview (`html`, `svg`, `mermaid`, `chart`, `geojson`, `jsx`, or `tsx`), put an id and a short title on the info line:

~~~
```html id=sales-dashboard title="Vendite"
```
~~~

Rules:

- Reuse the same id when you revise that artifact. A later block with the same id is the next version (v2, v3), not a new file.
- Use a new id for a different artifact.
- The id is lowercase letters, digits and hyphens, 2 to 64 characters, and it cannot start or end with a hyphen. Put the title in double quotes.
- Keep the artifact self-contained. No CDN scripts, no remote fonts, no secrets. Inline the styles and the data.
- Prefer CSS theme variables (`--nb-bg`, `--nb-fg`, `--nb-card`, `--nb-muted`, `--nb-border`, `--nb-primary`, `--nb-primary-fg`, `--nb-radius`, `--nb-font`) and the `.nb-card` class over hard-coded colors so artifacts adapt to light and dark themes.
- A revision is the full updated block with the same id. The preview versions the whole block, so a patch fragment is not a version.
- The user can send "Correggi l'artefatto id" or "Modifica l'artefatto id" from the preview. Revise that id. Do not ask them to paste the code again when the block is already in the chat.
- If that message contains `Stessa prima riga, non un artefatto nuovo: \`svg id=name\`` (in English: `Same first line, not a new artifact: \`svg id=name\``), the next block must use that exact info line. Do not invent another id and do not add a second artifact.

## Theme and styling (HTML and React)

The preview shell injects CSS variables matching the app's theme (`--nb-bg`, `--nb-fg`, `--nb-card`, `--nb-muted`, `--nb-border`, `--nb-primary`, `--nb-primary-fg`, `--nb-radius`, `--nb-font`) and a `.nb-card` container class. Base elements (`body`, `button`, `input`, `select`, `table`, `a`, `code`) are pre-styled. Prefer these variables over hard-coded colors:

```html id=summary-card title="Riepilogo"
<div class="nb-card">
  <h2 style="color: var(--nb-primary); margin-top: 0;">Riepilogo</h2>
  <p style="color: var(--nb-fg);">Dati sincronizzati con il tema dell'app.</p>
  <button>Aggiorna</button>
</div>
```

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

## Map (GeoJSON)

Use a `geojson` fence. The body is one GeoJSON object (`Feature`, `FeatureCollection`, or a geometry type). Coordinates and properties are inline. No `url` or `href` fields. Map tiles load only after the user allows network for that preview.

```geojson id=places title="Luoghi"
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "geometry": { "type": "Point", "coordinates": [12.5, 41.9] }, "properties": { "name": "Roma" } },
    { "type": "Feature", "geometry": { "type": "Point", "coordinates": [9.19, 45.46] }, "properties": { "name": "Milano" } }
  ]
}
```

A later block with the same id is the next version.

## React (jsx / tsx)

Use a `jsx` or `tsx` fence. The body defines `function App()` and returns JSX. No `import`, no `require`, no `export`, no CDN. Remote `fetch` and images need the user to allow network for that preview.

```jsx id=hello title="Saluto"
function App() {
  return <h1>Ciao</h1>;
}
```

A later block with the same id is the next version.

## Mini app

HTML and React artifacts can access `window.nanobot` to persist state and interact with the chat. Always check `if (window.nanobot)` before calling, because exports omit the bridge.

- `await window.nanobot.state.get()`: returns the saved JSON for this artifact, or `null`.
- `await window.nanobot.state.set(value)`: saves JSON state up to 64 KB. Writes are debounced by the app (<= 1 write / 500 ms).
- `await window.nanobot.send(text)`: asks user confirmation to send a message (up to 4000 characters) to the source chat. Resolves `true` if sent, `false` otherwise.

```html id=checklist title="Lista della spesa"
<div class="nb-card">
  <h3>Lista</h3>
  <label><input type="checkbox" id="item1" onchange="save()"> Latte</label><br>
  <label><input type="checkbox" id="item2" onchange="save()"> Pane</label><br><br>
  <button onclick="finish()">Ho finito la lista</button>
</div>
<script>
  if (window.nanobot) {
    window.nanobot.state.get().then(function(d) {
      if (d) {
        document.getElementById("item1").checked = !!d.item1;
        document.getElementById("item2").checked = !!d.item2;
      }
    });
  }
  function save() {
    if (window.nanobot) {
      window.nanobot.state.set({
        item1: document.getElementById("item1").checked,
        item2: document.getElementById("item2").checked
      });
    }
  }
  function finish() {
    if (window.nanobot) {
      window.nanobot.send("Ho finito la lista");
    }
  }
</script>
```

