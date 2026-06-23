'use strict';
/*
 * Config importu — SM Opole, węzeł EA4/N06 (grupa „B5").
 * Ulice: Bielska.  Budynków: 1.
 * Uruchom:  node import/build-import.js config-ea4-n06-b5.js              (build + walidacja)
 *           node import/build-import.js config-ea4-n06-b5.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea4-n06-b5.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2021-12', // EA4 — raporty dopiero od 2021.12 (krótsza historia)
  to:   '2026-05',
  carryAdvanceTo: '2026-06', // powiel ostatnią stawkę na trwający miesiąc bez raportu (odtwarzalność)
  validateAgainst: 'import-ea4-n06-b5.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA4/N06',
      buildings: [
        { name: 'BI-05', id: '05'    }, // Bielska 05
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
