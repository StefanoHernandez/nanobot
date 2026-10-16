# Report PL-A: Prompt Library (Libreria Prompt)

## 1. File modificati e creati

### File creati:
- `mobile/src/extras/prompts.ts`: store Zustand, client HTTP (`listPrompts`, `savePrompt`, `deletePrompt`, `markUsed`), hook `usePrompts`, funzioni helper `fillPrompt` ed `extractVariables`.
- `mobile/src/extras/PromptPickerSheet.tsx`: bottom sheet per la selezione del prompt (ricerca, visualizzazione badge di progetto, estrazione e inserimento variabili, integrazione con bozza del thread).
- `mobile/src/extras/PromptEditorSheet.tsx`: sheet di creazione / modifica / eliminazione prompt con rilevamento live delle variabili, toggle per lo scope di progetto e dialog di conferma eliminazione.
- `mobile/src/screens/settings/PromptsSection.tsx`: sezione delle impostazioni dedicata ai prompt globali con elenco, opzione di modifica ed eliminazione e creazione nuovo prompt.
- `mobile/test/extras/prompts.test.tsx`: suite di test unitari e di integrazione per la gestione dei prompt, parsing variabili, filtraggio per progetto, integrazione bozza, ricerca, eliminazione e gestione errori.

### File modificati:
- `mobile/src/screens/thread/Composer.tsx`: pulsante dedicato per aprire `PromptPickerSheet`.
- `mobile/src/screens/settings/SettingsSection.tsx` & `mobile/src/screens/settings/SettingsScreen.tsx`: voce nel menu e navigazione per la sezione `prompts`.
- `mobile/src/screens/projects/ProjectDetailScreen.tsx`: sezione dei prompt specifici del progetto con creazione/modifica diretta.
- `mobile/src/ui/components/TextField.tsx`: supporto opzionale a `mono` font per editing di template prompt.
- `mobile/src/i18n/en.json` & `mobile/src/i18n/it.json`: traduzioni complete per `prompts.*`.
- `mobile/test/projects/projects.test.tsx`: aggiornato mock `fetch` per `usePrompts` in `ProjectDetailScreen`.

---

## 2. Dettaglio implementazione vs Brief (PL-A e PL-A-fix1)

| Requisito | File:Line | Stato |
|---|---|---|
| `fillPrompt` e `extractVariables` con regex standard Python (`\{\{\s*([A-Za-z_][A-Za-z0-9_ ]{0,39}?)\s*\}\}`) e `Object.hasOwn` | `mobile/src/extras/prompts.ts:34-52` | Implementato |
| Endpoint REST (`GET /api/ext/prompts`, `POST /save`, `POST /delete`, `POST /used`) con Bearer token e singolo transport `fetch` | `mobile/src/extras/prompts.ts:56-151` | Implementato |
| Store Zustand `promptsStore` con `refresh`, `reset`, reset su cambio profilo, e `generation` counter anti-race condition | `mobile/src/extras/prompts.ts:153-209` | Implementato |
| Hook `usePrompts(projectId, enabled)` per auto-fetch se sessione attiva | `mobile/src/extras/prompts.ts:211-236` | Implementato |
| `PromptPickerSheet`: attesa caricamento `projectsStore` se non ancora caricato per chat con workspaceScope | `mobile/src/extras/PromptPickerSheet.tsx:50-70` | Implementato |
| `PromptPickerSheet`: ricerca per titolo/body, `prompts.noMatches` se non ci sono risultati di ricerca | `mobile/src/extras/PromptPickerSheet.tsx:75-80, 180-184` | Implementato |
| `PromptPickerSheet`: inserimento variabili con form dinamico, fallback su testo invariato se vuoto | `mobile/src/extras/PromptPickerSheet.tsx:98-118, 123-165` | Implementato |
| `PromptPickerSheet`: anteprima body limitata alla prima riga (`numberOfLines={1}`) | `mobile/src/extras/PromptPickerSheet.tsx:246-255` | Implementato |
| `PromptPickerSheet`: pulsante "Salva bozza come prompt" sempre visibile e disabilitato a bozza vuota | `mobile/src/extras/PromptPickerSheet.tsx:272-280` | Implementato |
| `PromptEditorSheet`: preserva body senza trim (`bodyRef.current`) | `mobile/src/extras/PromptEditorSheet.tsx:73-83` | Implementato |
| `PromptEditorSheet`: preserva `project_id` dell'oggetto esistente tramite `effectiveProjectId` | `mobile/src/extras/PromptEditorSheet.tsx:55, 185-207` | Implementato |
| Singolo refresh store per save/delete (senza duplicare refresh nei caller) | `mobile/src/extras/PromptEditorSheet.tsx:84-88, 104-108` | Implementato |
| Sezione prompt globali in Impostazioni (`PromptsSection`) | `mobile/src/screens/settings/PromptsSection.tsx:1-105` | Implementato |
| Sezione prompt nel dettaglio progetto (`ProjectDetailScreen`) | `mobile/src/screens/projects/ProjectDetailScreen.tsx:620-685` | Implementato |

