# Nanodroid — design

Data: 2026-10-13 · Stato: bozza da approvare

## Obiettivo

App Android open source (licenza MIT), **client non ufficiale** di [nanobot](https://github.com/HKUDS/nanobot).
Parità completa con la WebUI di nanobot, aspetto più curato, più qualche funzione in più:
slider dell'effort di ragionamento per chat, scorciatoie per i comandi slash, pannello di stato e integrazioni Android.

Caso d'uso principale: nanobot gira su un Arduino Uno Q (4 GB) e il telefono lo raggiunge via Tailscale.
L'app deve però funzionare con qualsiasi istanza di nanobot.

## Vincoli

1. **Il server nanobot non si tocca.** Aggiornare nanobot non deve rompere l'app.
2. Si usano solo interfacce pubbliche del server: `/webui/bootstrap`, `/api/*`, i frame WebSocket documentati in `docs/websocket.md` e il routing via hash della WebUI.
3. Se un extra non trova ciò che gli serve, si nasconde. La WebUI originale continua a funzionare.

## Architettura

```
APK (Kotlin, minSdk 26, targetSdk 35)
├─ ConnectActivity   profili server (URL + secret), test connessione
├─ MainActivity      WebView → <server>/ (WebUI servita da nanobot)
│    ├─ inietta theme.css   (restyling, disattivabile)
│    ├─ inietta extras.js   (UI extra in Shadow DOM)
│    └─ ponte JS "Nanodroid" (@JavascriptInterface)
└─ ShareActivity     riceve ACTION_SEND (testo/immagine)
        │ HTTP + WebSocket (Tailscale o LAN)
        ▼
nanobot gateway non modificato (porta predefinita 8765)
```

### Componenti

**ConnectActivity (nativa)**
- Gestisce uno o più profili `{nome, baseUrl, secret}`.
- Il secret è **facoltativo**: con `tailscale serve`, o su localhost, nanobot può non richiederlo. Se presente, è salvato in EncryptedSharedPreferences.
- Sotto il campo c'è un aiuto: "È `channels.websocket.tokenIssueSecret` in `~/.nanobot/config.json`, oppure la password del login della WebUI".
- Prova la connessione con `GET {baseUrl}/webui/bootstrap` e header `X-Nanobot-Auth: <secret>`.
  - 200: profilo valido.
  - 401/403: secret errato.
  - Errore di rete: server irraggiungibile, con il suggerimento di controllare Tailscale.

**MainActivity (nativa)**
- La WebView carica `{baseUrl}/#/?bootstrapSecret=<secret>` solo al primo avvio per quel profilo e solo se il secret c'è; altrimenti carica `{baseUrl}/`. La WebUI legge il parametro, salva il secret nel suo localStorage e lo toglie dall'URL (`webui/src/lib/bootstrap.ts`).
- Impostazioni WebView:
  - JavaScript, DOM storage e cookie attivi.
  - Upload file con `onShowFileChooser`.
  - Microfono con `onPermissionRequest` e il permesso runtime `RECORD_AUDIO`.
  - Download con DownloadManager.
  - Link esterni (origine diversa da `baseUrl`) aperti nel browser di sistema.
- A ogni caricamento della pagina (`onPageFinished`) inietta `theme.css` (se attivo) ed `extras.js` dagli asset dell'APK.
- Errore di rete al caricamento: schermata nativa con "Riprova" e "Cambia server".
- Tasto indietro: `webView.goBack()` se c'è cronologia, altrimenti comportamento di sistema.
- Blocco biometrico opzionale all'avvio e al rientro dopo più di 5 minuti in background (BiometricPrompt).

**Ponte JS `window.Nanodroid`**
- `getConfig()` restituisce il JSON `{baseUrl, secret, themeEnabled, lang}`.
- `notify(title, body)`: notifica locale, inviata solo se l'app non è in primo piano.
- `haptic()`: vibrazione breve.
- `log(level, msg)`: log di debug visibile nelle impostazioni dell'app.

**extras.js (TypeScript, bundle esbuild)**
- Monta un unico host con Shadow DOM, così l'interfaccia è isolata dal CSS della WebUI.
- Non modifica il DOM della WebUI: lo legge al massimo.
- Ha una connessione sua:
  1. `GET /webui/bootstrap` con il secret: ottiene `token` (WS monouso, TTL 300 s), `api_token` e `ws_path`.
  2. Apre la WebSocket `ws(s)://host{ws_path}?token=…&client_id=nanodroid-extras`.
  3. Fa le letture REST con `Authorization: Bearer <api_token>`.
  4. A ogni riconnessione rifà il bootstrap, con backoff esponenziale (1 s → 30 s).
- Ricava la chat aperta dall'hash della WebUI, ascoltando `hashchange`:
  - `#/chat/<encodeURIComponent(sessionKey)>`: chat persistente.
  - `#/temporary/<chatId>`: chat temporanea, sessionKey `websocket:<chatId>`.
  - Le azioni per chat valgono solo se `sessionKey` inizia con `websocket:`. Il `chat_id` è la parte dopo `websocket:`.
  - Altrimenti la chat è "nessuna" e gli extra per chat si disattivano.

## Funzioni extra (v1)

### 1. Slider dell'effort per chat
- Pillola fissa sopra la zona del composer, con il testo `⚡ <livello>`. Toccandola si apre un pannello dal basso con lo slider.
- I livelli mostrati sono quelli che il modello della chat supporta, presi da `reasoning_efforts` nel catalogo modelli (`/api/settings/provider-models` o `/api/settings`). Ordine canonico: `none, low, medium, high, xhigh, max, adaptive`. Se il catalogo non dà livelli, la pillola non compare.
- Preset di partenza: quello della sessione (letto dai metadati della sessione in `/api/sessions`) oppure, se manca, il preset predefinito.
- Quando l'utente sceglie un livello `L`:
  1. Calcola il nome del preset derivato `<base>·<L>`, dove `<base>` è il nome del preset di partenza senza un eventuale suffisso `·<livello>`.
  2. Se il preset derivato non esiste, lo crea con `webui_request` `settings.model_configuration.create`, clonando il preset base con `reasoning_effort = L`.
  3. Invia il frame `attach` per il `chat_id`, poi un frame `message` con `content: "/model <base>·<L>"`.
  4. Il server salva il preset nei metadati della sessione (`AgentLoop.set_session_model_preset`): l'effort resta su quella chat, anche dopo un riavvio.
- In caso di errore lo slider torna al livello precedente e mostra un toast con il messaggio.
- Effetto collaterale accettato: nella chat compare la risposta "Switched model preset…" e nella lista modelli della WebUI compaiono i preset `·<livello>`.

### 2. Cassetto comandi
- Pulsante flottante (FAB) che apre un pannello con i comandi da `GET /api/commands`, raggruppati:
  - Sessione: `/status`, `/compact`, `/history`, `/stop`, `/new`
  - Memoria: `/dream`, `/dream-log`, `/dream-restore`
  - Agente: `/goal`, `/restart`, `/help`
  - Altri: tutti i comandi non elencati sopra
- Se il catalogo dichiara argomenti, prima dell'invio compare un campo di testo.
- Invio: `attach` + `message` con il testo del comando sulla chat aperta. Senza chat aperta, il comando apre prima una nuova chat (`new_chat`) e poi naviga a `#/chat/<key>`.

### 3. Pannello stato
- Pallino di stato della connessione extras (verde = WS aperta, giallo = riconnessione, rosso = errore).
- Toccandolo si apre un pannello con:
  - versione di nanobot e avviso di aggiornamento (`/api/settings/version-check`);
  - modello e preset attivi;
  - consumo token (`/api/settings/usage`);
  - pulsante "Esegui /status".

### 4. Integrazioni native
- **Notifiche:** extras.js ascolta `turn_end` sulla propria WS e chiama `Nanodroid.notify` con il titolo della chat e un'anteprima della risposta. Limite accettato: funziona solo finché il processo è vivo. Nessun foreground service nella v1.
- **Condividi con nanobot:** ShareActivity riceve testo (`text/plain`) o immagine (`image/*`) e apre MainActivity con la WebUI su `#/new`.
  - Il testo viene messo nel composer della WebUI tramite extras.js, con il setter nativo del valore + evento `input`. Se il composer non si trova, il testo va negli appunti con un toast "Incolla nel messaggio".
  - Le immagini vengono salvate come "allegato in attesa". Toast: "Tocca 📎 per allegare". Alla successiva `onShowFileChooser`, MainActivity restituisce subito quell'URI senza aprire il selettore di file, poi svuota l'attesa.
- **Blocco con impronta:** interruttore nelle impostazioni dell'app.
- **Più profili server:** scelta del profilo nella ConnectActivity.

### 5. Tema
- `theme.css` ridefinisce solo variabili CSS e regole di superficie: colori, raggi, font, spaziature. Interruttore on/off nelle impostazioni dell'app.
- Rispetta il tema chiaro/scuro di sistema.

## Fuori dalla v1
- Log del gateway, gestione plugin e `trigger` della CLI: non sono raggiungibili senza modificare il server.
- Tile nelle impostazioni rapide, widget, foreground service per notifiche sempre attive.
- Pubblicazione sul Play Store. Solo APK da GitHub Releases, quando e se il repo diventa pubblico.

## Errori
| Caso | Comportamento |
|---|---|
| Server irraggiungibile | Schermata nativa: messaggio, Riprova, Cambia server |
| 401/403 al bootstrap | Torna alla ConnectActivity con il secret evidenziato |
| Capacità mancante per un extra | Extra nascosto + riga nel log di debug |
| Errore `webui_response` (`ok: false`) | Toast con l'errore, stato UI ripristinato |
| WS extras caduta | Riconnessione con backoff; pallino giallo/rosso |

## Struttura repo
```
app/                          modulo Android (Kotlin, View system, no Compose)
  src/main/java/dev/nanodroid/
    MainActivity.kt  ConnectActivity.kt  ShareActivity.kt
    Bridge.kt  Profiles.kt
  src/main/assets/            theme.css, extras.js (copiato dalla build di extras/)
extras/                       TypeScript + esbuild + vitest
  src/  test/
env.sh                        attiva la toolchain locale (.toolchain/, ignorata da git)
```
- Package: `dev.nanodroid` (modificabile prima del primo rilascio).
- Build: `source env.sh && ./gradlew assembleDebug`. Il task Gradle `preBuild` lancia la build di extras (`npm run build`) e copia l'output negli asset.

## Test
- **extras (vitest):**
  - nome del preset derivato e rimozione del suffisso;
  - filtro e ordinamento dei livelli di effort;
  - parsing dell'hash in sessionKey/chat_id;
  - raggruppamento dei comandi;
  - macchina a stati di bootstrap e riconnessione, con fetch e WebSocket finti.
- **Android:** build `assembleDebug` senza errori più un test JVM sul parsing dei profili.
- **Accettazione manuale** sul telefono contro l'Arduino:
  - login automatico;
  - chat in streaming;
  - slider: livello cambiato e persistente dopo il riavvio dell'app;
  - comandi;
  - notifica con l'app in background;
  - condivisione di testo;
  - aggiornamento di nanobot senza ricompilare l'app.
