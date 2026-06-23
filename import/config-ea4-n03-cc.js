'use strict';
/*
 * Config importu — SM Opole, węzeł EA4/N03 (grupa „CC").
 * Ulice: Chełmska, Cieszyńska.  Budynków: 4.
 * Uruchom:  node import/build-import.js config-ea4-n03-cc.js              (build + walidacja)
 *           node import/build-import.js config-ea4-n03-cc.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea4-n03-cc.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2021-12', // EA4 — raporty dopiero od 2021.12 (krótsza historia)
  to:   '2026-05',
  validateAgainst: 'import-ea4-n03-cc.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA4/N03',
      buildings: [
        { name: 'CH-11', id: '11'    }, // Chełmska 11
        { name: 'CI-10', id: '10'    }, // Cieszyńska 10
        { name: 'CI-20', id: '20'    }, // Cieszyńska 20
        { name: 'CI-24', id: '24'    }, // Cieszyńska 24
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
