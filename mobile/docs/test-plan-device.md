# Collaudo sul telefono (fine sviluppo)

Ordine: prima reinstalla il server, poi installa l'APK, poi segui le sezioni. Per ogni passo segna ✅ o ❌ e, se ❌, cosa hai visto (con uno screenshot se puoi).

## 0. Preparazione
- [ ] Server reinstallato dal branch `arduino` e gateway riavviato. In Impostazioni → Macchina, l'uptime del gateway è di pochi minuti.
- [ ] APK installata e app aperta. La connessione è verde.
- [ ] In Impostazioni → Aspetto, le risposte audio sono **attive** (serve per la voce continua).

## 1. Approvazioni comandi
- [ ] Impostazioni → Sicurezza: attiva "Approva i comandi shell".
- [ ] In chat chiedi: "esegui `ls ~`". Compare la scheda con il comando, la chat e il conto alla rovescia.
- [ ] **Consenti**: il comando gira e il bot risponde con l'elenco.
- [ ] Chiedi un altro comando, poi **Nega**: il bot dice che è stato negato.
- [ ] **Consenti sempre in questa chat**: il comando dopo non chiede più. In Impostazioni → Sicurezza la chat compare in lista. Toglila con Rimuovi.
- [ ] Chiedi un comando, metti l'app in background e aspetta la notifica "Comando da approvare". Toccala: si apre la scheda. Nella notifica **non** compare il testo del comando.
- [ ] Doppio tocco veloce su Consenti: il comando parte una volta sola.
- [ ] Non rispondere per 5 minuti: il comando viene negato da solo.

## 2. Dashboard macchina
- [ ] Impostazioni → Macchina: CPU, RAM, disco, temperatura, carico e uptime hanno valori sensati. Ogni ~5 s si aggiornano.
- [ ] La lista "Errori recenti" è vuota o contiene righe vere del log.
- [ ] Riavvia gateway → conferma: l'app si riconnette e l'uptime del gateway riparte da zero.

## 3. Costi
- [ ] Impostazioni → Costi: c'è il banner "N modelli senza prezzo". Imposta un prezzo per il modello che usi; in OpenRouter i prezzi sono per 1M di token.
- [ ] I totali di oggi, 7 e 30 giorni cambiano. Le barre giornaliere si possono toccare e mostrano il dettaglio per modello.
- [ ] Imposta un tetto giornaliero basso (es. $0.01), poi fai una domanda e metti l'app in background. Entro ~10 min arriva **una** notifica di superamento, e non si ripete nello stesso giorno.
- [ ] Modifica un prezzo che ha il cache-write: dopo il salvataggio il cache-write è ancora lì.
- [ ] Togli il tetto (campo vuoto).

## 4. Libreria prompt
- [ ] Composer → icona prompt → Nuovo prompt "Traduci" con corpo `Traduci in {{lingua}}: {{testo}}`. Salva.
- [ ] Sceglilo: chiede `lingua` e `testo`, poi inserisce il testo nella bozza **senza inviare**.
- [ ] Scrivi una bozza → "Salva bozza come prompt": il corpo è precompilato.
- [ ] In una chat di progetto, crea un prompt con "Solo questo progetto". Compare in quella chat e nella scheda del progetto, non in una chat normale né in Impostazioni → Prompt.

## 5. Backup ed export
- [ ] Menu della chat → Esporta come Markdown, poi come PDF: si apre la condivisione Android, e il file contiene domande, risposte e blocchi di codice.
- [ ] Scheda progetto → Esporta progetto: contiene istruzioni, lista file e chat del progetto.
- [ ] Impostazioni → Backup → **Crea backup ora**: dopo qualche secondo compare in lista con data e dimensione.
- [ ] Non c'è nessun bottone per scaricare il backup sul telefono.
- [ ] (Opzionale, solo se te la senti) Ripristina il backup appena fatto: conferma forte, il gateway si riavvia e l'app si riconnette. Sul server rimane `~/.nanobot.pre-restore-<data>`.

## 6. Voce continua
- [ ] Composer → icona conversazione vocale. Parla, poi stai zitto: dopo ~1,5 s trascrive e invia da solo.
- [ ] Il bot risponde a voce, poi torna ad ascoltare da solo.
- [ ] Mentre parla, **Interrompi**: si zittisce e ti ascolta.
- [ ] **Termina**: si ferma tutto. La risposta in corso del bot continua in chat.
- [ ] Metti l'app in background durante l'ascolto: la conversazione si chiude.
- [ ] Prova in una stanza rumorosa. Se taglia troppo presto o non chiude mai, annota il comportamento: vanno regolate le soglie del silenzio.

## 7. Sicurezza e dispositivi
- [ ] Impostazioni → Dispositivi: il telefono compare con la scritta "questo telefono".
- [ ] Da un secondo dispositivo, se ce l'hai, revoca il primo: l'app revocata perde subito la connessione, senza aspettare.
- [ ] Un telefono abbinato non può generare nuovi codici di abbinamento.

## 8. Regressioni rapide
- [ ] Chat normale con streaming, cambio modello, effort, allegato immagine.
- [ ] Le chat vecchie si aprono con la cronologia.
- [ ] Kanban: un task assegnato a un bot passa da ready a done o review (ora i bot usano il tool unico `kanban`).
- [ ] Widget, notifiche e condivisione verso l'app funzionano come prima.
