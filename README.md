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
kalkulator-zaliczek.v0.1.html   strona główna (kolejność ładowania skryptów)
css/  kz.tokens / kz.layout / kz.components
js/   kz.config → data → estimate → persist → render → render.m01..m04 → app
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
- **Trend liczony na GJ** (nie na intensywności GJ/m²·m³); wskaźniki intensywności
  są diagnostyczne (Moduł 02).
- **Trwałość:** główny mechanizm to eksport/import pliku JSON (Zapisz/Wczytaj/Wyczyść
  w górnym pasku); dodatkowo best-effort autosave w `localStorage`.

## Świadomie pominięte

Alokacja na poszczególne lokale, wybór wielu metod estymacji (jest jedna: trend),
margines bezpieczeństwa (%). Wszystko łatwe do dołożenia w architekturze KZ.
