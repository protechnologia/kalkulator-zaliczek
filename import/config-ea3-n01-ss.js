'use strict';
/*
 * Config importu — SM Opole, węzeł EA3/N01 (grupa „SS").
 * Ulice: Szarych Szeregów.  Budynków: 14.
 * Uruchom:  node import/build-import.js config-ea3-n01-ss.js              (build + walidacja)
 *           node import/build-import.js config-ea3-n01-ss.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea3-n01-ss.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01',
  to:   '2026-05',
  validateAgainst: 'import-ea3-n01-ss.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA3/N01',
      buildings: [
        { name: 'SS-10', id: '10'    }, // Szarych Szeregów 10
        { name: 'SS-16', id: '16'    }, // Szarych Szeregów 16
        { name: 'SS-20', id: '20'    }, // Szarych Szeregów 20
        { name: 'SS-24', id: '24'    }, // Szarych Szeregów 24
        { name: 'SS-28', id: '28'    }, // Szarych Szeregów 28
        { name: 'SS-38', id: '38'    }, // Szarych Szeregów 38
        { name: 'SS-40', id: '40'    }, // Szarych Szeregów 40
        { name: 'SS-42', id: '42'    }, // Szarych Szeregów 42
        { name: 'SS-50', id: '50'    }, // Szarych Szeregów 50
        { name: 'SS-54', id: '54'    }, // Szarych Szeregów 54
        { name: 'SS-56', id: '56'    }, // Szarych Szeregów 56
        { name: 'SS-64', id: '64'    }, // Szarych Szeregów 64
        { name: 'SS-68', id: '68'    }, // Szarych Szeregów 68
        { name: 'SS-70', id: '70'    }, // Szarych Szeregów 70
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
