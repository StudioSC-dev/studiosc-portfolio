# Board deviations

Each row is one accepted difference between a board and the built site, bound to a section, state, width,
theme, property, the board's value and the expected built value. The fidelity check (`e2e/fidelity.spec.ts`)
reads this table. Only a row whose `accepted` cell reads exactly `owner, YYYY-MM-DD` suppresses a mismatch,
and only when every field matches exactly. A row whose `expires` ticket is listed in `merged.json` stops suppressing:
the board's value, within the usual tolerance, is then required.

- `copy` rows replace the board text with the built text (an empty built value removes it) before the copy is
  compared.
- `later` rows hide a later ticket's elements (the board value is their selector) on the board until that
  ticket merges. Each hides only the entries of the sections it names, for the states, widths and themes it
  names; `boards:regen` renders the reference for the rows listed here and for the accepted ones.
- Any other property suppresses the failure that names exactly that property, board value and built value.

PRV-22 seeds the rows below. None is accepted: the owner signs each one, with the date, before it applies.

| id | section | state | width | theme | property | board | built | from | accepted | expires |
|---|---|---|---|---|---|---|---|---|---|---|
| D1 | home/plate-3d-interior | tab-3d, tab-3d-rm | 1440, 390 | light, dark | `copy` | `Drawn here as a CSS cube that turns. The real demo would be a small three.js scene you can turn and light. Pause stops it.` | `Pause the cube to hold its position, then play to resume the turn.` | the turntable caption: the one intended exception to "the board wins" (PRV-7 scope, Q17) |  | - |
| D2 | home/plate-mobile-interior, home/plate-ai-interior, home/plate-3d-interior, seth/photos, christine/photos | tab-mobile, tab-mobile-rm, tab-ai, tab-ai-rm, tab-3d, tab-3d-rm, default, default-rm, gallery-2, gallery-2-rm, gallery-3, gallery-3-rm, gallery-4, gallery-4-rm, gallery-prev, gallery-prev-rm, photo-2-of-4, photo-2-of-4-rm, photo-3-of-4, photo-3-of-4-rm, photo-4-of-4, photo-4-of-4-rm | 1440, 390 | light, dark | `copy` | `[PLACEHOLDER]` | `` | markers never ship (PRV epic, Copy) |  | - |
| D3 | home/work, work/list | default, default-rm, filter-live, filter-live-rm, filter-qa, filter-qa-rm, filter-dev, filter-dev-rm | 1440, 390 | light, dark | `copy` | `Sample` | `` | markers never ship (PRV epic, Copy) |  | - |
| D4 | home/plate-dashboards, home/plate-testing-interior | default, default-rm, tab-testing, tab-testing-rm, plate-prev, plate-prev-rm | 1440, 390 | light, dark | `copy` | `Illustrative wording` | `` | markers never ship (PRV epic, Copy) |  | - |
| D5 | home/people, about/people, seth/title, christine/title | default, default-rm, theme-reveal, theme-reveal-rm | 1440, 390 | light, dark | `later` | `a[href^="/cv/"]` | `absent` | the CV links are hidden until PRV-19 builds the CV pages |  | PRV-19 |
| D6 | home/plate-dashboards | default, default-rm | 1440, 390 | light, dark | `copy` | `Checked by Christine. The day feed stays in time order, and each entry keeps its source's colour.` | `` | Christine lines ship only when sourced (PRV epic, Christine lines) |  | - |
| D7 | home/plate-finance-interior | tab-finance, tab-finance-rm, plate-next, plate-next-rm | 1440, 390 | light, dark | `copy` | `Checked by Christine. Amounts keep one right edge on desktop and phone.` | `` | Christine lines ship only when sourced (PRV epic, Christine lines) |  | - |
| D8 | home/plate-testing-interior | tab-testing, tab-testing-rm, plate-prev, plate-prev-rm | 1440, 390 | light, dark | `copy` | `Checked by Christine. Every route renders without a console error at both widths it is tested at.` | `` | Christine lines ship only when sourced (PRV epic, Christine lines) |  | - |
| D9 | chrome/header | default, default-rm, theme-reveal, theme-reveal-rm | 1440, 390 | light, dark | `later` | `li:has(> a[href="/seth"]), li:has(> a[href="/christine"])` | `absent` | the Seth and Christine header links are hidden until PRV-10 builds their pages (PRV-4 brief) |  | PRV-10 |
| D10 | 404/main | default, default-rm | 1440, 390 | light, dark | `drawn` | `visible` | `missing` | PRV-4's interim themed 404 stands in for the board's 404 until PRV-9 builds it |  | PRV-9 |
| D11 | home/plate-finance, home/plate-sites, home/plate-testing | tab-finance, tab-finance-rm, tab-sites, tab-sites-rm, tab-testing, tab-testing-rm, plate-next, plate-next-rm, plate-prev, plate-prev-rm | 1440, 390 | light, dark | `later` | `[aria-roledescription="slide"] > :not(h2):not(:has(h2)), [aria-roledescription="slide"] > div:has(> h2) > :not(h2)` | `absent` | PRV-5 draws each plate's frame and title; PRV-6 fills the Finance, Sites and Testing interiors |  | PRV-6 |
| D12 | home/plate-mobile, home/plate-ai, home/plate-3d | tab-mobile, tab-mobile-rm, tab-ai, tab-ai-rm, tab-3d, tab-3d-rm | 1440, 390 | light, dark | `later` | `[aria-roledescription="slide"] > :not(h2):not(:has(h2)), [aria-roledescription="slide"] > div:has(> h2) > :not(h2)` | `absent` | PRV-5 draws each plate's frame and title; PRV-7 fills the lab plates' interiors |  | PRV-7 |
| D13 | home/range | default, default-rm, tab-finance, tab-finance-rm, tab-mobile, tab-mobile-rm, tab-ai, tab-ai-rm, tab-3d, tab-3d-rm, tab-sites, tab-sites-rm, tab-testing, tab-testing-rm, plate-next, plate-next-rm, plate-prev, plate-prev-rm | 1440 | light, dark | `later` | `div[aria-hidden] div:has(> svg > rect[stroke="#DCE3DE"]), div[aria-hidden] p:has(+ div > svg > rect[stroke="#DCE3DE"]), div[aria-hidden] div:has(> svg > rect[stroke="#D0D3D8"]), div[aria-hidden] p:has(+ div > svg > rect[stroke="#D0D3D8"])` | `absent` | the Finance, Sites and Testing peek drawings and the status lines above them are plate interiors PRV-6 draws; PRV-5 keeps each peek's frame and title |  | PRV-6 |
| D14 | home/range | default, default-rm, tab-finance, tab-finance-rm, tab-mobile, tab-mobile-rm, tab-ai, tab-ai-rm, tab-3d, tab-3d-rm, tab-sites, tab-sites-rm, tab-testing, tab-testing-rm, plate-next, plate-next-rm, plate-prev, plate-prev-rm | 1440 | light, dark | `later` | `div[aria-hidden] div:has(> svg > rect[stroke="#D5E2DD"]), div[aria-hidden] div:has(> svg > rect[stroke="#E2DFD8"]), div[aria-hidden] div:has(> svg > rect[fill="#0F1113"])` | `absent` | the lab plates' peek drawings are plate interiors PRV-7 draws (the lab peeks have no status line); PRV-5 keeps each peek's frame and title |  | PRV-7 |
