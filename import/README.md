# Importer raportów ZWM/ECO → JSON kalkulatora

Generyczne narzędzie (Node, bez zależności, offline) budujące plik importu kalkulatora
z miesięcznych raportów `raport_pracy_<ea>_<n0x>_RRRR_MM.xlsx`. Wynik wczytuje się
ręcznie w UI przyciskiem **Wczytaj** — aplikacja nie referuje tych plików.

## Pliki

| Plik | Rola |
|------|------|
| `build-import.js`     | Silnik: parser xlsx, preflight, build, walidacja regresji. **Nie wymaga edycji przy nowym węźle.** |
| `config-gr.js`        | Konfiguracja zadania (co zbudować). Konwencja: `config-<grupa>.js`, jeden plik per grupa/węzeł. |
| `import_gr4_gr11.json`| Aktualny wynik produkcyjny: SM Opole, EA1/N01 → GR-04…GR-11, 2023-01…2026-05. |

## Użycie

```sh
node import/build-import.js config-gr.js            # build + walidacja
node import/build-import.js config-gr.js --check     # SAM preflight (nie zapisuje pliku)
node import/build-import.js                          # bez configu → wypisze dostępne config-*.js
```

Config jest **wymagany** (brak argumentu → lista dostępnych `config-*.js` i wyjście). Konwencja nazw:
`config-<grupa>.js` (np. `config-gr.js`, `config-op.js`) — jeden plik per grupa/węzeł.
Na Windowsie: `& "C:\Program Files\nodejs\node.exe" import/build-import.js config-gr.js`.

## Preflight — ZAWSZE pierwszy krok (ochrona przed literówką w nazwach budynków)

Każde uruchomienie zaczyna się od preflightu, który na pierwszym i ostatnim miesiącu zakresu:
- wypisuje **wszystkie dostępne `id` budynków** w raporcie (z wiersza 13) wraz z ich kolumną,
- potwierdza, że każdy `id` z Twojego configu istnieje (✓/✗),
- sprawdza obecność wszystkich kotwic (cena, powierzchnia, liczniki, temperatura, stawki).

Przy jakimkolwiek braku (zły `id`, brak pliku, brak kotwicy) **przerywa bez zapisu**.
Uruchom `--check`, zerknij na listę dostępnych `id` i dopiero potem buduj.

## Config

```js
module.exports = {
  outFile: 'import_xxx.json',          // względem import/ lub ścieżka absolutna
  root: 'C:/.../Backup raportów miesiecznych',
  from: '2023-01', to: '2026-05',
  validateAgainst: 'import_xxx.json',  // opcjonalnie: regresja nowego buildu vs wersja na dysku
  sources: [                            // można łączyć kilka węzłów w jeden plik
    { node: 'EA1/N01', buildings: [
        { name: 'GR-04', id: '4' },     // name = etykieta w aplikacji; id = DOKŁADNA wartość z R13
        { name: 'GR-05', id: '5' },
    ]},
  ],
  // state: { periodStartCO: 1 },        // opcjonalne nadpisania state UI
};
```

### Kluczowe zasady

- **`id` to dokładny ciąg z wiersza 13 raportu**, różny per węzeł i NIE liczony po kolei:
  GR → `4,5,6…`; BR → `14a,15c,16d…`; OP → `1,2,3,4,5,7,9,11…` (z lukami); B5 → `05`.
  Nie zgaduj — uruchom `--check`, skopiuj `id` z listy.
- **`name`** musi być unikalny globalnie, bez `|`, różny od sentinela `__laczne__`.
- Kolumna „Razem" i lokale użytkowe (np. `Gr6`, `SkOp7a`) są pomijane automatycznie.
- Inny węzeł = dopisanie obiektu do `sources`. Silnik kotwiczy po etykietach, więc te same
  wiersze działają dla wszystkich węzłów ZWM/ECO (zweryfikowane: EA1/N01, EA2/N01, EA2/N04,
  EA3/N01, EA3/N03, EA4/N06). Jedyna znana różnica — wodomierz: GR ma `(LC3)`, reszta `(W2)` —
  jest już obsłużona (kotwica „wody zimn").

## Co silnik liczy

- **records** (CO: gj=Różnica CO, qty=powierzchnia; CWU: gj=Różnica CWU, qty=Różnica woda),
  CO klampowane do ≥ 0 (letnie artefakty licznika).
- **prices** (wspólna na miesiąc, z „Cena ciepła zmienna", zaokr. 2),
  **temps** (wspólna, średnia po wszystkich żądanych budynkach, zaokr. 1),
  **advances** (`name|CO|RRRR-MM` i `…|CWU|…`, stawki zmienne, zaokr. 2),
  **areas** (powierzchnia bieżąca per budynek).
- Pułapka „Różnica": przy legalizacji licznika stan jest tekstem — wartość brana z wiersza
  Różnica (+2), z fallbackiem `koniec − początek`.

## Walidacja regresji

`validateAgainst` może wskazywać **ten sam** plik co `outFile` — referencja wczytywana jest
przed nadpisaniem, więc po zmianie silnika od razu widać, czy budynki obecne w obu wersjach
dają identyczne liczby (mapowanie po `budynek|medium|rok|mies`).
