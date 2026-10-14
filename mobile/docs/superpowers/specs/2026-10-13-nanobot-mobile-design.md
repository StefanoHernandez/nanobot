# nanobot mobile — design

Data: 2026-10-13 · Stato: bozza da approvare · Sostituisce l'approccio wrapper di `2026-10-13-nanodroid-design.md` (branch `feat/nanodroid`, conservato come riferimento)

## Obiettivo
App mobile **nativa** (React Native / Expo), client non ufficiale di [nanobot](https://github.com/HKUDS/nanobot), con **parità completa con la WebUI** e in più alcune funzioni nostre: effort per chat, cassetto comandi, stato, notifiche, condivisione, blocco biometrico, più server.

Per ora è un progetto personale, open source con licenza MIT. Obiettivo futuro: proporla a HKUDS. Per questo:
- l'identità visiva segue quella della WebUI di nanobot, adattata al mobile;
- il codice è TypeScript e riusa il loro client.

Caso d'uso principale: nanobot gira su Arduino Uno Q (4 GB) e si raggiunge via Tailscale (`https://myhost.example-tailnet.ts.net` con `tailscale serve` → `127.0.0.1:8765`, `tokenIssueSecret` impostato).

## Perché non il wrapper
Gli extra iniettati sopra la WebView si sovrapponevano alla WebUI e non si potevano integrare bene. Un'app nativa disegna tutta l'interfaccia, quindi le funzioni nostre hanno uno spazio loro.

## Vincoli
1. **Il server nanobot non va modificato.** Si usano solo `/webui/bootstrap`, `/api/*`, i frame WebSocket (`docs/websocket.md`) e le azioni `webui_request`.
2. **Il codice di nanobot si riusa, non si riscrive.** È sotto licenza MIT (© Xubin Ren e contributori di nanobot): mantenere l'attribuzione in `vendor/nanobot/LICENSE` e nel README.
3. **I file in `vendor/nanobot/` non si modificano mai.** Le differenze tra browser e React Native si gestiscono in `src/platform/`.
4. **Priorità ad Android.** iOS deve compilare con Expo ma non viene testato finché non lo si chiede.
5. **Build locale.** Si usa la toolchain del progetto (`.toolchain/`, `env.sh`), niente servizi cloud di Expo (EAS).

## Architettura
```
mobile/                       Expo SDK (React Native + TypeScript, strict)
├─ vendor/nanobot/            copia sincronizzata da un tag di nanobot (non modificare)
│   ├─ VERSION                tag/commit di origine + data sync
│   ├─ LICENSE                MIT nanobot
│   ├─ webui/src/lib/         nanobot-client.ts, api.ts, types.ts, bootstrap.ts, runtime.ts, … (solo i file necessari)
│   └─ packages/client-events/
├─ src/platform/              adattatori RN: WebSocket host, storage, crypto.randomUUID, location/URL, timers
├─ src/state/                 store Zustand + hook adattati (stream, sessioni, settings)
├─ src/ui/                    tema nanobot (light/dark), Markdown, CodeBlock, Math, Sheet, componenti base
├─ src/screens/               Connect, Drawer/ChatList, Thread, Settings/*, Skills, Automations, Channels, Apps…
├─ src/extras/                funzioni nostre: effort, comandi, stato, notifiche, share, lock, profili
├─ test/                      vitest/jest: platform, store, extras; fake server WS che riproduce eventi registrati
└─ scripts/sync-nanobot.sh    copia i file elencati da un checkout/tag nanobot in vendor/ e scrive VERSION
```

### Riuso del codice di nanobot (approccio "copia sincronizzata")
- `scripts/sync-nanobot.sh <path-o-tag>` copia **una lista esplicita** di file (definita nello script) dentro `vendor/nanobot/`, mantenendo i percorsi relativi, e aggiorna `VERSION`.
- Gli import relativi tra file copiati devono funzionare senza modifiche, quindi si conserva la struttura delle cartelle.
- Le dipendenze verso il browser (`window`, `localStorage`, `WebSocket` globale, `runtime.ts`) si risolvono:
  - con alias del bundler (Metro `resolver.extraNodeModules` o alias Babel), che puntano a `src/platform/*`, quando il file vendor importa un modulo sostituibile;
  - con polyfill globali installati all'avvio (`globalThis.localStorage` basato su storage sincrono, `crypto.randomUUID`), quando il file vendor accede a un global.
- Aggiornare nanobot: lanciare `sync-nanobot.sh`, poi `npm test` e il typecheck. Le rotture vanno risolte in `src/platform` o `src/state`, mai in `vendor/`.
- Futuro (approccio 3): proporre a HKUDS un pacchetto `packages/nanobot-client` nel loro monorepo, così `vendor/` diventa una dipendenza.

### Stack
- **Base:** Expo SDK (ultima stabile), React Native, TypeScript strict, expo-router (navigazione a file).
- **Stato:** Zustand.
- **Storage:** `expo-secure-store` per i segreti, `react-native-mmkv` per lo storage sincrono e veloce (polyfill di `localStorage`).
- **Rendering:** Markdown con `react-native-markdown-display` o equivalente mantenuto, evidenziazione del codice, formule matematiche (KaTeX via WebView minimale solo per i blocchi di formule).
- **Nativo:** `expo-notifications`, `expo-local-authentication`, `expo-clipboard`, `expo-document-picker`, `expo-image-picker`, `expo-av` (voce), `expo-sharing`, share intent (es. `expo-share-intent`).
- **Lingue:** i18n con le stesse chiavi e lingue della WebUI dove possibile; minimo it ed en.
- **Test:** jest (preset expo) per componenti e store; il client vendor si testa in Node contro un server WS finto.

## Fasi
Ogni fase produce un'app usabile e ha un suo piano di implementazione.

### Fase 1: core chat (questo design la dettaglia)
1. **Connessione:**
   - profili server `{nome, baseUrl, secret}` (segreto in SecureStore, segreto facoltativo);
   - test con `GET {baseUrl}/webui/bootstrap` e `X-Nanobot-Auth`;
   - normalizzazione dell'URL (schema, niente slash finale);
   - messaggi: "segreto richiesto/errato" (401/403, con suggerimento su `tokenIssueSecret`), "irraggiungibile (Tailscale attivo?)".
2. **Drawer / lista chat:**
   - lista da `/api/sessions`, con titolo, anteprima e chat in corso evidenziate;
   - ricerca locale;
   - chat nuova (`new_chat`) e temporanea (`new_temporary_chat`);
   - rinomina ed eliminazione via `webui_request` (stesse azioni della WebUI);
   - aggiornamento con `session_updated` / `sidebar_state_updated`.
3. **Thread:**
   - storico da `/api/sessions/{key}/webui-thread`;
   - streaming `delta` / `stream_end`;
   - ragionamento (`reasoning_delta`, `reasoning_end`) in un blocco richiudibile;
   - attività: riga "Worked for…" con l'elenco dei tool (`message` con `kind` `tool_hint` / `progress` e `tool_events`);
   - Markdown, codice con evidenziazione e pulsante copia, formule;
   - notifiche di stato: compattazione del contesto, recupero, fallback del modello, errori di stream;
   - pulsante Stop: invia il messaggio `/stop` sulla chat, come fa la WebUI (`useNanobotStream.ts:1021`);
   - badge del modello/preset in uso.
4. **Composer:**
   - campo multilinea; invio col pulsante (Invio = a capo, come la WebUI su touch);
   - menu `/` con il catalogo di `/api/commands`;
   - accodamento o guida mentre un turno è in corso, con la stessa semantica della WebUI;
   - **pillola effort** a sinistra del pulsante invio, dentro la barra del composer.
5. **Stato:** pallino di connessione nell'header. Al tocco apre un pannello con versione nanobot (`version.current` da `/api/settings`), avviso aggiornamento, modello e preset, consumo token (`/api/settings/usage`), "Esegui /status".

**Funzioni nostre nella Fase 1**
- **Effort per chat:**
  - livelli supportati da `model_presets[].reasoning_effort_values` (ordine `none, low, medium, high, xhigh, max, adaptive`);
  - preset derivato `<base>·<livello>`, creato con `settings.model_configuration.create` clonando name/provider/model/max_tokens/context_window_tokens/temperature, se non esiste;
  - poi `/model <base>·<livello>` sulla chat;
  - il livello attuale si legge da `model_preset` della sessione;
  - le richieste obsolete vengono scartate (guard di sequenza + sessionKey);
  - gli errori mostrano `error.message`.
- **Cassetto comandi:** bottom sheet con i comandi di `/api/commands` raggruppati (Sessione / Memoria / Agente / Altri), con campo argomenti se `accepts_args`.
- **Notifiche:** a `turn_end` (`outcome` completed o assente), se l'app non è in primo piano. Una sola per turno, anche per i turni fatti solo di tool. Il limite è accettato: funzionano solo finché il processo è vivo.
- **Condivisione:** in Fase 1 solo testo, che va nel composer di una chat nuova. La condivisione di immagini arriva in Fase 2, insieme agli allegati.
- **Blocco biometrico:** `expo-local-authentication`, all'avvio e dopo più di 5 minuti in background. Schermo protetto (FLAG_SECURE) quando è attivo.

### Fase 2: chat avanzata
**Priorità 1, richiesta dell'utente (2026-10-13): media inviati dall'agente.** Il protocollo li porta già: `message.media_urls` (URL firmati `/api/media/...`) e `media`. La WebUI però classifica l'audio come file generico, quindi non lo riproduce, e non offre anteprime.
- **Immagini e video:** inline nel messaggio. Tap per aprirli a schermo intero.
- **Audio:** riconosciuto per estensione (`.mp3 .m4a .ogg .opus .wav .aac .flac`). Player inline con play/pausa, barra di avanzamento e durata, tramite `expo-audio`.
- **File:** card con nome, tipo e dimensione. Tap per aprirli in un **visualizzatore stile artefatti** a schermo intero:
  - testo, Markdown e codice, con l'evidenziazione già esistente;
  - JSON e CSV, formattati o in tabella;
  - HTML, in WebView isolata, secondo le regole di sicurezza;
  - PDF, con un viewer nativo o di sistema.

  Il visualizzatore offre **Salva** (SAF/Download) e **Condividi** (share sheet di Android).
- **Classificazione:** riuso `inferMediaKind` del vendor, con un'estensione mobile per l'audio in `src/` (non si modificano i file vendor).
- **Verificato sul sorgente nanobot @cd2a863:**
  - Il server invia i media sul WebSocket. L'evento `message` porta `media_urls: [{url, name}]` (relativi `/api/media/<sig>/<path>`, da prefissare con il `baseUrl`), oltre a `media` con i path del server.
  - Lo storico `webui-thread` li ri-firma come `{kind, url, name}`. Audio e pptx arrivano come `kind: "file"`.
  - Gli URL non richiedono Bearer e non scadono. Sono URL-capability, quindi non vanno mai loggati o condivisi come link.
  - I MIME tipizzati sono solo immagini e video. Il resto arriva come `application/octet-stream`, quindi il tipo si deduce dal `name`.
  - Nessun limite di dimensione.

Allegati (upload `/api/attachments` con token da `ready.upload`), voce (`transcribe_audio`), subagent (lista e thread in sola lettura), diff dei file (`file_edit`), anteprime file e immagini, galleria, fork, chat temporanee complete, menzioni `@`, preset MCP e app CLI nel composer, cartella di lavoro e modalità di accesso, popover del contesto con grafico token per round.

### Fase 3: impostazioni
Panoramica, Aspetto (tema, lingua, suono di notifica), Modelli e preset (CRUD, ordine di chiamata, catalogo modelli del provider), Provider, Capacità (generazione immagini, web, trascrizione, sicurezza), Sistema/Runtime, Avanzate, Info, controllo versione.

### Fase 4: ecosistema
Canali (form credenziali, flusso QR, approvazioni pairing), App (CLI Apps, MCP con OAuth, plugin), Skills (installate, scopri, cerca, tendenze), Automazioni (calendario, esecuzione, risultati), Remote (istanze, QR pairing).

### Fase 5: extra
Artefatti interattivi e anteprime documenti in-app (HTML/SVG/Mermaid, PDF, docx, pptx, xlsx), widget, tile delle impostazioni rapide, eventuale servizio in primo piano per notifiche persistenti. iOS rimandato (decisione utente 2026-10-13).

## Gestione errori (tutte le fasi)
| Caso | Comportamento |
|---|---|
| Server irraggiungibile | banner nell'header "Non raggiungibile — Tailscale attivo?" + riprova; i dati in cache restano visibili |
| 401/403 al bootstrap | schermata Connessione con il segreto evidenziato |
| API token scaduto (TTL `expires_in`) | rinnovo proattivo a `expires_in − 30 s` e rinnovo una tantum su 401; rinnovi deduplicati |
| WS caduto | riconnessione con backoff 1 → 30 s, nuovo bootstrap a ogni tentativo, timeout di 10 s su bootstrap e apertura |
| `webui_response` `ok:false` | toast con `error.message`, stato UI ripristinato |
| Ritorno in primo piano | riconnessione immediata |
| Versione nanobot non compatibile (azione o evento sconosciuto) | l'evento sconosciuto viene ignorato e loggato; la funzione mancante si nasconde |

## Sicurezza
- Segreto solo in SecureStore; mai nei log, nei toast o negli URL.
- `http` in chiaro ammesso per Tailscale/LAN (`usesCleartextTraffic`); il README spiega il compromesso.
- Gli URI condivisi si accettano solo se `content://` e non dal pacchetto dell'app (confronto sull'host parsato).
- WebView solo per le formule e le anteprime web: JS isolato, niente bridge verso i segreti, niente accesso ai file.

