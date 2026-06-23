'use strict';
/*
 * Config importu — SM Opole, węzeł EA2/N03 (grupa „HP").
 * Ulice: Hubala, Pużaka.  Budynków: 17.
 * Uruchom:  node import/build-import.js config-ea2-n03-hp.js              (build + walidacja)
 *           node import/build-import.js config-ea2-n03-hp.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea2-n03-hp.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01',
  to:   '2026-05',
  validateAgainst: 'import-ea2-n03-hp.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA2/N03',
      buildings: [
        { name: 'HU-01',  id: '01'    }, // Hubala 01
        { name: 'HU-03b', id: '03b'   }, // Hubala 03b
        { name: 'HU-05b', id: '05b'   }, // Hubala 05b
        { name: 'HU-05f', id: '05f'   }, // Hubala 05f
        { name: 'HU-12d', id: '12d'   }, // Hubala 12d
        { name: 'HU-13c', id: '13c'   }, // Hubala 13c
        { name: 'HU-14c', id: '14c'   }, // Hubala 14c
        { name: 'HU-16d', id: '16d'   }, // Hubala 16d
        { name: 'HU-18a', id: '18a'   }, // Hubala 18a
        { name: 'HU-20b', id: '20b'   }, // Hubala 20b
        { name: 'PU-24a', id: '24a'   }, // Pużaka 24a
        { name: 'PU-26c', id: '26c'   }, // Pużaka 26c
        { name: 'PU-32d', id: '32d'   }, // Pużaka 32d
        { name: 'PU-38a', id: '38a'   }, // Pużaka 38a
        { name: 'PU-40d', id: '40d'   }, // Pużaka 40d
        { name: 'PU-42a', id: '42a'   }, // Pużaka 42a
        { name: 'PU-46a', id: '46a'   }, // Pużaka 46a
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
