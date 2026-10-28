# Credits

Licence texts are in `licenses/` and `fonts/`.

- **Flags:** [svg-country-flags](https://github.com/hjnilsson/country-flags) (Wikipedia's flag SVGs, public domain), in their real proportions. Kyrgyzstan and Syria, which changed flags after that set was made, come from [flag-icons](https://github.com/lipis/flag-icons) (MIT). Afghanistan's white Shahada flag is Wikipedia's File:Flag of the Taliban.svg (public domain), traced to vector shapes by `tools/afghan-flag.mjs` (potrace, GPL-2.0, build tool only — not shipped). File names in `flags/` are content hashes so they don't give the answer away.
- **Maps and country outlines:** [Natural Earth](https://www.naturalearthdata.com/) data (public domain) via [world-atlas](https://github.com/topojson/world-atlas) (ISC licence), projected and simplified by `tools/data.js`. Some countries are cropped to their main territory so the outline stays readable (for example the contiguous United States, mainland France, Spain, Portugal, Norway, Chile, Ecuador, Australia, New Zealand, Fiji).
- **Country names, other spellings, capitals and regions:** [world-countries](https://github.com/mledoze/countries) by Mohammed Le Doze, Open Database License (ODbL 1.0). Extra accepted spellings and capitals were added in `tools/data.js`.
- **Fonts:** Anton, Barlow and Barlow Semi Condensed, SIL Open Font License. Noto Sans Thaana, Tifinagh, Ethiopic, Myanmar, Khmer, Lao, Sinhala, Armenian, Georgian and Noto Serif Tibetan (via Fontsource), SIL Open Font License, so Guess the language shows those scripts on every device.
- **Guess the language:** every sentence is a real official translation of the [Universal Declaration of Human Rights](https://www.ohchr.org/en/human-rights/universal-declaration/translations) (Articles 1, 3–6), from Unicode's UDHR in Unicode project via the [udhr](https://github.com/wooorm/udhr) package (MIT). Which languages are official where: world-countries (above). Built by `tools/langs.mjs`.

The country list is the UN member states except Israel (left out by the owner), the two UN observer states (Vatican City, Palestine), Kosovo and Taiwan: 196 in total.
Where a country has more than one capital or a separate seat of government (e.g. Bolivia, South Africa, Netherlands, Sri Lanka, Malaysia, Benin, Ivory Coast, Tanzania, Eswatini, Palestine), each of them is accepted.

- **Online race:** Firebase JavaScript SDK (Google), Apache License 2.0, self-hosted in `vendor/firebase/` (see `NOTICE.txt`).
- **QR codes:** qrcode-generator by Kazuhiko Arase (MIT) and jsQR by Cosmo Wolfe (Apache 2.0), self-hosted in `vendor/qr/`.
