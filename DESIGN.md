# DESIGN.md — Post-it (telefono)

## Soggetto e persone
Luca, sul telefono: scrive al volo un post-it che poi ritrova sul desktop del PC, e
rilegge quelli del PC fuori casa. Stessi post-it, stessi colori e temi del blocchetto.

## Colori
- Scrivania #1b1814 — fondo: i post-it ci stanno appoggiati sopra
- Ripiano #26221c — barre e fogli a scomparsa
- Gesso #efe6d6 — testo dell'interfaccia; Polvere #a99f8e — testo secondario
- Carte e strisce adesive: le stesse otto del PC (Canarino #FFF27A … Bianco #F7F7F2)
- Inchiostri: gli stessi sei del PC (Grafite #3B3423 predefinito)
- Rosso inchiostro #C0392B solo per "Elimina"
- Verde inchiostro #2E7D32 solo per il pallino "in linea"

## Tipografia
- Post-it: Kalam 700 (scrittura a mano, ha il grassetto vero: il testo è grassetto
  di predefinito come sul PC), 400 per il testo "non grassetto".
- Interfaccia: carattere di sistema (Roboto), che rispetta la scala del telefono (1,3).

## Un dettaglio caratterizzante
I post-it nella lista sono foglietti quadrati con la striscia adesiva più scura in cima
(dove sta il tema) e appena storti, come attaccati a mano. Il + in basso stacca un
post-it del colore del filtro scelto.

## Glossario
"post-it", "tema", "Tutti", "Elimina", "Accedi", "Esci dall'account". Mai "nota", "card".

## Tono per momento
Errore di accesso: causa e rimedio. Eliminazione: fascia "Eliminare questo post-it?"
Annulla / Elimina, come sul PC. Vuoto: cosa apparirà e il + per riempirlo.
Offline: pallino grigio, le modifiche partono da sole quando torna la rete.

## Stati
Accesso (solo la prima volta), caricamento (copia locale se c'è), lista vuota,
filtro vuoto, editor, conferma eliminazione, offline.

## Default
Filtro: l'ultimo usato. Nuovo post-it: colore del filtro, se no Canarino.
Un post-it nuovo lasciato vuoto non viene creato.