## Collaborazione con Antigravity (agy)
- **Divisione:** Claude si occupa di architettura, piani, adattatori di piattaforma, streaming e thread, effort, sicurezza e revisione di tutto. agy si occupa dei task medi e semplici con specifica chiusa (schermate di impostazioni, liste, form, i18n, icone, test di componenti).
- **Worktree:** agy lavora in `../nanobot_androidapp-agy`, un git worktree, su branch `agy/T<n>` creati da Claude a partire da `dev`.
- **Passaggio dei task:** Claude scrive `mobile/docs/agy/briefs/T<n>.md`. L'utente lo passa ad agy dall'app Antigravity e approva i permessi. agy committa sul suo branch e scrive `mobile/docs/agy/reports/T<n>.md`.
- **Revisione e merge:** Claude revisiona il diff. Se servono correzioni, scrive `mobile/docs/agy/briefs/T<n>-fix<k>.md`. A revisione positiva Claude fa il merge in `dev`. `master` riceve solo merge da `dev` a fine fase.

## Wiki
`wiki/` (skill codebase-wiki): architettura, decisioni (ADR brevi), protocollo nanobot usato, stato delle fasi, registro dei task (chi, cosa, commit, esito della revisione), problemi noti e come aggiornare nanobot. Si aggiorna a ogni task completato.

## Test e accettazione (Fase 1)
- **Unitari:** adattatori di piattaforma, store, logica effort (nomi, livelli, guard), raggruppamento comandi, notificatore (una notifica per turno), normalizzazione URL, validazione URI condivisi.
- **Integrazione:** client vendor + adattatori contro un server WS finto che riproduce una sessione registrata (ready, attach, delta, reasoning, tool, turn_end).
- **Build:** `npx expo prebuild` + `./gradlew assembleRelease` (o debug) con la toolchain locale. L'APK finisce in `mobile/dist/`.
- **Accettazione manuale sul telefono:**
  - login su `https://myhost.example-tailnet.ts.net`;
  - lista chat;
  - streaming con ragionamento e tool;
  - Stop;
  - comandi;
  - effort persistente dopo il riavvio;
  - notifica in background;
  - condivisione di testo;
  - blocco;
  - tema chiaro/scuro;
  - Tailscale spento → banner.
