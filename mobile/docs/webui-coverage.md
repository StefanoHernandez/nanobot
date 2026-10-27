# nanobot mobile vs upstream WebUI coverage

**Upstream commit:** `219c8bb2bcaaf8b491361cb1386be866f01e1637` (`mobile/vendor/nanobot/VERSION`, dated 2026-10-27)  
**Audited:** 2026-10-27 (branch `agy/CV-A`)  
**Upstream source:** `webui/src/` on `main` (matches vendor after last sync)  
**App source:** `mobile/app/**`, `mobile/src/screens/**`, related `mobile/src/**` (settings, ecosystem, extras)

## Executive summary

Approximate row counts by status: **covered ~62**, **partial ~18**, **missing ~14**, **app-only better ~9**, **not needed on phone ~8**. The app implements most chat, settings, and ecosystem flows; the largest gaps before dropping the WebUI fallback are: (1) **multi-pane workbench and session pin/archive/batch sidebar** — desktop power-user layout with no mobile equivalent yet; (2) **sustained goal UI (`goal_state` strip)** — upstream shows active objectives in the composer, mobile has no `goal_state` handling in `mobile/src`; (3) **remote SSH / multi-host WebUI** (`webui/src/components/remote/**`) — mobile uses profile-based connect only; (4) **MCP custom server + JSON import** — upstream `AppsCatalogSettings` exposes `saveCustomMcp` / `importMcpConfig`, mobile ecosystem tests assert those APIs are not wired; (5) **composer video attachments** — upstream accepts video in the composer pipeline, mobile picker limits library/camera to `mediaTypes: ["images"]` in `Composer.tsx`.

Legend: **covered** = comparable UX in app; **partial** = subset or different surface; **missing** = no app UI found; **app-only better** = intentional mobile addition; **not needed on phone** = desktop/TUI-only by nature.

---

