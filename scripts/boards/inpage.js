/**
 * Fidelity measurement, injected into every board and site page before its
 * own scripts run (Playwright addInitScript). It defines window.__fidelity:
 *
 * - a motion recorder: every CSS animation and transition that starts is
 *   noted with its name, duration, element and the direction its keyframes
 *   move in;
 * - settle(): ends every finite animation at its final state and parks
 *   endless ones at their start, so a capture never depends on timing;
 * - measure(): boxes, type, colour, copy, image frames and colour tokens of
 *   the rows it is given.
 *
 * The same code measures the board and the site, so both are read alike.
 */
(() => {
  if (window.__fidelity) return;

  const records = [];
  let recording = true;

  const round = (n, d = 2) => {
    const f = 10 ** d;
    return Math.round(n * f) / f;
  };

  // Colours, normalised through a canvas to rgba() in sRGB, 8 bits each.
  let ctx = null;
  const colour = (value) => {
    if (!value || value === "none") return "none";
    if (!ctx) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      ctx = c.getContext("2d", { willReadFrequently: true });
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${round(a / 255, 3)})`;
  };

  const isColour = (value) =>
    value !== "" &&
    !value.includes("var(") &&
    CSS.supports("color", value) &&
    !/^(inherit|initial|unset|revert|currentcolor)$/i.test(value);

  // --- motion -------------------------------------------------------------

  const parseTranslate = (t) => {
    if (!t || t === "none") return null;
    let x = 0;
    let y = 0;
    let found = false;
    const num = (s) => parseFloat(s);
    let m;
    const both = /translate(?:3d)?\(\s*([^,)]+)(?:,\s*([^,)]+))?/g;
    while ((m = both.exec(t))) {
      x += num(m[1]);
      if (m[2]) y += num(m[2]);
      found = true;
    }
    const tx = /translateX\(\s*([^)]+)\)/g;
    while ((m = tx.exec(t))) {
      x += num(m[1]);
      found = true;
    }
    const ty = /translateY\(\s*([^)]+)\)/g;
    while ((m = ty.exec(t))) {
      y += num(m[1]);
      found = true;
    }
    const mx = /matrix\(([^)]+)\)/.exec(t);
    if (mx) {
      const p = mx[1].split(",").map(num);
      x += p[4];
      y += p[5];
      found = true;
    }
    return found && (x !== 0 || y !== 0) ? { x, y } : null;
  };

  const signs = (v) =>
    `${v.x > 0 ? "x+" : v.x < 0 ? "x-" : ""}${
      v.y > 0 ? "y+" : v.y < 0 ? "y-" : ""
    }`;

  /** Where an animation moves its element, from its keyframes. */
  const direction = (frames) => {
    const parts = [];
    const clip = frames.find((k) => k.clipPath && k.clipPath !== "none");
    if (clip) {
      const at = /at\s+(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(clip.clipPath);
      if (/circle\(/.test(clip.clipPath) && at) {
        // The control under the circle's centre: the reveal grows from it.
        const x = parseFloat(at[1]);
        const y = parseFloat(at[2]);
        const control = [
          ...document.querySelectorAll("button, a[href], [role=button]"),
        ].find((c) => {
          const r = c.getBoundingClientRect();
          return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        });
        parts.push(
          control
            ? `grow@${control.tagName.toLowerCase()}[${(control.getAttribute("aria-label") || control.textContent || "").trim()}]`
            : "grow@point"
        );
      } else {
        parts.push("wipe");
      }
    }
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (first && last) {
      const start = parseTranslate(first.transform);
      const end = parseTranslate(last.transform);
      if (start) parts.push(`enter ${signs(start)}`);
      else if (end) parts.push(`exit ${signs(end)}`);
      else {
        const mid = frames
          .map((k) => parseTranslate(k.transform))
          .find(Boolean);
        if (mid) parts.push(`via ${signs(mid)}`);
        else if (frames.some((k) => /rotate|scale/.test(k.transform || "")))
          parts.push("turn");
      }
      const o0 = first.opacity === undefined ? null : parseFloat(first.opacity);
      const o1 = last.opacity === undefined ? null : parseFloat(last.opacity);
      if (o0 !== null && o1 !== null && o0 !== o1)
        parts.push(o0 < o1 ? "fade-in" : "fade-out");
    }
    return parts.join(" ") || "none";
  };

  const note = (event) => {
    if (!recording) return;
    const name = event.animationName || event.propertyName;
    if (!name || name.startsWith("-ua-")) return;
    const pseudo = event.pseudoElement || "";
    const pool = pseudo
      ? document
          .getAnimations()
          .filter((a) => a.effect && a.effect.pseudoElement === pseudo)
      : event.target.getAnimations();
    const anim = pool.find(
      (a) => (a.animationName || a.transitionProperty) === name
    );
    if (!anim || !anim.effect) return;
    const timing = anim.effect.getComputedTiming();
    records.push({
      el: event.target,
      pseudo,
      name: event.animationName ? name : `transition:${name}`,
      duration: round(Number(timing.duration) || 0, 1),
      direction: direction(anim.effect.getKeyframes()),
    });
  };
  document.addEventListener("animationstart", note, true);
  document.addEventListener("transitionrun", note, true);

  // --- rows and keys ------------------------------------------------------

  const visible = (el) => {
    if (!el.isConnected) return false;
    if (
      el.checkVisibility &&
      !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  /** The elements a row selector matches, its excluded children removed. */
  const rowElements = (row) =>
    [...document.querySelectorAll(row.selector)].filter(visible);

  const excludedFor = (row) =>
    (row.exclude || []).flatMap((s) => [...document.querySelectorAll(s)]);

  /**
   * Key elements of a row, by category, in document order. A row's named
   * keys (its own selectors, such as the range's peek frames) come first.
   */
  const keysOf = (els, excluded, categories, named = []) => {
    const seen = new Set();
    const out = [];
    const take = (selector) => {
      const found = [];
      for (const root of els) {
        const list = root.matches(selector) ? [root] : [];
        list.push(...root.querySelectorAll(selector));
        for (const el of list) {
          if (seen.has(el) || !visible(el)) continue;
          if (excluded.some((x) => x === el || x.contains(el))) continue;
          seen.add(el);
          found.push(el);
        }
      }
      return found.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );
    };
    for (const [name, selector] of named) {
      const [el] = take(selector);
      if (el) out.push({ key: name, cat: "frame", el });
    }
    for (const [cat, selector] of categories) {
      let index = 0;
      for (const el of take(selector))
        out.push({ key: `${cat}:${index++}`, cat, el });
    }
    return out;
  };

  const family = (value) => {
    const first = value
      .split(",")[0]
      .trim()
      .replace(/^["']|["']$/g, "");
    // next/font names a face "__Red_Hat_Display_1a2b3c"; the board names it
    // "Red Hat Display".
    const m = /^__(.+?)(?:_Fallback)?_[0-9a-f]{6,}$/.exec(first);
    return (m ? m[1].replace(/_/g, " ") : first).toLowerCase();
  };

  const sides = (cs, prop) => {
    const v = ["Top", "Right", "Bottom", "Left"].map((s) => prop(cs, s));
    return v.every((x) => x === v[0]) ? v[0] : v.join(" / ");
  };

  const border = (cs) =>
    sides(cs, (c, s) => {
      const w = parseFloat(c[`border${s}Width`]) || 0;
      const style = c[`border${s}Style`];
      if (!w || style === "none" || style === "hidden") return "none";
      return `${round(w)}px ${style} ${colour(c[`border${s}Color`])}`;
    });

  const radius = (cs) =>
    [
      cs.borderTopLeftRadius,
      cs.borderTopRightRadius,
      cs.borderBottomRightRadius,
      cs.borderBottomLeftRadius,
    ].every((r) => r === cs.borderTopLeftRadius)
      ? cs.borderTopLeftRadius
      : [
          cs.borderTopLeftRadius,
          cs.borderTopRightRadius,
          cs.borderBottomRightRadius,
          cs.borderBottomLeftRadius,
        ].join(" / ");

  const label = (el) =>
    (
      el.getAttribute("aria-label") ||
      el.getAttribute("alt") ||
      el.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);

  const keyData = (k, origin) => {
    const r = k.el.getBoundingClientRect();
    const cs = getComputedStyle(k.el);
    const size = parseFloat(cs.fontSize);
    const data = {
      key: k.key,
      label: label(k.el),
      box: [
        round(r.left + scrollX - origin.x),
        round(r.top + scrollY - origin.y),
        round(r.width),
        round(r.height),
      ],
      color: colour(cs.color),
      background: colour(cs.backgroundColor),
      border: border(cs),
      radius: radius(cs),
    };
    // Change detection only, never compared with a board: what a control
    // selects and which picture a frame holds.
    const aria = [
      "aria-pressed",
      "aria-selected",
      "aria-current",
      "aria-checked",
    ]
      .map((a) => (k.el.hasAttribute(a) ? `${a}=${k.el.getAttribute(a)}` : ""))
      .filter(Boolean)
      .join(" ");
    if (aria) data.aria = aria;
    if (k.cat === "image" || k.cat === "frame") {
      if (k.cat === "image")
        data.src = (k.el.currentSrc || k.el.getAttribute("src") || "")
          .split("/")
          .pop();
      data.ratio = round(r.width / r.height, 4);
    } else {
      data.type = {
        family: family(cs.fontFamily),
        size: round(size, 3),
        lineHeight:
          cs.lineHeight === "normal"
            ? "normal"
            : round(parseFloat(cs.lineHeight), 3),
        tracking:
          cs.letterSpacing === "normal"
            ? 0
            : round(parseFloat(cs.letterSpacing) / size, 5),
        weight: Number(cs.fontWeight),
      };
    }
    return data;
  };

  const blockOf = (node) => {
    let el = node.parentElement;
    while (el && getComputedStyle(el).display.startsWith("inline"))
      el = el.parentElement;
    return el;
  };

  /** A row's visible text, whitespace normalised, child rows left out. */
  const copyOf = (els, excluded) => {
    let text = "";
    let lastBlock = null;
    for (const root of els) {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const tag = node.tagName;
              if (tag === "BR") return NodeFilter.FILTER_ACCEPT;
              if (
                tag === "SCRIPT" ||
                tag === "STYLE" ||
                tag === "TEMPLATE" ||
                excluded.some((x) => x === node) ||
                !visible(node)
              )
                return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_SKIP;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          // A line break reads as a space.
          text += " ";
          continue;
        }
        if (!n.data.trim()) continue;
        const block = blockOf(n);
        if (block !== lastBlock) text += " ";
        lastBlock = block;
        text += n.data;
      }
      text += " ";
      lastBlock = null;
    }
    return text.replace(/\s+/g, " ").trim();
  };

  const tokensAt = (el) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (let i = 0; i < cs.length; i++) {
      const name = cs[i];
      if (!name.startsWith("--")) continue;
      const value = cs.getPropertyValue(name).trim();
      if (isColour(value)) out[name] = colour(value);
    }
    return out;
  };

  const tokenValues = (el, names) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const name of names) {
      const value = cs.getPropertyValue(name).trim();
      out[name] =
        value === "" ? "unset" : isColour(value) ? colour(value) : value;
    }
    return out;
  };

  window.__fidelity = {
    /** Starts a fresh motion record. */
    motionStart() {
      records.length = 0;
      recording = true;
    },

    /**
     * The motions recorded since motionStart, each attributed to the row and
     * key element it ran on. `owner` takes motions outside every row.
     */
    motionTake(spec) {
      const categories = Object.entries(spec.keys);
      const rows = spec.rows.map((row) => ({
        row,
        els: rowElements(row),
        excluded: excludedFor(row),
      }));
      const out = records.splice(0).map((rec) => {
        const target = rec.el;
        // The innermost row that holds the element wins (a child row).
        let best = null;
        for (const r of rows) {
          if (!r.els.some((e) => e === target || e.contains(target))) continue;
          if (r.excluded.some((x) => x === target || x.contains(target)))
            continue;
          best = r;
        }
        let key = "row";
        if (best) {
          const keys = keysOf(
            best.els,
            best.excluded,
            categories,
            best.row.named || []
          );
          // The key element itself, or else the innermost key holding it.
          const hit = keys.find((k) => k.el === target);
          const holders = keys.filter((k) => k.el.contains(target));
          const inner = holders.find(
            (h) => !holders.some((o) => o !== h && h.el.contains(o.el))
          );
          key = hit ? hit.key : inner ? inner.key : "row";
        } else if (rec.pseudo) {
          key = "page";
        }
        return {
          row: best ? best.row.id : spec.owner || null,
          key,
          name: rec.name,
          duration: rec.duration,
          direction: rec.direction,
        };
      });
      out.sort((a, b) =>
        `${a.row}|${a.name}|${a.key}|${a.direction}|${a.duration}`.localeCompare(
          `${b.row}|${b.name}|${b.key}|${b.direction}|${b.duration}`
        )
      );
      return out;
    },

    /** Finite animations end; endless ones park at their start. */
    async settle() {
      for (const a of document.getAnimations()) {
        const t = a.effect ? a.effect.getComputedTiming() : null;
        try {
          if (t && Number.isFinite(t.endTime)) a.finish();
          else {
            a.pause();
            a.currentTime = 0;
          }
        } catch {
          // An animation that cannot be finished is left as it is.
        }
      }
      // Every picture decoded, so a shot never catches one half painted.
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {}))
      );
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
      await document.fonts.ready;
    },

    /** Holds every running animation at half its duration. */
    async holdHalfway() {
      for (const a of document.getAnimations()) {
        const t = a.effect ? a.effect.getComputedTiming() : null;
        if (!t || !Number.isFinite(t.endTime)) continue;
        a.pause();
        a.currentTime = (Number(t.delay) || 0) + Number(t.activeDuration) / 2;
      }
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
    },

    /** Hides board elements a later ticket adds (a partial build). */
    hide(entries) {
      for (const entry of entries) {
        for (const el of document.querySelectorAll(entry.selector)) {
          if (entry.mode === "remove")
            el.style.setProperty("display", "none", "important");
          else el.style.setProperty("visibility", "hidden", "important");
        }
      }
    },

    /** Measures rows; see scripts/boards/capture.ts for the shape. */
    measure(spec) {
      const categories = Object.entries(spec.keys);
      const out = { rows: {}, tokens: {} };
      const all = [];
      for (const row of spec.rows) {
        const els = rowElements(row);
        if (!els.length) {
          out.rows[row.id] = null;
          continue;
        }
        const excluded = excludedFor(row);
        const rects = els.map((e) => e.getBoundingClientRect());
        const x = Math.min(...rects.map((r) => r.left)) + scrollX;
        const y = Math.min(...rects.map((r) => r.top)) + scrollY;
        const right = Math.max(...rects.map((r) => r.right)) + scrollX;
        const bottom = Math.max(...rects.map((r) => r.bottom)) + scrollY;
        const origin = { x, y };
        out.rows[row.id] = {
          box: [round(x), round(y), round(right - x), round(bottom - y)],
          copy: copyOf(els, excluded),
          keys: keysOf(els, excluded, categories, row.named || []).map((k) =>
            keyData(k, origin)
          ),
          order: 0,
        };
        all.push({ id: row.id, el: els[0] });
      }
      all.sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1
      );
      all.forEach((r, i) => {
        out.rows[r.id].order = i;
      });
      // Tokens are read where the boards define them: the root.
      const root = document.documentElement;
      out.tokens = spec.tokenNames
        ? tokenValues(root, spec.tokenNames)
        : tokensAt(root);
      return out;
    },
  };
})();
