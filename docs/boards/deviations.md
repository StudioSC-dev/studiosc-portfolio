# Board deviations

Each row is one accepted difference between a board and the built site, bound to a section, state, width,
theme, property, the board's value and the expected built value. The fidelity check (`e2e/fidelity.spec.ts`)
reads this table. Only a row whose `accepted` cell names the owner and a date suppresses a mismatch, and only
when every field matches exactly. A row whose `expires` ticket is listed in `merged.json` stops suppressing:
the board's value, within the usual tolerance, is then required.

- `copy` rows replace the board text with the built text (an empty built value removes it) before the copy is
  compared.
- `later` rows hide a later ticket's elements (the board value is their selector) on the board until that
  ticket merges.
- Any other property suppresses the failure that names exactly that property, board value and built value.

PRV-22 seeds the rows below. None is accepted: the owner signs each one, with the date, before it applies.

| id | section | state | width | theme | property | board | built | from | accepted | expires |
|---|---|---|---|---|---|---|---|---|---|---|
| D1 | home/plate-3d | tab-3d, tab-3d-rm | 1440, 390 | light, dark | `copy` | `Drawn here as a CSS cube that turns. The real demo would be a small three.js scene you can turn and light. Pause stops it.` | `Pause the cube to hold its position, then play to resume the turn.` | the turntable caption: the one intended exception to "the board wins" (PRV-7 scope, Q17) |  | - |
| D2 | home/plate-mobile, home/plate-ai, home/plate-3d, seth/photos, christine/photos | tab-mobile, tab-mobile-rm, tab-ai, tab-ai-rm, tab-3d, tab-3d-rm, default, default-rm, gallery-2, gallery-2-rm, gallery-3, gallery-3-rm, gallery-4, gallery-4-rm, gallery-prev, gallery-prev-rm | 1440, 390 | light, dark | `copy` | `[PLACEHOLDER]` | `` | markers never ship (PRV epic, Copy) |  | - |
| D3 | home/work, work/list | default, default-rm, filter-live, filter-live-rm, filter-qa, filter-qa-rm, filter-dev, filter-dev-rm | 1440, 390 | light, dark | `copy` | `Sample` | `` | markers never ship (PRV epic, Copy) |  | - |
| D4 | home/plate-dashboards, home/plate-testing | default, default-rm, tab-testing, tab-testing-rm, plate-prev, plate-prev-rm | 1440, 390 | light, dark | `copy` | `Illustrative wording` | `` | markers never ship (PRV epic, Copy) |  | - |
| D5 | home/people, about/people, seth/title, christine/title | default, default-rm, theme-reveal, theme-reveal-rm | 1440, 390 | light, dark | `later` | `a[href^="/cv/"]` | `absent` | the CV links are hidden until PRV-19 builds the CV pages |  | PRV-19 |
| D6 | home/plate-dashboards | default, default-rm | 1440, 390 | light, dark | `copy` | `Checked by Christine. The day feed stays in time order, and each entry keeps its source's colour.` | `` | Christine lines ship only when sourced (PRV epic, Christine lines) |  | - |
| D7 | home/plate-finance | tab-finance, tab-finance-rm, plate-next, plate-next-rm | 1440, 390 | light, dark | `copy` | `Checked by Christine. Amounts keep one right edge on desktop and phone.` | `` | Christine lines ship only when sourced (PRV epic, Christine lines) |  | - |
| D8 | home/plate-testing | tab-testing, tab-testing-rm, plate-prev, plate-prev-rm | 1440, 390 | light, dark | `copy` | `Checked by Christine. Every route renders without a console error at both widths it is tested at.` | `` | Christine lines ship only when sourced (PRV epic, Christine lines) |  | - |
