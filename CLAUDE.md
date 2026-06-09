# CLAUDE.md

Wskazówki dla Claude Code przy pracy nad tym repo. Pełny opis domeny i algorytmu jest w [README.md](README.md) — tu skupiamy się na tym, co krytyczne przy edycji kodu.

## Czym jest projekt

Kalkulator miesięcznych zaliczek na CO (centralne ogrzewanie) i CWU (ciepła woda
użytkowa) dla budynków spółdzielni mieszkaniowej. Czysty HTML/CSS/JS, **bez
serwera i bez frameworka**, uruchamiany bezpośrednio z `file://`.

## Uruchomienie i testowanie

- Otwórz [kalkulator-zaliczek.v1.0.html](kalkulator-zaliczek.v1.0.html) w przeglądarce — to wszystko. Brak buildu, brak `npm`, brak dependencji.
- Foldery `css/` i `js/` muszą leżeć obok pliku HTML.
- Brak testów automatycznych i lintera — weryfikacja jest ręczna w przeglądarce (DevTools console).

## Twarde ograniczenia architektury (NIE łamać)

1. **Żadnych ES modules** — Chrome blokuje `import`/`export` na `file://`. Każdy
   plik JS to IIFE `(function(P){ 'use strict'; ... })(window.KZ);` rozszerzające
   wspólny namespace `window.KZ`.
2. **Sztywna kolejność ładowania skryptów** (zob. koniec pliku HTML):
   `config → data → estimate → persist → render → render.m01..m04 → app`.
   Nowy plik JS musi dostać `<script>` we właściwym miejscu tej kolejności.
3. **Żadnych zewnętrznych bibliotek JS.** Wykresy to ręcznie generowany SVG
   (zob. helpery `P._frame`, `P._smoothPath`, `P._niceMax` w [js/kz.render.js](js/kz.render.js)).
   Jedyna zewnętrzna zależność to font z Google Fonts (kosmetyka).
4. **Bez `cdn`/fetch** — całość działa offline z dysku.

## Mapa plików

| Plik | Rola |
|------|------|
| [js/kz.config.js](js/kz.config.js) | Namespace `KZ`, stałe (`MONTHS`, `MEDIA`), `P.state` — jedyne źródło prawdy UI |
| [js/kz.data.js](js/kz.data.js) | Magazyny `records`/`prices`/`advances` + CRUD, klucze, `periodWindow`, `isPast` |
| [js/kz.estimate.js](js/kz.estimate.js) | Prognoza zużycia (trend liniowy), `simulate()` (dobór zaliczek na zakresie M01: ustalone z M03 + dobrany „ogon"), `metricMatrix(metric)` (wielkość + prognoza „ogona" dla M02) |
| [js/kz.persist.js](js/kz.persist.js) | Eksport/import JSON + best-effort autosave w `localStorage` |
| [js/kz.render.js](js/kz.render.js) | Wspólne helpery: formatery `P.fmt`, szkielet wykresów SVG (`_frame` przyjmuje `opts.fmtY`) |
| [js/kz.render.m01..m04.js](js/) | Render poszczególnych modułów (01 dane, 02 zużycie — 8 wielkości, 03 macierz stawek zaliczek, 04 dobór zaliczek — select widoku: wysokość zaliczek / koszt vs zaliczki CO / CWU) |
| [js/kz.app.js](js/kz.app.js) | Orkiestracja: `P.update()`, `init()`, wszystkie listenery (ładowany OSTATNI) |
| `css/kz.tokens / kz.layout / kz.components` | Tokeny (zmienne), layout, komponenty (jasny motyw) |

## Przepływ danych

