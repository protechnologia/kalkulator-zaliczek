'use strict';
/*
 * Config importu — SM Opole, węzeł EA2/N02 (grupa „FH").
 * Ulice: Fieldorfa, Hubala.  Budynków: 8.
 * Uruchom:  node import/build-import.js config-ea2-n02-fh.js              (build + walidacja)
 *           node import/build-import.js config-ea2-n02-fh.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea2-n02-fh.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01',
  to:   '2026-05',
  carryAdvanceTo: '2026-06', // powiel ostatnią stawkę na trwający miesiąc bez raportu (odtwarzalność)
  validateAgainst: 'import-ea2-n02-fh.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA2/N02',
      buildings: [
        { name: 'FI-4a', id: '4a'    }, // Fieldorfa 4a
        { name: 'FI-4b', id: '4b'    }, // Fieldorfa 4b
        { name: 'FI-6',  id: '6'     }, // Fieldorfa 6
        { name: 'FI-8',  id: '8'     }, // Fieldorfa 8
        { name: 'FI-10', id: '10'    }, // Fieldorfa 10
        { name: 'FI-14', id: '14'    }, // Fieldorfa 14
        { name: 'HU-25', id: '25'    }, // Hubala 25
        { name: 'HU-27', id: '27'    }, // Hubala 27
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