## Chat and composer

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Thread messages + streaming | `thread/ThreadMessages.tsx`, `thread/ThreadViewport.tsx` | `thread/ThreadScreen.tsx`, `thread/MessageList.tsx` | covered | Read `ThreadScreen` + `MessageList` before marking. |
| Composer text send + Enter | `thread/ThreadComposer.tsx` | `thread/Composer.tsx` | covered | Web Enter-to-send mirrored for `Platform.OS === "web"`. |
| Image attachments (library, camera) | `thread/ThreadComposer.tsx`, `AttachmentTile.tsx` | `thread/Composer.tsx`, `thread/AttachmentBar.tsx` | covered | Pickers at `Composer.tsx` ~315–347. |
| Video attachments in composer | `thread/ThreadComposer.tsx` | `thread/Composer.tsx` | partial | `mediaCore` classifies video; pickers only request images. Files via document picker may include video MIME. |
| Generic file attachments | `thread/ThreadComposer.tsx` | `thread/Composer.tsx` (`DocumentPicker`) | covered | `handlePickFiles` in `Composer.tsx`. |
| Slash commands menu | `SlashCommandText.tsx`, composer integration | `thread/SlashMenu.tsx`, `extras/logic.ts` | covered | Loads `/api/commands` via `loadCommands`. |
| Skill invocations (`$skill`) | composer skill menu | `thread/SlashMenu.tsx` | covered | `$` prefix branch in `SlashMenu.tsx`. |
| Bang / shell one-shot lines | (via agent, not separate WebUI panel) | — | partial | No dedicated UI; same as typing in composer if server accepts. |
| @ mentions (sessions, CLI apps, MCP) | `thread/ThreadComposer.tsx` | `thread/MentionMenu.tsx`, `thread/mentions.ts` | covered | Verified in `Composer.tsx` send path. |
| Reply-to message | composer reply affordance | `thread/ReplyBar.tsx` | covered | Used from `Composer.tsx`. |
| Queued / offline outbox | `ThreadComposer.tsx` (queued prompt store) | `extras/outbox`, `thread/PendingBar.tsx` | app-only better | Mobile outbox when socket down; different mechanism. |
| Reasoning effort (settings picker) | `settings/models/ReasoningEffortPicker.tsx` | `extras/EffortPill.tsx` in composer | app-only better | Per-chat slider in composer vs settings-only upstream. |
| Voice input (transcription) | composer mic | `thread/VoiceButton.tsx`, `VoiceLoopBar.tsx` | app-only better | Device + server STT; continuous loop is mobile-only. |
| Command drawer | — | `extras/CommandDrawer`, `ThreadScreen.tsx` | app-only better | Mobile-only quick commands UI. |
| Context / usage indicator | `thread/ComposerUsagePopover.tsx` | `thread/ContextIndicator.tsx`, `ContextPopover.tsx` | partial | Mobile context chip; no token popover parity checked line-by-line. |
| Prompt navigator (jump prompts in thread) | `thread/PromptNavigator.tsx` | — | missing | No `PromptNavigator` equivalent under `mobile/src`. |
| Starred / saved prompts | `StarPrompt.tsx`, `StarPromptView.tsx` | `extras/PromptPickerSheet.tsx` (composer) | partial | Mobile prompt picker; upstream star flow not verified 1:1. |
| Sustained goal strip (`goal_state`) | `thread/ThreadComposer.tsx` (`GoalStateStrip`) | — | missing | Grep: no `goal_state` in `mobile/src`. |
| Thread header (model, workspace) | `thread/ThreadHeader.tsx` | `thread/ThreadScreen.tsx`, `ModelBadge.tsx`, `WorkspaceSheet.tsx` | covered | Opened `ThreadScreen` header actions. |
| Subagent tasks list | `thread/SubagentTasks.tsx` | `thread/SubagentsSheet.tsx`, `subagent/[key]/[id].tsx` | covered | `SubagentThreadScreen.tsx` for detail thread. |
| Tool / activity cluster | `thread/AgentActivityCluster.tsx`, `thread/activity/*` | `thread/ActivityRow.tsx`, `ToolActivitySheet.tsx` | covered | Expandable tool sheet on mobile. |
| Reasoning blocks | `MessageBubble.tsx` / timeline | `thread/ReasoningBlock.tsx` | covered | |
| Stream / recovery / compaction notices | `thread/StreamErrorNotice.tsx`, `ContextCompactionNotice.tsx`, `RecoveryNotice.tsx` | `thread/NoticeRow.tsx` | partial | Core notices present; not every upstream notice type audited. |
| File edit / diff rows | `thread/activity/FileEditRow.tsx`, `DiffPair.tsx` | `thread/FileEditList.tsx`, `DiffView.tsx` | covered | |
| Workspace / project switch in thread | `thread/WorkspaceControls.tsx` | `thread/WorkspaceSheet.tsx` | covered | |
| Thread export | (sidebar / menu patterns) | `extras/exportChat`, `ThreadScreen.tsx` menu | covered | MD/PDF export in thread menu. |
| Gallery of thread media | `ImageGallery.tsx` | `gallery/GalleryScreen.tsx`, `app/gallery/[key].tsx` | covered | |
| Fork from history | WebUI fork UX | `thread/MessageList.tsx`, `chatsStore.fork` | covered | Fork boundary + menu in `MessageList`. |
| Temporary chat | `App.tsx` `/temporary/` routes | `ChatDrawer.tsx` `newTemporaryChat`, thread `temporary` flag | covered | |
| File preview side panel | `FilePreviewPanel.tsx`, `PreviewPane.tsx` | `viewer/FileViewer.tsx`, `app/viewer.tsx` | partial | Mobile full-screen viewer vs split pane workbench. |
| Markdown rendering | `MarkdownText.tsx`, `markdown-diagrams/*` | `ui/markdown/Markdown.tsx`, `CodeBlock.tsx` | covered | |
| Mermaid in markdown / artifacts | `markdown-diagrams/MermaidBlock.tsx` | `viewer/ArtifactWebView.tsx`, `ui/markdown/CodeBlock.tsx` | covered | Mermaid in viewer + code blocks. |
| Math (KaTeX) | `DisplayMath.tsx` | `ui/markdown/MathBlock.tsx` | covered | |
| Session-scoped search (Ctrl+K) | `SessionSearchDialog.tsx` | `search/SearchScreen.tsx`, drawer search | partial | Mobile global search (`ecosystem/search`); no Ctrl+K session switcher. |
| Pane workbench (multi-tab, drag panes) | `workbench/PaneWorkbench.tsx`, `ChatList.tsx` pane groups | — | missing | Desktop layout only in upstream. |
| Host switcher in chrome | `remote/HostSwitcher.tsx` | `connect/ConnectScreen.tsx` (profiles) | partial | Multi-profile URLs, not SSH remote instances UI. |

