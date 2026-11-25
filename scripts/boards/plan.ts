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

const subsets = <T>(items: T[]): T[][] =>
  items
    .reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]])
    .slice(1);

export const laterTickets = (rows: Row[]) =>
  [
    ...new Set(rows.flatMap((r) => (r.later ?? []).map((l) => l.ticket))),
  ].sort();

export interface PlannedCapture {
  state: string;
  rm: boolean;
  pending: string[];
  key: string;
}

/** The states of a row that its board draws at a width. */
export const rowStates = (sections: Sections, row: Row, width: Width) =>
  row.states.filter((s) => {
    const w = sections.states[s]?.widths;
    return !w || w.includes(width);
  });

/** Every capture regen makes for one board in one theme. */
export function plannedCaptures(
  sections: Sections,
  bt: BoardTheme
): PlannedCapture[] {
  const states = [
    ...new Set(bt.rows.flatMap((r) => rowStates(sections, r, bt.width))),
  ].sort();
  const out: PlannedCapture[] = [];
  const add = (state: string, rm: boolean, pending: string[]) =>
    out.push({
      state,
      rm,
      pending,
      key: `${bt.theme}/${stateName(state, { rm, pending })}`,
    });
  for (const state of states)
    for (const rm of [false, true]) add(state, rm, []);
  const tickets = laterTickets(bt.rows);
  if (tickets.length > 4)
    throw new Error("more than four later tickets on one board");
  const laterStates = [
    ...new Set(
      bt.rows
        .filter((r) => r.later?.length)
        .flatMap((r) => rowStates(sections, r, bt.width))
    ),
  ].sort();
  for (const set of subsets(tickets))
    for (const state of laterStates)
      for (const rm of [false, true]) add(state, rm, set);
  return out;
}

/** The board elements hidden for a set of pending tickets, scoped to their rows. */
export function hiddenFor(rows: Row[], pending: string[]) {
  return rows.flatMap((row) =>
    (row.later ?? [])
      .filter((l) => pending.includes(l.ticket))
      .flatMap((l) =>
        l.hide.map((h) => ({
          selector: `:is(${row.board}) :is(${h.selector})`,
          mode: h.mode ?? "remove",
        }))
      )
  );
}

/** The deviation that stands for a later entry: property `later`, built `absent`. */
export const laterSelector = (hide: { selector: string }[]) =>
  hide.map((h) => h.selector).join(", ");

/**
 * The tickets whose elements are still hidden for this state: a later entry
 * on a built row, its ticket not merged, and an accepted, unexpired
 * deviation that names it exactly.
 */
export function pendingFor(
  boards: BoardsDir,
  rows: Row[],
  where: { state: string; width: string; theme: string }
): string[] {
  const active: Deviation[] = activeDeviations(
    boards.deviations,
    boards.merged
  );
  const out = new Set<string>();
  for (const row of rows) {
    for (const l of row.later ?? []) {
      if (boards.merged.includes(l.ticket)) continue;
      const ok = active.some(
        (d) =>
          d.property === "later" &&
          d.section.includes(row.id) &&
          d.state.includes(where.state) &&
          d.width.includes(where.width) &&
          d.theme.includes(where.theme) &&
          d.board === laterSelector(l.hide) &&
          d.built === "absent" &&
          d.expires === l.ticket
      );
      if (ok) out.add(l.ticket);
    }
  }
  return [...out].sort();
}