- Każda zmiana w UI woła **`P.update()`** (lub `P.requestUpdate()` — debounce przez `requestAnimationFrame`), które przelicza `simulate()` i renderuje wszystkie moduły.
- `P.state` trzyma **tylko ustawienia UI**. Dane domenowe są w osobnych magazynach (`P.records`, `P.prices`, `P.advances`), żeby łatwo je serializować do JSON.
- Listenery podpięte przez **delegację zdarzeń** na stabilnych kontenerach (np. `#kz-m01-matrix`), bo tabele są przerysowywane przez `innerHTML`. Dodając edytowalne pola, trzymaj się wzorca `data-*` + delegacja (zob. [js/kz.app.js](js/kz.app.js)).
- **Focus podczas edycji:** przerysowanie kontenera przez `innerHTML` gubi focus w polu. Dlatego edycja komórek M01 woła `requestSimRefresh()` (renderuje tylko M02 + M04, NIE macierze — M03 ze stawkami nie zależy od danych M01), a edycja stawek w M03 odświeża tylko M04 (`P.renderM04(P.simulate())`), bez przebudowy macierzy M03. Pełne `P.update()` (przebudowa macierzy) tylko przy zmianie struktury: dodanie/usunięcie budynku lub miesiąca.

## Moduł 01 — macierz danych

M01 to **macierz**: wiersze = miesiące (w dół), kolumny = budynki (w bok). Jest medium-agnostyczna — w każdej komórce trzy pola: GJ‑CO, GJ‑CWU, m³ wody; powierzchnia [m²] jest jedna na budynek (nagłówek kolumny). Przyciski rozszerzają zakres: miesiąc wcześniej/później, budynek z lewej/prawej. Kontener `.kz-matrix-wrap` przewija się (sticky nagłówek i pierwsza kolumna).

Pod spodem nadal żyje model `records[]`: komórka mapuje się na rekord CO (`gj`=GJ‑CO, `qty`=powierzchnia) i rekord CWU (`gj`=GJ‑CWU, `qty`=woda). Powierzchnia trzymana w `P.areas[building]` i synchronizowana z `qty` rekordów CO (zob. `P.setArea`). Jawny układ kolumn/wierszy żyje w `state.m01Cols` / `m01From` / `m01To`, leniwie zasiewany z danych przez `P.m01EnsureLayout()`. Dzięki temu Moduły 02–04 i estymacja działają bez zmian.

**Cena ciepła** (jedna na miesiąc, klucz `"RRRR-MM"` w `P.prices`) ma regułę **carry-forward**: `P.getPrice(y,m)` przy braku jawnego wpisu zwraca najbliższą dostępną wartość **wcześniejszą** (gdy nic wcześniej nie ma → 0). `P.hasExplicitPrice` odróżnia wpis jawny od odziedziczonego — input w M01 pokazuje pusto dla dziedziczonych komórek, a odziedziczoną cenę podpowiada w `placeholder`.

## Moduł 02 — zużycie (8 wielkości)

Wykres słupkowy dla **jednego budynku** (własny select `state.m02Building`) po zakresie miesięcy M01. Jeden select (`#kz-m02-metric`, stan `state.m02Metric`) wybiera jedną z 8 wielkości zdefiniowanych w `P.M02_METRICS` ([js/kz.config.js](js/kz.config.js)): CO‑wskaźnik [GJ/m²], CO‑zużycie [GJ], **CO‑koszt [zł]**, CWU‑wskaźnik [GJ/m³], CWU‑zużycie [GJ], CWU‑woda [m³], **CWU‑koszt [zł]**, **Cena ciepła [zł/GJ]**. Każda metryka ma `{ medium, field, label, unit }`, gdzie `field` to `'intensity'` (GJ/dzielnik), `'gj'`, `'qty'`, `'cost'` (GJ × cena) lub `'price'` (cena ciepła — wartość globalna z `P.prices`, niezależna od budynku/zużycia). Oś X = miesiące, jeden słupek na miesiąc, jeden kolor serii (`COLOR`), bez legendy. Metodę prognozy trzyma `state.m02Method` (na teraz tylko `'trend'`).

**Baza prognozy CWU** (`state.cwuBasis`, select `#kz-m02-basis`): `'intensity'` = `forecastGJ = trend(GJ/m³) × trend(m³)` (domyślnie; zob. `forecastIntensity` w [js/kz.estimate.js](js/kz.estimate.js)), `'gj'` = trend wprost na GJ. To **globalne ustawienie CWU** — zawsze aktywne (nie blokujemy go przy metryce CO; dla CO i tak nic nie zmienia, bo driver = stała powierzchnia, więc `trend(GJ/m²)×m² ≡ trend(GJ)`). **Wpływa na M04** (przestawia `P.forecastGJ` dla CWU → koszt i dobór zaliczek), dlatego listener w app.js woła pełne `P.update()`, nie sam `renderM02`. Stary plik JSON bez `cwuBasis` → `Object.assign` zachowuje domyślne `'intensity'`.