---

## Sidebar and chat list

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Chat list + select | `ChatList.tsx`, `Sidebar.tsx` | `chats/ChatDrawer.tsx`, `chats/ChatRow.tsx` | covered | |
| New chat | `Sidebar.tsx` | `ChatDrawer.tsx` | covered | |
| Rename chat | `RenameDialog.tsx`, `SidebarTopicRename.tsx` | `ChatDrawer.tsx` rename dialog | covered | |
| Delete chat | `DeleteConfirm.tsx` | `ChatDrawer.tsx` | covered | |
| Pin chat | `Sidebar.tsx` `onTogglePin` | — | missing | No pin in `ChatDrawer` / `chatsStore`. |
| Archive chat / show archived | `Sidebar.tsx` `onToggleArchive`, `onArchiveMany` | — | missing | Project archive exists; not chat archive. |
| Batch delete / archive | `ChatList.tsx` multi-select | — | missing | |
| Project groups in sidebar | `ChatList.tsx` | `ChatDrawer.tsx`, `projects/*` | covered | Recent projects + all projects link. |
| Sidebar search (filter chats) | `Sidebar.tsx` `onOpenSearch` | `ChatDrawer.tsx` `search()` | covered | |
| Search all messages | session search dialog | `ChatDrawer.tsx` → `/search` | covered | |
| Running / updated badges | `Sidebar.tsx` `runningChatIds` | `ChatRow.tsx`, `StatusDot` | partial | Running state partial vs upstream badges. |
| Collapse sidebar | `Sidebar.tsx` | — | not needed on phone | Drawer pattern instead. |
| Update available notice | `UpdateNotice.tsx` | `settings/AboutSection.tsx` version check | partial | Check in About, not persistent sidebar chip. |
| Utilities: Apps, Skills, Automations, Channels | `Sidebar.tsx` | `app/ecosystem/index.tsx` | covered | Ecosystem hub replaces sidebar entries. |

---

## Settings — navigation and overview

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Settings hub / sections | `settings/SettingsSidebar.tsx`, `SettingsPage.tsx` | `settings/SettingsScreen.tsx`, `app/settings/[section].tsx` | covered | Mobile regroups sections (see redirects in `SettingsScreen.tsx`). |
| Overview dashboard | `settings/overview/OverviewSettings.tsx` | `settings/OverviewSection.tsx` | covered | Includes usage, system, journal/kanban shortcuts. |
| About + version | `settings/overview/AboutSettingsView.tsx` | `settings/AboutSection.tsx` | covered | Version check API used in About. |
| Appearance (theme, reading, activity display) | `settings/overview/AppearanceSettingsView.tsx` | `settings/AppearanceSection.tsx` | partial | Theme/lang/lock/sound covered; no `activityMode`, `codeWrap`, `fileEditDisplayMode`, `brandLogos` prefs. |
| Browser notifications settings | `settings/notifications/NotificationSettings.tsx` | `extras/notifications.ts`, `AppearanceSection` sound | partial | Native turn notifications + kanban notify; not browser permission UX. |
| Restart engine | `SettingsSidebar.tsx` | `settings/store` `useRestart`, ecosystem screens | covered | Used from channels etc. |
| Logout | `SettingsSidebar.tsx` | — | not needed on phone | App uses profiles/connect, not WebUI session cookie logout. |

---

## Settings — models and providers

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Model presets CRUD | `settings/models/ModelsSettings.tsx` | `settings/ModelsSection.tsx` | covered | |
| Model call order | `ModelsSettings.tsx` | `ModelsSection.tsx` | covered | |
| Model configuration migrate | `ModelsSettings.tsx` | `ModelsSection.tsx` migrate button | covered | |
| Provider list + credentials | `settings/models/ProviderSettings.tsx` | `settings/ProvidersPanel.tsx` | covered | |
| Provider OAuth login/logout | `ProviderSettings.tsx` | `ProvidersPanel.tsx`, `settings/oauth.ts` | covered | |
| Provider shared proxy toggle | `ProvidersSettings` + `SharedProxySetupDialog.tsx` | `ProvidersPanel.tsx` `use_proxy` switch | covered | Inline vs modal dialog. |
| Custom provider create | `ProviderSettings.tsx` | `ProvidersPanel.tsx` `ADD_CUSTOM` | covered | |
| Deferred / API-specific provider fields | `ProviderParameterFields.tsx` | `ProvidersPanel.tsx` | partial | Large provider matrix; not every field compared. |
| Task-specific model paths | runtime / models | `settings/TaskModels.tsx` | covered | |
| Reasoning effort in settings | `ReasoningEffortPicker.tsx` | — (composer `EffortPill`) | app-only better | See composer table. |

