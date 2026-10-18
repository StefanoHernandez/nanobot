# SK-A: proposed skills — the bot suggests, the user activates (owner: agy)

Branch `agy/SK-A`, from `origin/main`, **in your own worktree**. Follow `mobile/docs/agy/README.md`, including the checks it always requires (full pytest: server files change). Server logic in a **fork file** `nanobot/ext/skill_proposals.py`; upstream files get only one-line commented hooks. Six agy sessions run in parallel this round: in the app, touch only the skills screens, the thread menu entry and i18n.

## The idea
The bot learns **procedures**, not just facts: after a complex job it can write a reusable skill (`SKILL.md`). For safety a skill is **never activated automatically**: a skill is an instruction the agent re-reads forever, so a skill written after reading a hostile web page would make that page's instructions permanent. The bot only **proposes**; the user reads the proposal in the app and activates it.

## 1. Storage
- Active workspace skills live in `<workspace>/skills/<name>/SKILL.md` (`nanobot/agent/skills.py:50`).
- Proposals live in `<workspace>/skills-proposed/<name>/SKILL.md` plus `proposal.json`: `{ "name", "summary" (what it does, 1-2 lines), "reason" (why it was proposed: which chat or which pattern), "source": "chat" | "scout", "session_key"?, "created_at" }`.
- `skills-proposed/` is **not** read by the skills loader, so a proposal never reaches the agent's context. Check that nothing in `nanobot/agent/skills.py` scans sibling folders.
- Names: same validation as installed skills (lowercase, digits, `-`, ≤ 64). On a clash with an active skill, the proposal is an **update** of it (`proposal.json` gets `"updates": "<name>"`), shown as such in the app.

## 2. Two ways to create a proposal
1. **From a chat (manual):** thread menu → **"Crea skill da questa chat"**. Server route `POST /api/ext/skills/propose {session_key}` runs one ephemeral agent turn (like the journal's `agent_turn`, `nanobot/ext/journal.py`: own session key `skillprop:<ts>`, no delivery, pruned after) with a fixed prompt: read that chat (pass its visible messages, capped), decide if it contains a reusable procedure, and if so write `SKILL.md` following the format of `nanobot/skills/skill-creator/SKILL.md` + the `summary`/`reason`. Return the proposal, or `{ "proposal": null, "reason": "…" }` when there is nothing reusable.
2. **Scout (automatic, proposals only):** a nightly system cron job `skill-scout`, registered like the journal job (`sync_journal_job` in `journal.py`, hook in `nanobot/cli/gateway_runtime.py` next to the journal one). It reads the new `memory/history.jsonl` entries since its own cursor (`skills-proposed/.cursor`), looks for repeated or hard-won procedures, and writes at most **2** proposals per night. Off by default; a switch in the app turns it on (`GET/POST /api/ext/skills/scout` settings, stored next to the proposals).
- Both write **only** into `skills-proposed/`. The agent turn gets no tool that can write elsewhere: give it a single `write_proposal(name, summary, reason, content)` tool, not the general file tools.

## 3. Routes (same auth as the other ext routes)
- `GET /api/ext/skills/proposals` → list with summary, reason, source, date, `updates`.
- `GET /api/ext/skills/proposals/<name>` → full `SKILL.md` text.
- `POST /api/ext/skills/proposals/<name>/activate` → move to `skills/<name>/` (replace on `updates`, keeping the old one as `skills/<name>/SKILL.md.bak`). Requires `privileged_request` like other host-changing actions (see FX-A, `nanobot/ext/devices.py:449`).
- `POST /api/ext/skills/proposals/<name>/reject` → delete the proposal.
- `POST /api/ext/skills/propose` (§2.1).

## 4. App
- **Skills screen** (`src/screens/ecosystem/skills/SkillsScreen.tsx`): a section **"Proposte dal bot"** above the installed list, only when there are proposals. Each row: name, a "Proposta" badge (or "Aggiornamento" for `updates`), the summary, the reason in muted text, the date.
- **Proposal detail** (reuse `SkillDetailSheet.tsx` or a sibling): full `SKILL.md` rendered as markdown, the reason, buttons **"Attiva"** and **"Scarta"**. After Attiva the skill appears in the installed list with the others.
- **Thread menu:** "Crea skill da questa chat" → spinner → toast "Proposta creata: {name}" (tap opens it) or "Niente da salvare come skill: {reason}".
- **Scout switch** in the Skills screen header menu or settings: "Proponi skill ogni notte".
- i18n `it`/`en`. Tests: section hidden with no proposals; activate and reject call the routes and refresh; the update badge; the thread menu action and both toasts.

## 5. Server tests (`tests/ext/test_skill_proposals.py`, `tmp_path`, fake agent turn)
- A proposal is written only under `skills-proposed/`; the skills loader does not list it.
- Activate moves it; on `updates` the old file is kept as `.bak`; activate without privilege → 403.
- Reject deletes; invalid names rejected; path traversal (`../`) rejected.
- The scout respects its cursor and the 2-per-night cap; disabled by default.
- `propose` with a chat that has nothing reusable returns `proposal: null`.

## Checks
- `.venv/bin/python -m pytest -p no:cacheprovider tests` (known failures in the README).
- `.venv/bin/ruff check` and `.venv/bin/basedpyright` on the touched Python files.
- `cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest && npx tsc --noEmit`
- `cd mobile && npx expo export --platform android --output-dir /tmp/nb-export`

## Do not
- Activate anything automatically. Give the proposal turn general file or shell tools. Add dependencies. Edit `mobile/vendor/**`. Import `@react-navigation/*`.

## Report
`mobile/docs/agy/reports/SK-A.md`: files, tests, the prompt you used, deviations, what needs the arduino or a phone to check.

Commit, push `agy/SK-A`, and give the last hash. Do not merge.