Dane liczy `P.metricMatrix(metric)` w [js/kz.estimate.js](js/kz.estimate.js) (zwraca serie wszystkich budynków; render wybiera tylko aktywny): każda komórka ma status `actual` (jest rekord), `forecast` (pusty **„ogon"** — miesiąc po ostatnim z danymi dla budynku, policzalny trendem analogicznych miesięcy) albo `none` (luka/brak próbek → pomijana). „Pusty" miesiąc = brak GJ‑CO, GJ‑CWU **i** wody; cena nie jest kryterium. Słupki prognozy rysowane jaśniej + przerywanym obrysem; dodatkowo pionowa kreska **„prognoza →"** (przy pierwszej komórce `forecast`) i lekkie tło na prawo od niej oddzielają „ogon" prognozy od faktów. M02 nie korzysta z kursora „Teraz"/horyzontu (to dotyczy M03–M04) — granicą jest ostatni miesiąc z danymi per budynek.

## Moduł 03 — Zaliczki ustalone (macierz stawek)

M03 to **macierz** o tym samym układzie co M01 (kolumny = budynki `P.m01ColBuildings()`, wiersze = miesiące `P.m01Months()`; bez własnych przycisków struktury). W każdej komórce dwa pola: **stawka CO [zł/m²]** (`data-adv-med="CO"`) i **stawka CWU [zł/m³]** (`data-adv-med="CWU"`). Wpis to **stawka jednostkowa** zapisywana w `P.advances` (klucz `budynek|medium|RRRR-MM`) — zmieniona semantyka względem poprzedniej wersji (było: kwota miesięczna).

Miesięczną zaliczkę liczy `simulate()` (zob. Moduł 04): `stawka × driver`, gdzie driver to **powierzchnia budynku** dla CO i **zużycie wody danego miesiąca** (fakt lub prognoza „ogona") dla CWU. Wpisy z M03 są **ustalone** (nienaruszalne).

## Moduł 04 — Dobór zaliczek

M04 dobiera „ogon" zaliczek i porównuje narastająco koszt (fakt + prognoza, amber) z zaliczkami (ustalone + dobrane, fiolet). Skumulowane serie (widoki `co`/`cwu`) **resetują się na początku każdego okresu rozliczeniowego** → wykres ma kształt **„ząbków"** (w obrębie okresu rosną, na granicy spadają do zera i liczą od nowa); `out.cum.period[]` trzyma indeks okresu per miesiąc (render rozbija łamane i wypełnienie na segmenty per okres), a sumy globalne (`totalCost`/`totalAdv`/`overshoot`) liczone są osobno. `simulate()` działa **na zakresie miesięcy z M01** (`P.m01Months()`), nie na `planMonths()`. Logika stawek:

- **Ustalone** — wpisy z M03 do **ostatniej wpisanej** włącznie. Dziura między wpisanymi → uzupełniana stawką **wcześniejszą** (carry-forward).
- **Dobierane** — pusty „ogon" po ostatniej wpisanej: stawka dobierana **osobno dla każdego okresu rozliczeniowego** (CO rok / 12 mies., CWU półrocze / 6 mies.; start z `state.periodStartCO`/`periodStartCWU`). Cel: saldo → 0 **na końcu KAŻDEGO okresu**, nie tylko na końcu zakresu. Nowy okres może dostać inną stałą stawkę: `flat_okres = (Σkoszt_okresu − Σzaliczki_ustalone_okresu) / Σdriver_ogon_okresu`, ograniczona do ≥ 0 (gdy ustalone już przewyższają koszt okresu → 0, saldo zostaje dodatnie). Agregacja po `periodKey` (ten sam wzór co `P.isPeriodEnd`); bilansowanie obejmuje tylko miesiące z zakresu M01. `simulate` zwraca `flatRates` (lista kolejnych dobranych stawek) oraz `flatRate` (pierwsza z nich — zgodność wstecz).

`simulate(building, medium)` zwraca `{ months, totalCost, totalAdv, overshoot (saldo = adv − cost), nFixed, nComputed, firstComputed (indeks początku doboru lub −1), flatRate (pierwsza dobrana stawka lub null), flatRates (lista dobranych stawek per okres), periodLen, building, medium, cum:{cost,adv,labels,period} }` (`cum.*` resetują się per okres rozliczeniowy — „ząbki"). Budynek rozwiązuje `P.m04Building()` (własny select M04, `state.m04Building`); `P.renderM04(simCO, simCWU)` dostaje obie symulacje (CO i CWU) — w app.js liczy je `renderM04Both()`.

Kontrolki M04:
- **Budynek** (`#kz-m04-building`) — własny select, jak w M02.
- **Okres rozliczeniowy** — dwa **chipy informacyjne** (`disabled`, tylko etykiety): `#kz-m04-period-co` = 12 mies./rok, `#kz-m04-period-cwu` = 6 mies./półrocze. Nie są przełącznikami; oba okresy są zawsze aktywne (CO roczny, CWU półroczny).
- **Na wykresie** (`<select id="kz-m04-view">`, stan `state.m04View`) wybiera treść wykresu — **6 widoków, każdy dla JEDNEGO medium**: `'adv_co'`/`'adv_cwu'` = **zebrane zaliczki** (miesięczne kwoty [zł]), `'rate_co'`/`'rate_cwu'` = **stawki zaliczek** (jednostkowe CO [zł/m²] / CWU [zł/m³]), `'co'`/`'cwu'` = skumulowany koszt vs zaliczki. Dispatch w `renderM04` wybiera jedną symulację (`sim`) z `simCO`/`simCWU` wg sufiksu widoku i woła `drawAdv(sim)` / `drawRate(sim)` / `drawCum(sim)` (wszystkie jednomedialne). W `adv`/`rate` część ustalona jest linią ciągłą, dobrany „ogon" przerywaną. Render znaczy pionowo początek doboru (`firstComputed`, helper `doborMark` — „dobór →"), cieniuje lekko tło na prawo od tej linii (helper `doborShade` — obszar dobieranego „ogona") i pokazuje dobraną stawkę w nagłówku (widoki `rate`/`cum`). Helper `dots` przyjmuje opcjonalne formatery `fmtVal`/`fmtTip` (widok `rate` używa `pl2` + jednostki).

Wykresy znaczą też **granice okresów rozliczeniowych** (helper `periodMarks` + `P.isPeriodEnd(medium,y,m)`): pionowa kreska kropkowana na prawej krawędzi miesiąca kończącego okres (CO co 12 mies., CWU co 6 mies.; start z `state.periodStartCO`/`periodStartCWU`). Każdy widok jest jednomedialny, więc rysuje granice **tylko swojego medium** (`periodMarks(fr, months, slot, sim.medium)`).

Górny pasek kontekstu zredukowany do przycisków stanu (Zapisz/Wczytaj/Wyczyść); dawne kontrolki „Teraz"/budynek/medium/horyzont oraz prawy sidebar zostały **usunięte**.

## Konwencje

- Komentarze i UI po **polsku** (z pełnymi znakami diakrytycznymi). Identyfikatory kodu po angielsku/jak w istniejącym kodzie.
- W IIFE parametr nazywa się `P` (= `window.KZ`); w treści README ten sam namespace bywa pisany wprost jako `KZ`.
- Formatowanie liczb przez `P.fmt` (locale `pl-PL`), nie ręcznie.
- Klucze: cena `"RRRR-MM"`, zaliczka `"budynek|medium|RRRR-MM"`, miesiąc bezwzględny `P.absM(y,m)` do porównań/okresów.

## Uwaga o wersji

Wersja `1.0.0` jest zapisana w **czterech** miejscach, które trzeba synchronizować przy bumpie: `P.VERSION` w [js/kz.config.js](js/kz.config.js), nagłówek/stopka w [kalkulator-zaliczek.v1.0.html](kalkulator-zaliczek.v1.0.html), tytuł w README oraz **nazwa pliku HTML** (`…v1.0.html` — odzwierciedla wersję `major.minor`; przy bumpie zmienić nazwę i wszystkie linki do niej w README/CLAUDE). Uwaga: zmiana nazwy łamie istniejące zakładki/linki do starej nazwy.
