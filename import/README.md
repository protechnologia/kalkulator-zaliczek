# Importer raportów ZWM/ECO → JSON kalkulatora

Generyczne narzędzie (Node, bez zależności, offline) budujące plik importu kalkulatora
z miesięcznych raportów `raport_pracy_<ea>_<n0x>_RRRR_MM.xlsx`. Wynik wczytuje się
ręcznie w UI przyciskiem **Wczytaj** — aplikacja nie referuje tych plików.

## Pliki

| Plik | Rola |
|------|------|
| `build-import.js`      | Silnik: parser xlsx, preflight, build, walidacja regresji. **Nie wymaga edycji przy nowym węźle.** |
| `config-<węzeł>-<grupa>.js` | Konfiguracja zadania (co zbudować). Jeden plik per grupa/węzeł. |
| `import-<węzeł>-<grupa>.json` | Wynik produkcyjny (wczytywany ręcznie w UI). |

**12 węzłów SM Opole** (komplet, prefiks nazwy = skrót ulicy + numer z R13):

| Węzeł / grupa | Budynki (ulice) | Zakres | Stawki od |
|---|---|---|---|
| EA1/N01 · GR  | GR-04…GR-11 (Gen. Roweckiego) | 2020-01…2026-05 | 2020-07 |
| EA2/N01 · BR  | BR-14a…21b + HU-17a/17b (B. Rudego, Hubala) | 2020-01…2026-05 | 2020-07 |
| EA2/N02 · FH  | FI-4a…14, HU-25/27 (Fieldorfa, Hubala) — 8 | 2020-01…2026-05 | 2020-07 |
| EA2/N03 · HP  | HU-01…20b, PU-24a…46a (Hubala, Pużaka) — 17 | 2020-01…2026-05 | 2020-07 |
| EA2/N04 · H04 | HU-04 (Hubala) — 1 | 2020-01…2026-05 | 2020-07 |
| EA3/N01 · SS  | SS-10…70 (Szarych Szeregów) — 14 | 2020-01…2026-05 | 2020-07 |
| EA3/N02 · BZ  | BZ-1…6, SS-3/13/15 (Bat. Zośki, Szar. Szer.) — 8 | 2020-01…2026-05 | 2020-07 |
| EA3/N03 · OP  | SK-1…17, SS-25 (Skautów Opolskich, Szar. Szer.) — 11 | 2020-01…2026-05 | 2020-07 |
| EA3/N04 · ZP  | ZA-1…14, BP-7/11/19 (Zawiszaków, Bat. Parasol) — 9 | 2020-01…2026-05 | 2020-07 |
| EA4/N02 · BKW | BI-22…54, CH-24, KI-1/6, WI-18 (Bielska, Chełmska, Kielecka, Witosa) — 11 | **2021-12**…2026-05 | od początku |
| EA4/N03 · CC  | CH-11, CI-10/20/24 (Chełmska, Cieszyńska) — 4 | **2021-12**…2026-05 | od początku |
| EA4/N06 · B5  | BI-05 (Bielska) — 1 | **2021-12**…2026-05 | od początku |

Stawki zaliczek za **2026-06** ustawione ręcznie = 2026-05 we wszystkich plikach (spółdzielnia nie zmienia ich w trwającym czerwcu); poza tym `to: 2026-05`.

## Użycie

```sh
node import/build-import.js config-ea1-n01-gr.js            # build + walidacja
node import/build-import.js config-ea1-n01-gr.js --check     # SAM preflight (nie zapisuje pliku)
node import/build-import.js                                 # bez configu → wypisze dostępne config-*.js
```

Config jest **wymagany** (brak argumentu → lista dostępnych `config-*.js` i wyjście). Konwencja nazw:
`config-<węzeł>-<grupa>.js` (np. `config-ea1-n01-gr.js`, `config-ea2-n01-br.js`) — jeden plik per grupa/węzeł.
Na Windowsie: `& "C:\Program Files\nodejs\node.exe" import/build-import.js config-ea1-n01-gr.js`.

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
  outFile: 'import-xxx.json',          // względem import/ lub ścieżka absolutna
  root: 'C:/.../Backup raportów miesiecznych',
  from: '2023-01', to: '2026-05',
  validateAgainst: 'import-xxx.json',  // opcjonalnie: regresja nowego buildu vs wersja na dysku
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
  wiersze działają dla wszystkich węzłów ZWM/ECO (zweryfikowane: **wszystkie 12 węzłów** SM Opole,
  zob. tabela wyżej). Jedyna znana różnica — wodomierz: GR ma `(LC3)`, reszta `(W2)` —
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

## Dwa formaty raportów w czasie (obsłużone automatycznie)

- **Nazwa pliku**: ≤2022 `Raport pracy węzłów - EA1-N01-GR - RRRR.MM.xlsx`, ≥2022/23
  `raport_pracy_ea1_n01_RRRR_MM.xlsx` (przełączenie nastąpiło w trakcie 2022). Silnik rozwiązuje
  plik po **listingu folderu** (bierze nazwę kończącą się na `RRRR_MM.xlsx` lub `RRRR.MM.xlsx`),
  pomijając narastające `… RRRR.01-MM.xlsx` i `_ytd`. Nie trzeba nic ustawiać.
- **Wiele węzłów w jednym katalogu**: `…/ZWM/EA<x>/` zawiera pliki wszystkich węzłów grupy
  (`…_ea2_n01_…`, `…_ea2_n02_…`, …). Resolver filtruje po konkretnym węźle (token `ea2_n02`
  nowy / `ea2-n02` stary), więc nie myli np. N02 z N01. Bez tego brałby pierwszy plik z listy.
- **Stawki zaliczek** (`advCO`/`advCWU`) to kotwice **opcjonalne** — w starszych raportach ich nie
  ma (dla EA1/N01 pojawiają się od **2020-07**). Brak → preflight ostrzega (⚠, nie błąd), a build
  importuje zużycie/ceny/temperatury i **pomija advances** tych miesięcy. Pozostałe kotwice
  (powierzchnia, LC2, LC1-LC2, woda, temperatura, cena) są wymagane — ich brak przerywa build.

## Walidacja regresji

`validateAgainst` może wskazywać **ten sam** plik co `outFile` — referencja wczytywana jest
przed nadpisaniem, więc po zmianie silnika od razu widać, czy budynki obecne w obu wersjach
dają identyczne liczby (mapowanie po `budynek|medium|rok|mies`).