---

## 3. Sezione fix1

Conformemente al brief `PL-A-fix1.md`:
1. **Trasporto HTTP unico (`fetch`):** rimosso il doppio tentativo (`session.get` fallback su `fetch`) in `listPrompts`. Ora tutte le chiamate ad `/api/ext/prompts*` usano `fetch` coerentemente con `redirect: "error"` e `credentials: "omit"`.
2. **Regex e `fillPrompt` allineati al server Python:**
   - La regex ora è `/\{\{\s*([A-Za-z_][A-Za-z0-9_ ]{0,39}?)\s*\}\}/g`, limitando la lunghezza dei nomi variabili a 40 caratteri come in `nanobot/ext/prompts.py`.
   - Sostituzione valori con `Object.hasOwn(values, k)`, evitando collisioni di proprietà su `Object.prototype` (es. `{{constructor}}`).
3. **Miglioramenti a `PromptPickerSheet`:**
   - Gestito il caricamento asincrono di `projectsStore` prima della risoluzione del `project_id` associato alla cartella della chat.
   - Accesso diretto `byPath[pPath]`.
   - Distinzione tra libreria vuota (`prompts.empty`) e ricerca senza corrispondenze (`prompts.noMatches`).
   - Pulsante "Salva bozza come prompt" sempre renderizzato e disabilitato (`disabled={draft.trim().length === 0}`) se la bozza è vuota.
   - Visualizzazione della sola prima riga del body (`split(/\r?\n/)[0]`) con `numberOfLines={1}`.
4. **Miglioramenti a `PromptEditorSheet`:**
   - Il body del prompt viene salvato non trimmato, consentendo spaziatura iniziale o finale intenzionale (es. template o markdown).
   - In fase di modifica, il `project_id` del prompt viene mantenuto anche in assenza della prop `projectId`.
   - Rimosso il doppio refresh concorrente: solo `PromptEditorSheet` attiva il refresh al salvataggio/cancellazione.
5. **Rafforzamento test (`prompts.test.tsx` e `projects.test.tsx`):**
   - Test per variabili oltre 40 caratteri e test di sicurezza con `{{constructor}}`.
   - Test per il fallback `prompts.noMatches`.
   - Test per lo stato disabilitato del pulsante di salvataggio bozza.
   - Asserzione che nella vista di dettaglio progetto i prompt globali non siano presenti.
   - Test del guard `profileId` su switch utente durante in-flight request.
   - Mock di `fetch` integrato nei test di `ProjectDetailScreen` in `projects.test.tsx`.

---

## 4. Dipendenze aggiunte
Nessuna nuova dipendenza aggiunta.

---

## 5. Output raw delle verifiche

### TypeScript (`npx tsc --noEmit`)
```
$ npx tsc --noEmit
(exit code: 0, nessun errore)
```

### Jest (`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx jest test/extras/prompts.test.tsx test/projects/projects.test.tsx`)
```
PASS test/projects/projects.test.tsx
PASS test/extras/prompts.test.tsx

Test Suites: 2 passed, 2 total
Tests:       29 passed, 29 total
Snapshots:   0 total
Time:        1.651 s, estimated 2 s
Ran all test suites matching /test\/extras\/prompts.test.tsx|test\/projects\/projects.test.tsx/i.
```

### Suite completa Jest (`npx jest`)
```
Test Suites: 89 passed, 89 total
Tests:       733 passed, 733 total
Snapshots:   0 total
Time:        10.796 s
Ran all test suites.
```

---

## 6. Verifiche non effettuate
- L'applicazione non è stata eseguita su dispositivo fisico o emulatore Android.
- Nessuna chiamata è stata effettuata contro un'istanza reale live del server nanobot.
