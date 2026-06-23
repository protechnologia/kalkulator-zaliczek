'use strict';
/*
 * Config importu — SM Opole, węzeł EA3/N04 (grupa „ZP").
 * Ulice: Zawiszaków, Bat. Parasol.  Budynków: 9.
 * Uruchom:  node import/build-import.js config-ea3-n04-zp.js              (build + walidacja)
 *           node import/build-import.js config-ea3-n04-zp.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea3-n04-zp.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01',
  to:   '2026-05',
  validateAgainst: 'import-ea3-n04-zp.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA3/N04',
      buildings: [
        { name: 'ZA-1',  id: '1'     }, // Zawiszaków 1
        { name: 'ZA-2',  id: '2'     }, // Zawiszaków 2
        { name: 'ZA-3',  id: '3'     }, // Zawiszaków 3
        { name: 'ZA-4',  id: '4'     }, // Zawiszaków 4
        { name: 'ZA-10', id: '10'    }, // Zawiszaków 10
        { name: 'ZA-14', id: '14'    }, // Zawiszaków 14
        { name: 'BP-7',  id: '7'     }, // Bat. Parasol 7
        { name: 'BP-11', id: '11'    }, // Bat. Parasol 11
        { name: 'BP-19', id: '19'    }, // Bat. Parasol 19
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
