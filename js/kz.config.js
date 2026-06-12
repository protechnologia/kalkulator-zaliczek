/* =========================================================
   KALKULATOR-ZALICZEK — Konfiguracja i stan

   Tworzy globalny namespace window.KZ (alias P w plikach modułów).
   Definiuje miesiące, stałe oraz P.state — jedyne źródło prawdy UI.

   Wzorzec architektoniczny: brak ES modules
   (Chrome blokuje import/export na file://), zamiast tego IIFE +
   window.KZ. Sztywna kolejność ładowania:
     config → climate → data → estimate → persist → render → render.mXX → app

   Ładowany jako PIERWSZY plik JS.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  P.VERSION = '1.1.0';

  // 1 GJ = 277.78 kWh (stała fizyczna, gdyby była potrzebna do przeliczeń)
  P.KWH_PER_GJ = 1000 / 3.6;

  // Miesiące — indeks 0..11 (styczeń = 0)
  P.MONTHS = [
    { id: 1,  abbr: 'STY', name: 'Styczeń'    },
    { id: 2,  abbr: 'LUT', name: 'Luty'       },
    { id: 3,  abbr: 'MAR', name: 'Marzec'     },
    { id: 4,  abbr: 'KWI', name: 'Kwiecień'   },
    { id: 5,  abbr: 'MAJ', name: 'Maj'        },
    { id: 6,  abbr: 'CZE', name: 'Czerwiec'   },
    { id: 7,  abbr: 'LIP', name: 'Lipiec'     },
    { id: 8,  abbr: 'SIE', name: 'Sierpień'   },
    { id: 9,  abbr: 'WRZ', name: 'Wrzesień'   },
    { id: 10, abbr: 'PAŹ', name: 'Październik' },
    { id: 11, abbr: 'LIS', name: 'Listopad'   },
    { id: 12, abbr: 'GRU', name: 'Grudzień'   }
  ];

  // Konfiguracja mediów: długość okresu rozliczeniowego i jednostka nośnika.
  //   CO  — rozliczane rocznie  (12 mies.), driver kosztu: powierzchnia [m²]
  //   CWU — rozliczane półrocznie (6 mies.), driver kosztu: woda [m³]
  P.MEDIA = {
    CO:  { label: 'CO',  full: 'Centralne ogrzewanie', periodLen: 12, unit: 'm²', qtyLabel: 'Powierzchnia', intensityLabel: 'GJ/m²' },
    CWU: { label: 'CWU', full: 'Ciepła woda użytkowa',  periodLen: 6,  unit: 'm³', qtyLabel: 'Woda',         intensityLabel: 'GJ/m³' }
  };

  // „Jednostka łączna" — dodatkowa pozycja selecta budynku w Module 04: wszystkie
  // budynki z M01 rozliczane jako JEDEN byt (suma kosztów, driverów i zaliczek).
  // Sentinel nie jest budynkiem (bez rekordów i kolumny w M01); nie może zawierać
  // znaku '|' (format kluczy P.advances) ani kolidować z nazwą budynku (guardy w data.js).
  P.MERGED = '__laczne__';
  P.MERGED_LABEL = 'Łącznie (wszystkie budynki)';
  P.unitLabel = b => b === P.MERGED ? P.MERGED_LABEL : b;   // etykieta jednostki do UI

  // Paleta kolorów serii (budynki) — Moduł 02. Kolor budynku = pozycja w m01Cols.
  P.SERIES_COLORS = ['#2dd4bf', '#f59e0b', '#a78bfa', '#a3e635', '#f472b6',
                     '#38bdf8', '#fb923c', '#4ade80', '#e879f9', '#facc15'];

  // Wielkości wykreślane w Module 02 (jeden select). Pole:
  //   field 'intensity' → GJ/dzielnik (powierzchnia dla CO, woda dla CWU)
  //   field 'gj'        → samo zużycie GJ
  //   field 'qty'       → zużycie wody [m³] (tylko CWU)
  //   field 'cost'      → koszt [zł] = GJ × cena ciepła
  //   field 'price'     → cena ciepła [zł/GJ] — globalna z P.prices, niezależna od budynku
  //   field 'temp'      → temperatura zewn. [°C] — globalna z P.temps; może być ≤ 0; prognoza „ogona"
  //                       tylko przy metodzie CO 'hdd' (paź–kwi z odwrócenia HDD, maj–wrz puste)
  P.M02_METRICS = [
    { id: 'co_int',    medium: 'CO',  field: 'intensity', label: 'CO — wskaźnik',  unit: 'GJ/m²' },
    { id: 'co_gj',     medium: 'CO',  field: 'gj',        label: 'CO — zużycie',   unit: 'GJ'    },
    { id: 'co_cost',   medium: 'CO',  field: 'cost',      label: 'CO — koszt',     unit: 'zł'    },
    { id: 'cwu_int',   medium: 'CWU', field: 'intensity', label: 'CWU — wskaźnik', unit: 'GJ/m³' },
    { id: 'cwu_gj',    medium: 'CWU', field: 'gj',        label: 'CWU — zużycie',  unit: 'GJ'    },
    { id: 'cwu_water', medium: 'CWU', field: 'qty',       label: 'CWU — woda',     unit: 'm³'    },
    { id: 'cwu_cost',  medium: 'CWU', field: 'cost',      label: 'CWU — koszt',    unit: 'zł'    },
    { id: 'price',     medium: 'CO',  field: 'price',     label: 'Cena ciepła',    unit: 'zł/GJ' },
    { id: 'temp',      medium: 'CO',  field: 'temp',      label: 'Temperatura zewn.', unit: '°C' }
  ];
  P.m02Metric = id => P.M02_METRICS.find(m => m.id === id) || P.M02_METRICS[0];

  // ===== STAN APLIKACJI =====
  // Tylko ustawienia UI. Dane (rekordy, ceny, zaliczki) trzymane są
  // w osobnych magazynach w data.js, żeby łatwo je serializować.
  const now = new Date();
  P.state = {
    medium:    'CO',                 // 'CO' | 'CWU'
    building:  null,                 // wybrany budynek (nazwa)
    asOfYear:  now.getFullYear(),    // "teraz" — kursor dzielący przeszłość (fakt) od przyszłości (plan)
    asOfMonth: now.getMonth() + 1,   // 1..12
    horizon:   'current',            // 'current' | 'next' — bieżący okres albo następny pełny okres
    periodStartCO:  1,               // miesiąc startu okresu rocznego CO (1..12)
    periodStartCWU: 1,               // miesiąc startu pierwszego półrocza CWU (1 → I–VI / VII–XII)

    // --- Moduł 01 (macierz): jawny układ kolumn (budynki) i wierszy (miesiące) ---
    // null = zostanie zainicjalizowane z danych przy pierwszym renderze (data.js → m01EnsureLayout)
    m01Cols: null,                   // uporządkowana lista budynków = kolumny
    m01From: null,                   // pierwszy widoczny miesiąc (góra) { year, month }
    m01To:   null,                   // ostatni widoczny miesiąc (dół)   { year, month }

    // --- Moduł 02 (symulacja zużycia) ---
    m02Metric:   'co_int',           // wybrana wielkość z P.M02_METRICS (GJ/m², GJ, woda…)
    m02Building: null,               // budynek pokazywany na wykresie (własny wybór M02)
    m02Method:   'trend',            // sposób prognozy CO (select #kz-m02-method-co): 'trend' = analogiczne miesiące | 'hdd' = sygnatura energetyczna (E = a + b·HDD + c·t)
    cwuBasis:    'intensity',        // sposób prognozy CWU (select #kz-m02-method-cwu): 'intensity' = trend(GJ/m³) × trend(m³) (domyślnie) | 'gj' = trend GJ wprost
    hddCity:     'opole',            // miasto klimatologii HDD (klucz w P.CLIMATE; select #kz-m02-city; używane tylko przy m02Method 'hdd')
    m02HddP:     80,                 // percentyl surowości zimy dla prognozy HDD (select #kz-m02-hdd-p: 50|70|80|90; na sumach sezonowych)

    // --- Moduł 04 (dobór zaliczek) ---
    m04Building: null,               // budynek pokazywany na wykresie (własny wybór M04; P.MERGED = wszystkie budynki łącznie)
    m04View:     'co'                // widok wykresu (jednomedialny): adv_co|adv_cwu (zebrane zaliczki) | rate_co|rate_cwu (stawki) | co|cwu (koszt vs zaliczki)
  };

})(window.KZ);