---

## Settings — capabilities (image, voice, web, memory)

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Capabilities hub | `SettingsPage.tsx` case `capabilities` | `settings/CapabilitiesSection.tsx` (`features` section) | covered | |
| Image generation | `capabilities/ImageGenerationSettings.tsx` | `CapabilitiesSection.tsx` `ImageCard` | covered | |
| Transcription / voice | `capabilities/TranscriptionSettings.tsx` | `CapabilitiesSection.tsx` `TranscriptionCard` | covered | |
| Web search + browse tool | `capabilities/WebSettings.tsx` | `CapabilitiesSection.tsx` `WebCard` | covered | Includes proxy fields via runtime paths. |
| Dream / memory toggle | capabilities `SettingsFeature` | `CapabilitiesSection.tsx` `MemoryCard` | covered | |
| Olostep / document features | `WebSettings` + features | `Features.tsx` in capabilities | covered | |
| Plugin/feature packages | `RuntimeSettings` feature install | `settings/Features.tsx` | covered | |

---

## Settings — runtime, system, advanced, security

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Runtime config fields | `system/RuntimeConfigSettings.tsx`, `runtime-config-fields.ts` | `settings/RuntimeConfigSection.tsx`, `runtimeFields.ts` | covered | Split across `behavior`, `server`, `advanced`, `security`. |
| Runtime service / API controls | `system/RuntimeSettings.tsx` | `settings/MachineSection.tsx` (`ServerSection`) | covered | |
| Advanced / security network | `capabilities/SecuritySettings.tsx` (`AdvancedSettings`) | `settings/SecuritySection.tsx`, `NetworkSafetyCard.tsx` | covered | |
| Tool approvals | (security / runtime) | `settings/ApprovalsCard.tsx` | covered | |
| Shell runtime control UI | `system/ShellRuntimeControl.tsx` | `RuntimeConfigSection` fields | partial | Fields may exist without dedicated control widget. |
| Backup / restore | — | `settings/BackupSection.tsx` | app-only better | Mobile backup section; upstream may differ. |
| Costs / usage | overview usage | `settings/CostsSection.tsx` | covered | |
| Prompts / system prompts | — | `settings/PromptsSection.tsx` | partial | Mobile section; mapping to upstream prompts not 1:1 verified. |

---

## Settings — channels, apps, skills, automations

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Channels catalog + instances | `system/ChannelsSettings.tsx` | `ecosystem/channels/ChannelsScreen.tsx` | covered | |
| Channel credential setup | `channels/ChannelSetupPanel.tsx` | `channels/ChannelSheet.tsx` | covered | |
| Channel QR / link connect | `channels/ChannelQrConnectFlow.tsx` | `channels/ChannelConnect.tsx` | covered | QR via `react-native-qrcode-svg`. |
| Channel pairing section | (channels UI) | `channels/PairingSection.tsx` | covered | |
| Apps: CLI catalog | `system/AppsSettings.tsx` | `ecosystem/apps/CliAppsTab.tsx` | covered | |
| Apps: MCP presets | `AppsCatalogSettings` | `ecosystem/apps/McpTab.tsx`, `McpSheet.tsx` | partial | Enable/test/tools/OAuth covered. |
| MCP OAuth flow | `AppsSettings` OAuth handlers | `ecosystem/apps/McpOAuthSheet.tsx` | covered | Manual callback URL on mobile. |
| MCP custom server + import JSON | `AppsSettings` `saveCustomMcp`, `importMcpConfig` | — | missing | `mobile/test/ecosystem/apps-skills-automations.test.ts` expects APIs absent. |
| MCP proxy configure from apps | `configureProxy` | `CapabilitiesSection` / `ProvidersPanel` | partial | Shared proxy elsewhere, not apps modal. |
| Skills installed catalog | `SkillsCatalogSettings.tsx` | `ecosystem/skills/SkillsScreen.tsx` | covered | |
| Skills marketplace discover/trending | `SkillsMarketplace.tsx` | `SkillsScreen.tsx` tabs | covered | |
| Skill proposals / scout | — | `skills/proposalsApi.ts`, `SkillProposalSheet.tsx` | app-only better | Mobile skill proposals from chat. |
| Automations / cron jobs | `system/AutomationsSettings.tsx` | `ecosystem/automations/AutomationsScreen.tsx` | covered | |
| Automation calendar view | `system/AutomationCalendar.tsx` | — | missing | List grouping only on mobile. |
| Automation run dialog / chat binding | `AutomationRunDialog.tsx`, `AutomationChatBinding.tsx` | `AutomationJobSheet.tsx`, `NewAutomationSheet.tsx` | partial | Core edit/run; calendar binding UI missing. |
| Memory browser (settings capability) | runtime memory page | `ecosystem/memory/MemoryScreen.tsx` | covered | Also ecosystem route. |

