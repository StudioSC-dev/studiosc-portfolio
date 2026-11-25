/**
 * Which captures a board needs (for regen), and which reference a site
 * check reads (for the fidelity spec). Both sides use the same plan, so a
 * reference always exists for what the check asks for.
 */
import {
  THEMES,
  activeDeviations,
  stateName,
  type BoardsDir,
  type Deviation,
  type Later,
  type Row,
  type Sections,
  type Theme,
  type Width,
} from "./model";

export interface BoardTheme {
  width: Width;
  theme: Theme;
  toggle: boolean;
  rows: Row[];
}

/** The rows a board is the source of, per theme. */
export function boardThemes(
  sections: Sections,
  board: string,
  width: Width
): BoardTheme[] {
  const out: BoardTheme[] = [];
  for (const theme of THEMES) {
    const rows = sections.rows.filter(
      (r) => r.sources[width]?.[theme].board === board
    );
    if (!rows.length) continue;
    const toggles = new Set(
      rows.map((r) => r.sources[width]![theme].theme === "toggle")
    );
    if (toggles.size > 1)
      throw new Error(`${board} ${theme}: rows disagree on drawn or toggled`);
    out.push({ width, theme, toggle: [...toggles][0], rows });
  }
  return out;
}

export interface Hide {
  selector: string;
  mode: "hide" | "remove";
}

export interface PlannedCapture {
  state: string;
  rm: boolean;
  /** The later deviations whose elements are hidden (their ids). */
  pending: string[];
  key: string;
  /** The board elements hidden for them, each scoped to its row. */
  hide: Hide[];
}

/** The states of a row that its board draws at a width. */
export const rowStates = (sections: Sections, row: Row, width: Width) =>
  row.states.filter((s) => {
    const w = sections.states[s]?.widths;
    return !w || w.includes(width);
  });

/** The deviation that stands for a later entry: property `later`, built `absent`. */
export const laterSelector = (hide: { selector: string }[]) =>
  hide.map((h) => h.selector).join(", ");

export interface Where {
  state: string;
  width: string;
  theme: string;
}

/** A later deviation that names exactly this row's later entry, here. */
const standsFor = (d: Deviation, row: Row, l: Later, where: Where) =>
  d.property === "later" &&
  d.section.includes(row.id) &&
  d.state.includes(where.state) &&
  d.width.includes(where.width) &&
  d.theme.includes(where.theme) &&
  d.board === laterSelector(l.hide) &&
  d.built === "absent" &&
  d.expires === l.ticket;

/**
 * The later deviations that apply to these rows here: each names one row's
 * later entry exactly, and its ticket is not merged. Their ids, sorted.
 */
export function laterFor(
  deviations: Deviation[],
  merged: string[],
  rows: Row[],
  where: Where
): string[] {
  const out = new Set<string>();
  for (const row of rows)
    for (const l of row.later ?? []) {
      if (merged.includes(l.ticket)) continue;
      for (const d of deviations)
        if (standsFor(d, row, l, where)) out.add(d.id);
    }
  return [...out].sort();
}

/**
 * The board elements hidden for a set of later deviations: only the entries
 * those deviations name, each scoped to its own row, so accepting one row's
 * entry never hides another row's.
 */
export function hiddenFor(
  deviations: Deviation[],
  merged: string[],
  rows: Row[],
  where: Where,
  ids: string[]
): Hide[] {
  const named = deviations.filter((d) => ids.includes(d.id));
  return rows.flatMap((row) =>
    (row.later ?? [])
      .filter(
        (l) =>
          !merged.includes(l.ticket) &&
          named.some((d) => standsFor(d, row, l, where))
      )
      .flatMap((l) =>
        l.hide.map((h) => ({
          selector: `:is(${row.board}) :is(${h.selector})`,
          mode: h.mode ?? "remove",
        }))
      )
  );
}

export interface Register {
  deviations: Deviation[];
  merged: string[];
}

/**
 * Every capture regen makes for one board in one theme: each state with
 * motion on and reduced, and for each, the partial-build variants the
 * register calls for: one hiding every later entry the register lists, and
 * one hiding only the accepted ones (when they differ).
 */
export function plannedCaptures(
  sections: Sections,
  bt: BoardTheme,
  register: Register
): PlannedCapture[] {
  const states = [
    ...new Set(bt.rows.flatMap((r) => rowStates(sections, r, bt.width))),
  ].sort();
  const active = activeDeviations(register.deviations, register.merged);
  const out: PlannedCapture[] = [];
  for (const state of states)
    for (const rm of [false, true]) {
      const where = {
        state: stateName(state, { rm }),
        width: bt.width,
        theme: bt.theme,
      };
      const sets = [
        [],
        laterFor(register.deviations, register.merged, bt.rows, where),
        laterFor(active, register.merged, bt.rows, where),
      ];
      const seen = new Set<string>();
      for (const pending of sets) {
        const key = `${bt.theme}/${stateName(state, { rm, pending })}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          state,
          rm,
          pending,
          key,
          hide: hiddenFor(
            register.deviations,
            register.merged,
            bt.rows,
            where,
            pending
          ),
        });
      }
    }
  return out;
}

/**
 * The later deviations in effect for a check: those an accepted, unexpired
 * deviation names exactly, over every row the board draws here.
 */
export function pendingFor(
  boards: BoardsDir,
  rows: Row[],
  where: Where
): string[] {
  return laterFor(
    activeDeviations(boards.deviations, boards.merged),
    boards.merged,
    rows,
    where
  );
}
