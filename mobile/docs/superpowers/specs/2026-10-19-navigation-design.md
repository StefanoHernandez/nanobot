# App navigation: clear names, one place per setting

Status: approved in chat with Stefano, 2026-10-19. Applies to the Android app and the web app (same code in `mobile/`). Server unchanged.

## Goal
Every entry says what it contains, and every setting lives in exactly one place. Today: approvals sit in "Aspetto", devices in "Informazioni", restart in both "Sistema" and "Macchina", optional packages in both "Sistema" and Ecosistema → App → "Plugin", and "Sistema"/"Avanzate" are two halves of the same configuration.

## Rules
1. One setting, one place. No duplicates.
2. The group says who it is about: the bot, security, spending, the server, this phone.
3. Security collects everything that protects the server; the "serve pieno controllo" lock appears there.
4. Optional server packages (pyproject extras) appear next to the feature they unlock, with their install button. No "Plugin" list. A package the app does not know (new upstream extra) appears in Avanzate → "Altri componenti", so nothing disappears after an upstream sync.
5. Every list entry has a subtitle that says what is inside.
6. Server APIs do not change. This is a client-only reorganisation, so it does not affect the upstream sync.

## Settings
```
Impostazioni
├─ Panoramica            spending today, bot state, journal, kanban
├─ BOT
│   ├─ Modelli           providers, chat model, task models (+ azure, bedrock)
│   ├─ Funzioni          images, voice, web search (+ olostep), documents and PDF (+ documents, pdf), memory
│   ├─ Prompt            saved prompts
│   └─ Comportamento     runtime groups identity, sessions, tools, execution, chat
├─ SICUREZZA
│   └─ Sicurezza         command approvals · devices and full power · runtime groups shell, safety · network safety card
├─ SPESA
│   └─ Costi
├─ SERVER
│   ├─ Stato del server  machine stats, recent errors, one restart, apply state, config path (Macchina + Sistema)
│   ├─ Backup
│   └─ Avanzate          runtime groups gateway, api, cli; "Altri componenti" (api, langfuse, unknown extras)
└─ QUESTO TELEFONO
    ├─ App               language, look, sounds, notifications, background connection, battery, lock, voice replies
    └─ Informazioni      version, connected server, change server
```
Section ids: `overview`, `models`, `features` (was `capabilities`), `prompts`, `behavior` (new), `security` (new), `costs`, `server` (was `system` + `machine`), `backup`, `advanced`, `app` (was `appearance`), `about`. Old ids redirect to the new ones (`/settings/machine` → `server`, etc.) so existing links keep working.

Runtime field pages are assigned in one table (`src/settings/runtimeFields.ts`, `GROUPS`); the move is a change of that table plus the screens that render each page.

Package → place: `azure`, `bedrock` → Modelli; `olostep` → Funzioni (web search); `documents`, `pdf` → Funzioni (documents); `api`, `langfuse`, anything else → Avanzate "Altri componenti"; `dev` hidden.

## "Il mio bot" (was Ecosistema)
```
Il mio bot
├─ LAVORO
│   ├─ Kanban          tasks the bot does on its own
│   ├─ Automazioni     messages and actions on a schedule
│   └─ Memoria         what it remembers, journal
└─ CAPACITÀ
    ├─ Skill           learned procedures (marketplace + proposals)
    ├─ Servizi         MCP connections (search, presets, custom)
    ├─ Programmi       CLI apps (catalog search)
    └─ Canali          where it answers: Telegram, Discord, …
```
- Each entry is its own screen; the "App" screen with CLI/MCP/Plugin tabs goes away. Under "Servizi" and "Programmi" the acronym (MCP, CLI) is shown small as subtitle.
- The drawer keeps Progetti and Cerca as today; the puzzle icon is labelled "Il mio bot".
- Routes: `/ecosystem/...` stays as the route prefix (no URL churn); `/ecosystem/apps` redirects to `/ecosystem/services`.

## Delivery
1. **NV-A — Settings** (can run now: no other agent touches `src/screens/settings/**` or `src/settings/runtimeFields.ts`).
2. **NV-B — Il mio bot** after EC-A is merged (EC-A edits `src/screens/ecosystem/apps/**`).

## Testing
Section list renders the groups and subtitles; each old id redirects; every runtime field appears on exactly one page (test over `RAW`); approvals and devices render under Sicurezza only; each known extra renders in its place and an unknown extra in Avanzate.
