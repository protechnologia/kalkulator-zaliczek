'use strict';
/*
 * Config importu — SM Opole, węzeł EA2/N01 (grupa „BR" = Bytnara Rudego + Hubala).
 * Budynki: B. Rudego 14a…21b (8 szt.) + Hubala 17a, 17b (2 szt.) = 10.
 * Uruchom:  node import/build-import.js config-ea2-n01-br.js              (build + walidacja)
 *           node import/build-import.js config-ea2-n01-br.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lok. uż. „Br15c" (kol. R) celowo pominięty — nie jest budynkiem mieszkalnym.
 */
module.exports = {
  outFile: 'import-ea2-n01-br.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01', // raporty BR od 2020.01 (2018.01 to inny format „Okresowy raport" z innymi id — niekompatybilny)
  to:   '2026-05',
  carryAdvanceTo: '2026-06', // powiel ostatnią stawkę na trwający miesiąc bez raportu (odtwarzalność)
  validateAgainst: 'import-ea2-n01-br.json', // regresja: nowy build vs wersja na dysku (budynki wspólne)
  sources: [
    {
      node: 'EA2/N01',
      buildings: [
        { name: 'BR-14a', id: '14a' }, // B. Rudego 14a
        { name: 'BR-15c', id: '15c' }, // B. Rudego 15c
        { name: 'BR-16d', id: '16d' }, // B. Rudego 16d
        { name: 'BR-17',  id: '17'  }, // B. Rudego 17
        { name: 'BR-18b', id: '18b' }, // B. Rudego 18b
        { name: 'BR-19a', id: '19a' }, // B. Rudego 19a
        { name: 'BR-20b', id: '20b' }, // B. Rudego 20b
        { name: 'BR-21b', id: '21b' }, // B. Rudego 21b
        { name: 'HU-17a', id: '17a' }, // Hubala 17a
        { name: 'HU-17b', id: '17b' }, // Hubala 17b
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
