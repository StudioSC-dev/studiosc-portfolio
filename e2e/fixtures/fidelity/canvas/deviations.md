# Fixture deviations

The fidelity harness writes its own registers; the committed fixture accepts nothing. It lists the two
later entries (PRV-19's CV links, in the header and in the footer), so `boards:regen` renders the reference
with both hidden.

| id | section | state | width | theme | property | board | built | from | accepted | expires |
|---|---|---|---|---|---|---|---|---|---|---|
| L1 | fx/header | default, default-rm, theme-reveal, theme-reveal-rm | 1440, 390 | light, dark | `later` | `a[href^="/cv/"]` | `absent` | fixture |  | PRV-19 |
| L2 | fx/footer | default, default-rm | 1440 | light, dark | `later` | `a[href^="/cv/"]` | `absent` | fixture |  | PRV-19 |
