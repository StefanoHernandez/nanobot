# PL-A: prompt library, app side (owner: agy)

Branch `agy/PL-A`, from `main`. Start it only after MD-A or CO-A is merged (one free worktree).

## Read first
- `nanobot/ext/prompts.py`: the server API (read-only for you).
- `mobile/docs/agy/README.md` and `mobile/docs/design/companion.md`.
- `src/extras/approvals.ts`: copy its fetch pattern and its generation + profile guard.
- `src/screens/thread/Composer.tsx` and `src/screens/projects/ProjectDetailScreen.tsx`.

## Server API (already built)
- `GET /api/ext/prompts` returns global prompts only. `GET /api/ext/prompts?project=<id>` returns the global prompts plus that project's.
  - Shape: `{ prompts: [{ id, title, body, project_id | null, variables: ["name"], created_at, updated_at, used_at | null }] }`.
  - Order: most recently used or edited first.
- `POST /api/ext/prompts/save` takes `{ id?, title, body, project_id?: string | null }` and returns `{ prompt }`. Without `id` it creates a prompt.
  - 400 `invalid_*` / `missing_*`; 404 for an unknown id; 409 `too_many_prompts` (limit 500).
  - Limits: title 120 chars, body 20 000.
- `POST /api/ext/prompts/delete` takes `{ id }`. `POST /api/ext/prompts/used` takes `{ id }`.
- Placeholders are `{{name}}`, where the name is letters, digits, `_` or space and starts with a letter or `_`. The server lists them in `variables`.

## Build
1. **`src/extras/prompts.ts`**:
   - `listPrompts(projectId?)`, `savePrompt`, `deletePrompt` and `markUsed`;
   - a pure `fillPrompt(body, values)` that replaces every `{{ name }}` (spaces inside the braces allowed) and leaves unknown names untouched;
   - the generation and profile guard, with data cleared on profile switch.
2. **Composer button.** Add an `IconButton` (`text-box-multiple-outline`, label `prompts.open`) in `Composer.tsx` `toolsRow`, after the paperclip. It opens **`src/extras/PromptPickerSheet.tsx`**:
   - the project is the one whose `path` equals the chat's `workspaceScope.project_path` (the same match `ProjectDetailScreen` uses); with no match, global prompts only;
   - a search field that filters title and body client-side;
   - each row shows the title, the first body line and a "Progetto" chip on project prompts;
   - tapping a prompt with no variables puts its body into the draft. If the draft is not empty, append it after a blank line. **Never send automatically**;
   - with variables, it shows one `TextField` per variable, then "Inserisci". The filled text goes into the draft;
   - after inserting, call `markUsed` (fire and forget, errors ignored) and close the sheet;
   - long-press, or a ⋯ button, opens edit;
   - the empty state is `prompts.empty` plus a "Nuovo prompt" button;
   - the footer has "Nuovo prompt" and "Salva bozza come prompt" (the second is enabled only when the draft is non-empty, and prefills the body).
3. **Editor `src/extras/PromptEditorSheet.tsx`:**
   - fields: title, a multiline body (mono font) and a scope switch "Solo questo progetto" (shown only when a project is known);
   - below the body, a live list of the detected variables;
   - Save, plus Delete behind a confirm `Dialog`;
   - map server errors to i18n: `prompts.tooMany`, `common.operationFailed`. Never show raw `err.message`.
4. **Settings → new section `prompts` ("Prompt")** in `SECTIONS` after `capabilities`, with icon `text-box-multiple-outline`. It lists **global** prompts with create, edit and delete through the same editor.
5. **Project detail:** a "Prompt" section in `ProjectDetailScreen.tsx` that lists that project's prompts (`project_id === id`), with create (pre-scoped to the project), edit and delete.
6. i18n keys go in both `it.json` and `en.json`. Use theme tokens and `th.font.*`, no `fontWeight`, touch targets ≥ 48dp.

## Tests (write first, no mocking of the sheets or the store)
- `fillPrompt`: multiple and repeated variables, spaces inside the braces, an unknown name left untouched, `$&` in a value inserted literally.
- The picker in a project chat requests `?project=<id>`. A chat with no project requests the global list.
- Search filters the list.
- Picking with no variables appends to a non-empty draft after a blank line, and nothing is sent. Picking with variables fills them, and `/used` is posted.
- "Salva bozza come prompt" prefills the body.
- The editor shows the detected variables live. Save posts the right body, including `project_id` when the scope switch is on. Delete asks for confirm.
- A 409 shows `prompts.tooMany`. A network error shows `common.operationFailed`.
- The settings section shows only global prompts. The project section shows only that project's.
- A profile switch mid-request drops the stale result.

## Done when
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest` and `npx tsc --noEmit` are green.
- No edits to `mobile/vendor/**` or to server Python.
- Commit `feat(mobile): prompt library`.
- Report in `mobile/docs/agy/reports/PL-A.md`. Say nothing was run on a device or against a live server.
