# Kalkulator zaliczek CO/CWU — v1.0.0

Planowanie miesięcznych zaliczek na centralne ogrzewanie (CO) i ciepłą wodę
użytkową (CWU) dla budynków spółdzielni mieszkaniowej. Czysty HTML/CSS/JS,
uruchamiany z `file://` (bez serwera, bez frameworka) — architektura i język
wizualny przeniesione z PV.SIM.

## Uruchomienie

Otwórz `kalkulator-zaliczek.v0.1.html` w przeglądarce. Folder `css/` i `js/`
muszą leżeć obok pliku HTML.

## Struktura

```
kalkulator-zaliczek.v0.1.html   strona główna (na końcu pliku — kolejność <script>)
css/
  kz.tokens.css                 zmienne (kolory, odstępy) — motyw jasny
  kz.layout.css                 layout (nagłówek, moduły, kontrolki, stopka)
  kz.components.css             komponenty (macierze, wykresy, przyciski)
js/                             ładowane W TEJ kolejności (brak ES modules):
  kz.config.js                  namespace KZ, stałe, P.state
  kz.data.js                    magazyny records/prices/advances + CRUD
  kz.estimate.js                prognoza zużycia, simulate(), metricMatrix()
  kz.persist.js                 eksport/import JSON + autosave
  kz.render.js                  wspólne helpery (formatery, szkielet SVG)
  kz.render.m01.js              Moduł 01 — macierz danych
  kz.render.m02.js              Moduł 02 — zużycie (8 wielkości)
  kz.render.m03.js              Moduł 03 — macierz stawek zaliczek
  kz.render.m04.js              Moduł 04 — dobór zaliczek
  kz.app.js                     orkiestracja: update(), init(), listenery
```

Wzorzec jak w PV.SIM: brak ES modules (Chrome blokuje `import/export` na
`file://`), zamiast tego IIFE + jeden namespace `window.KZ`. Każda zmiana w UI
woła `KZ.update()`, które przelicza symulację i renderuje wszystkie moduły.

## Model danych (serializowany do JSON)

- `KZ.records`  — `{id, building, medium, year, month, gj, qty}`; `qty` = m² (CO) lub m³ (CWU)
- `KZ.prices`   — `"RRRR-MM" → zł/GJ` (wspólne dla wszystkich budynków, dostawca ECO)
- `KZ.advances` — `"budynek|medium|RRRR-MM" → stawka jednostkowa` (CO: zł/m², CWU: zł/m³; wpisana w Module 03 lub dobrana przez `simulate`)
- `KZ.areas`    — `"budynek" → m²` (powierzchnia, jedna na budynek; synchronizowana z `qty` rekordów CO)

Moduł 01 to **macierz**: wiersze = miesiące, kolumny = budynki; w każdej komórce
GJ‑CO, GJ‑CWU i m³ wody, a powierzchnia jest w nagłówku kolumny. Jawny układ
(kolumny i zakres miesięcy) trzymany jest w `state.m01Cols / m01From / m01To`,
co pozwala dokładać puste budynki i miesiące. Pod spodem dane nadal żyją w
`records[]`, więc Moduły 02–04 działają bez zmian.

## Algorytm zaliczek

Zaliczki liczone są **per budynek i medium**, na zakresie miesięcy z Modułu 01,
osobno dla każdego **okresu rozliczeniowego** (CO = rok / 12 mies., CWU =
półrocze / 6 mies.).

1. **Prognoza zużycia** dla pustego „ogona" miesięcy — z tego samego miesiąca
   kalendarzowego w poprzednich latach:
   - 0 próbek → miesiąc pomijany (brak symulacji),
   - 1 próbka → trend płaski równy tej wartości,
   - ≥2 próbki → regresja liniowa względem **roku** i ekstrapolacja.

   Dla **CWU** GJ można prognozować na dwa sposoby (przełącznik „Baza prognozy"
   w Module 02, `state.cwuBasis`): `'intensity'` — `trend(GJ/m³) × trend(m³)`,
   rozdzielający część fizyczną (energia na m³) od zachowania (zużycie wody)
   (domyślnie), lub `'gj'` — trend wprost na GJ. Dla **CO** wybór jest bez
   znaczenia (driver = stała powierzchnia, więc `trend(GJ/m²)×m² ≡ trend(GJ)`).
2. **Koszt miesiąca** = zużycie_GJ × cena_GJ(rok, miesiąc). Cena bez wpisu
   dziedziczy ostatnią znaną wcześniejszą (carry-forward; ECO ogłasza taryfy
   z wyprzedzeniem — można je wpisać).
3. **Zaliczki ustalone (Moduł 03).** Stawka **jednostkowa** wpisana ręcznie
   w macierzy M03 (CO: zł/m², CWU: zł/m³). Miesięczna zaliczka = `stawka × driver`,
   gdzie driver to powierzchnia budynku (CO) lub zużycie wody danego miesiąca (CWU).
   Dziura między wpisanymi stawkami dziedziczy stawkę wcześniejszą (carry-forward).
4. **Zaliczki dobierane (Moduł 04).** Pusty „ogon" po ostatniej wpisanej stawce
   dostaje **jedną stałą stawkę na każdy okres rozliczeniowy**, tak by saldo
   (zaliczki − koszt) zeszło do zera **na końcu KAŻDEGO okresu**:
   `stawka_okresu = max(0, (Σkoszt_okresu − Σzaliczki_ustalone_okresu) / Σdriver_ogona_okresu)`.
   Nadwyżka z okresów historycznych (gdy ustalone zaliczki przewyższały koszt)
   **nie jest odrabiana** w kolejnych okresach — wraca do lokatorów jako zwrot
   za dany okres. Skumulowany wykres koszt vs zaliczki (Moduł 04) **resetuje się
   na granicy każdego okresu** → kształt „ząbków".

## Założenia (łatwe do zmiany)

- **Okres rozliczeniowy:** CO = 12 mies., CWU = 6 mies. Start okresu konfigurowalny
  w `state.periodStartCO` / `periodStartCWU` (domyślnie styczeń → CO: I–XII;
  CWU: I–VI / VII–XII). Bilansowanie jest **per okres** — każdy okres domyka saldo
  osobno (zob. krok 4 algorytmu).
- **Przeszłość vs przyszłość:** miesiąc bez rekordu to „ogon" prognozy (liczony
  trendem); zaliczki ustalone (M03) są nienaruszalne, dobierany jest tylko pusty
  ogon po ostatniej wpisanej stawce.
- **Zaliczka per budynek** (nie per lokal). Alokacja na lokale (CWU wg m³, CO wg m²)
  do dodania w kolejnej iteracji.
- **Baza prognozy CWU:** domyślnie `'intensity'` (`trend(GJ/m³) × trend(m³)` — rozdziela
  energię na m³ od zużycia wody); przełącznik „Baza prognozy" w Module 02 pozwala wrócić
  do `'gj'` (trend wprost na GJ). Dla CO bez znaczenia (driver = stała powierzchnia).
- **Trwałość:** główny mechanizm to eksport/import pliku JSON (Zapisz/Wczytaj/Wyczyść
  w górnym pasku); dodatkowo best-effort autosave w `localStorage`.

## Świadomie pominięte

Alokacja na poszczególne lokale, wybór wielu metod estymacji (jest jedna: trend),
margines bezpieczeństwa (%). Wszystko łatwe do dołożenia w architekturze KZ.
