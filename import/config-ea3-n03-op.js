'use strict';
/*
 * Config importu — SM Opole, węzeł EA3/N03 (grupa „OP").
 * Ulice: Skautów Opolskich, Szarych Szeregów.  Budynków: 11.
 * Uruchom:  node import/build-import.js config-ea3-n03-op.js              (build + walidacja)
 *           node import/build-import.js config-ea3-n03-op.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea3-n03-op.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01',
  to:   '2026-05',
  validateAgainst: 'import-ea3-n03-op.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA3/N03',
      buildings: [
        { name: 'SK-1',  id: '1'     }, // Skautów Opolskich 1
        { name: 'SK-2',  id: '2'     }, // Skautów Opolskich 2
        { name: 'SK-3',  id: '3'     }, // Skautów Opolskich 3
        { name: 'SK-4',  id: '4'     }, // Skautów Opolskich 4
        { name: 'SK-5',  id: '5'     }, // Skautów Opolskich 5
        { name: 'SK-7',  id: '7'     }, // Skautów Opolskich 7
        { name: 'SK-9',  id: '9'     }, // Skautów Opolskich 9
        { name: 'SK-11', id: '11'    }, // Skautów Opolskich 11
        { name: 'SK-13', id: '13'    }, // Skautów Opolskich 13
        { name: 'SK-17', id: '17'    }, // Skautów Opolskich 17
        { name: 'SS-25', id: '25'    }, // Szarych Szeregów 25
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
