'use strict';
/*
 * Config importu — SM Opole, węzeł EA2/N04 (grupa „H04").
 * Ulice: Hubala.  Budynków: 1.
 * Uruchom:  node import/build-import.js config-ea2-n04-h04.js              (build + walidacja)
 *           node import/build-import.js config-ea2-n04-h04.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea2-n04-h04.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01',
  to:   '2026-05',
  carryAdvanceTo: '2026-06', // powiel ostatnią stawkę na trwający miesiąc bez raportu (odtwarzalność)
  validateAgainst: 'import-ea2-n04-h04.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA2/N04',
      buildings: [
        { name: 'HU-04', id: '04'    }, // Hubala 04
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
