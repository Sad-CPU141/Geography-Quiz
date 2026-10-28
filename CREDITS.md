# Credits

Licence texts are in `licenses/` and `fonts/`.

- **Flags:** [svg-country-flags](https://github.com/hjnilsson/country-flags) (Wikipedia's flag SVGs, public domain), in their real proportions. Kyrgyzstan and Syria, which changed flags after that set was made, come from [flag-icons](https://github.com/lipis/flag-icons) (MIT). File names in `flags/` are content hashes so they don't give the answer away.
- **Maps and country outlines:** [Natural Earth](https://www.naturalearthdata.com/) data (public domain) via [world-atlas](https://github.com/topojson/world-atlas) (ISC licence), projected and simplified by `tools/data.js`. Some countries are cropped to their main territory so the outline stays readable (for example the contiguous United States, mainland France, Spain, Portugal, Norway, Chile, Ecuador, Australia, New Zealand, Fiji).
- **Country names, other spellings, capitals and regions:** [world-countries](https://github.com/mledoze/countries) by Mohammed Le Doze, Open Database License (ODbL 1.0). Extra accepted spellings and capitals were added in `tools/data.js`.
- **Fonts:** Anton, Barlow and Barlow Semi Condensed, SIL Open Font License.

The country list is the UN member states except Israel (left out by the owner), the two UN observer states (Vatican City, Palestine), Kosovo and Taiwan: 196 in total.
Where a country has more than one capital or a separate seat of government (e.g. Bolivia, South Africa, Netherlands, Sri Lanka, Malaysia, Benin, Ivory Coast, Tanzania, Eswatini, Palestine), each of them is accepted.

- **Online race:** Firebase JavaScript SDK (Google), Apache License 2.0, self-hosted in `vendor/firebase/` (see `NOTICE.txt`).
- **QR codes:** qrcode-generator by Kazuhiko Arase (MIT) and jsQR by Cosmo Wolfe (Apache 2.0), self-hosted in `vendor/qr/`.