---

## Pairing, devices, connect

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Device pairing QR (server shows) | `remote/PairRouteSettings.tsx` | `settings/AboutSection.tsx`, `DevicesCard.tsx` | covered | |
| Quick pair setup | `remote/QuickPairSetup.tsx` | `connect/ConnectScreen.tsx`, `PairScanModal.tsx` | covered | |
| Paired devices list / revoke | — | `settings/DevicesCard.tsx` | covered | |
| Remote SSH connections page | `remote/RemoteConnectionsPage.tsx` | — | missing | No `/remote` route in `mobile/app`. |
| SSH host picker | `remote/SSHHostPicker.tsx` | — | missing | |
| Remote instances sidebar bridge | `remote/RemoteInstances.tsx` | — | missing | |

---

## Activity, goals, kanban (beyond thread)

| Upstream feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Kanban / tasks board | (extensions API) | `ecosystem/kanban/KanbanScreen.tsx` | covered | |
| Journal in search | — | `search/SearchScreen.tsx` | covered | |
| WebSocket goal snapshots | `ThreadComposer` goal UI | — | missing | Protocol may arrive; no UI in `mobile/src`. |
| `/goal` slash command | server commands | `extras/logic.ts` command list includes `/goal` | partial | Command exists server-side; no goal strip UI. |

---

## TUI-only (nanobot terminal client)

| Upstream / product feature | Upstream file | App screen / file | Status | Notes |
| --- | --- | --- | --- | --- |
| Full-screen TUI transcript | `tui/` | — | not needed on phone | Mobile app replaces TUI on phone. |
| TUI `/diff` full-screen pager | `tui/README.md` | `thread/DiffView.tsx` | partial | Inline/sheet diff in app, not terminal pager. |
| TUI `Ctrl+O` tool expansion | TUI | `ToolActivitySheet.tsx` | partial | Different interaction model. |
| TUI Herdr pane title integration | `tui/README.md` | — | not needed on phone | Terminal multiplexer specific. |
| TUI `--classic` cross-channel session | TUI | — | not needed on phone | Desktop operator workflow. |
| OSC theme auto-detect | TUI | `AppearanceSection` theme | not needed on phone | App theme system instead. |
| TUI mouse scroll regions | TUI | — | not needed on phone | Touch scroll in RN. |
| `nanobot gateway` background detach UX | TUI `/detach` | — | not needed on phone | Server ops from desktop. |

---

## App-only (no upstream WebUI equivalent)

| Feature | App screen / file | Status | Notes |
| --- | --- | --- | --- |
| Biometric app lock | `settings/AppearanceSection.tsx`, `extras/lock.ts` | app-only better | |
| Per-chat reasoning effort pill | `extras/EffortPill.tsx` | app-only better | |
| Command drawer | `extras/CommandDrawer` | app-only better | |
| Status dot / connection panel | `extras/StatusDot` | app-only better | |
| Share-to-nanobot intent | `NativeIntegrations.tsx` | app-only better | |
| Background connection + battery hints | `AppearanceSection.tsx`, `platform/keepAlive` | app-only better | |
| Outbox for offline sends | `extras/outbox` | app-only better | |
| Projects CRUD (mobile extension) | `projects/ProjectsScreen.tsx` | app-only better | Sidebar shows projects; full UX in app routes. |
| Continuous voice conversation loop | `extras/voiceLoop.ts` | app-only better | |
