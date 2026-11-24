import type { Page } from "@playwright/test";

/**
 * The card detector. A card has a border on all four sides, or a background
 * unlike its parent's, and a corner radius above 0. Rows with only a top or
 * bottom border, controls (button, input, select, textarea, summary) and
 * anything inside [data-fragment] are never cards. A card grid is 3 or more
 * sibling cards with equal rendered widths and heights.
 */

export interface CardGrid {
  /** A short description of the shared parent. */
  parent: string;
  count: number;
  width: number;
  height: number;
  cards: string[];
}

export interface CardReport {
  cards: string[];
  grids: CardGrid[];
}

/** Finds the cards and card grids under `root` (the whole page by default). */
export async function detectCards(
  page: Page,
  root = "body"
): Promise<CardReport> {
  return page.evaluate((rootSelector) => {
    const CONTROLS = new Set([
      "BUTTON",
      "INPUT",
      "SELECT",
      "TEXTAREA",
      "SUMMARY",
    ]);
    const SIDES = ["Top", "Right", "Bottom", "Left"] as const;
    const RADII = [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ] as const;

    const alpha = (color: string) => {
      if (color === "transparent") return 0;
      const parts = color.match(/[\d.]+/g) ?? [];
      return color.startsWith("rgba") || parts.length === 4
        ? Number(parts[3])
        : 1;
    };
    const background = (el: Element | null): string => {
      for (let e = el; e; e = e.parentElement) {
        const color = getComputedStyle(e).backgroundColor;
        if (alpha(color) > 0) return color;
      }
      return "rgb(255, 255, 255)";
    };
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : "";
      const cls =
        typeof el.className === "string" && el.className.trim()
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      const text = (el.textContent ?? "").trim().slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
    };
    const isCard = (el: Element) => {
      if (CONTROLS.has(el.tagName) || el.closest("[data-fragment]"))
        return false;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const sides = SIDES.map(
        (side) =>
          parseFloat(cs[`border${side}Width`]) > 0 &&
          !["none", "hidden"].includes(cs[`border${side}Style`])
      );
      // A rule above or below a row does not make it a card.
      if (sides.some(Boolean) && !sides[1] && !sides[3]) return false;
      const bordered = sides.every(Boolean);
      const own = cs.backgroundColor;
      const shaded = alpha(own) > 0 && own !== background(el.parentElement);
      const rounded = RADII.some((r) => parseFloat(cs[r]) > 0);
      return (bordered || shaded) && rounded;
    };

    const scope = document.querySelector(rootSelector) ?? document.body;
    const cards = [...scope.querySelectorAll("*")].filter(isCard);
    const byParent = new Map<Element, Element[]>();
    for (const card of cards) {
      const parent = card.parentElement;
      if (!parent) continue;
      byParent.set(parent, [...(byParent.get(parent) ?? []), card]);
    }
    const grids: CardGrid[] = [];
    for (const [parent, siblings] of byParent) {
      const groups: { width: number; height: number; members: Element[] }[] =
        [];
      for (const card of siblings) {
        const { width, height } = card.getBoundingClientRect();
        const group = groups.find(
          (g) =>
            Math.abs(g.width - width) < 0.5 && Math.abs(g.height - height) < 0.5
        );
        if (group) group.members.push(card);
        else groups.push({ width, height, members: [card] });
      }
      for (const g of groups.filter((g) => g.members.length >= 3)) {
        grids.push({
          parent: describe(parent),
          count: g.members.length,
          width: g.width,
          height: g.height,
          cards: g.members.map(describe),
        });
      }
    }
    return { cards: cards.map(describe), grids };
  }, root);
}
