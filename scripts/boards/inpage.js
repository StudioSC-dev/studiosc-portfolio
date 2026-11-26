/**
 * Fidelity measurement, injected into every board and site page before its
 * own scripts run (Playwright addInitScript). It defines window.__fidelity:
 *
 * - a motion recorder: every CSS animation and transition that starts, and
 *   every Web Animations effect, is noted with its name, duration, element
 *   and the direction it moves in as played (reversed playback included);
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
  /** Every animation already noted, so a sweep never notes one twice. */
  const seen = new WeakSet();
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

  /** A length in px: px, viewport units or a percentage of the viewport. */
  const px = (value, unit) => {
    const v = parseFloat(value);
    const vw = innerWidth / 100;
    const vh = innerHeight / 100;
    switch (unit) {
      case "vw":
        return v * vw;
      case "vh":
        return v * vh;
      case "vmax":
        return v * Math.max(vw, vh);
      case "vmin":
        return v * Math.min(vw, vh);
      case "%":
        return ((v / 100) * Math.hypot(innerWidth, innerHeight)) / Math.SQRT2;
      default:
        return v;
    }
  };

  /** A circle() clip: its radius in px and its centre, when given in px. */
  const circle = (value) => {
    const m =
      /circle\(\s*(-?[\d.]+)(px|%|vw|vh|vmax|vmin)?(?:\s+at\s+(-?[\d.]+)px\s+(-?[\d.]+)px)?/.exec(
        value || ""
      );
    if (!m) return null;
    return {
      r: px(m[1], m[2]),
      at: m[3] === undefined ? null : [parseFloat(m[3]), parseFloat(m[4])],
    };
  };

  /** Whether the animation plays its keyframes last to first. */
  const backwardsOf = (anim) => {
    const t = anim.effect.getTiming ? anim.effect.getTiming() : {};
    return (
      (t.direction === "reverse" || t.direction === "alternate-reverse") !==
      anim.playbackRate < 0
    );
  };

  /** The keyframes in the order the animation plays them. */
  const played = (anim) => {
    const frames = anim.effect.getKeyframes();
    return backwardsOf(anim) ? [...frames].reverse() : frames;
  };

  /** Where an animation moves its element, from its keyframes as played. */
  const direction = (frames) => {
    const parts = [];
    const clips = frames.filter((k) => k.clipPath && k.clipPath !== "none");
    if (clips.length) {
      const a = circle(clips[0].clipPath);
      const b = circle(clips[clips.length - 1].clipPath);
      if (a && b) {
        // A reveal grows from, or shrinks into, the control under its centre.
        const verb = b.r > a.r ? "grow" : b.r < a.r ? "shrink" : "hold";
        const at = (b.r >= a.r ? a : b).at;
        const control = at
          ? [
              ...document.querySelectorAll("button, a[href], [role=button]"),
            ].find((c) => {
              const r = c.getBoundingClientRect();
              return (
                at[0] >= r.left &&
                at[0] <= r.right &&
                at[1] >= r.top &&
                at[1] <= r.bottom
              );
            })
          : null;
        parts.push(
          control
            ? `${verb}@${control.tagName.toLowerCase()}[${(control.getAttribute("aria-label") || control.textContent || "").trim()}]`
            : `${verb}@point`
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

  /**
   * Notes one animation, once. Its direction is read as it starts and read
   * again when the record is taken if the page has turned it round since
   * (reverse() or a negative rate straight after animate() or play()).
   */
  const record = (anim, el, pseudo, name, provisional = false) => {
    if (!anim || !anim.effect || seen.has(anim)) return;
    seen.add(anim);
    if (!recording) return;
    records.push({
      el,
      pseudo,
      name,
      anim,
      provisional,
      backwards: backwardsOf(anim),
      direction: direction(played(anim)),
    });
  };

  /** A record's duration and direction as the animation now stands. */
  const asPlayed = (rec) => {
    const timing = rec.anim.effect.getComputedTiming();
    return {
      duration: round(Number(timing.duration) || 0, 1),
      direction:
        backwardsOf(rec.anim) === rec.backwards
          ? rec.direction
          : direction(played(rec.anim)),
    };
  };

  const nameOf = (anim) =>
    anim.animationName ||
    (anim.transitionProperty
      ? `transition:${anim.transitionProperty}`
      : `animate:${anim.id || "effect"}`);

  /** Animations no event announced (Web Animations, or a missed start). */
  const sweep = () => {
    for (const anim of document.getAnimations()) {
      if (seen.has(anim) || anim.playState === "finished") continue;
      const effect = anim.effect;
      const pseudo = (effect && effect.pseudoElement) || "";
      const el = (effect && effect.target) || document.documentElement;
      record(anim, el, pseudo, nameOf(anim));
    }
  };

  // Element.animate starts no CSS event: note it as it starts.
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const anim = animate.apply(this, args);
    const opts = args[1];
    const pseudo =
      (opts && typeof opts === "object" && opts.pseudoElement) || "";
    record(anim, this, pseudo, nameOf(anim));
    return anim;
  };

  // An Animation built by hand starts with play(), and no event: note it
  // there, before a short one can finish ahead of any sweep.
  const play = Animation.prototype.play;
  Animation.prototype.play = function (...args) {
    const out = play.apply(this, args);
    const effect = this.effect;
    if (effect && effect.target)
      record(this, effect.target, effect.pseudoElement || "", nameOf(this));
    return out;
  };

  /** Pauses an animation at the fraction `at` of its active duration. */
  const holdAt = (a, at) => {
    const t = a.effect.getComputedTiming();
    a.pause();
    a.currentTime = (Number(t.delay) || 0) + Number(t.activeDuration) * at;
  };
  const finite = (a) =>
    a.effect && Number.isFinite(a.effect.getComputedTiming().endTime);

  // The view transition the page started last, while it runs: its
  // pseudo-elements and their animations exist only once it is ready.
  let transition = null;
  /** Per transition: settles once its animations are noted and confirmed. */
  const playing = new WeakMap();
  /** The fraction an in-flight capture holds the next transition at. */
  let armed = null;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  /**
   * A transition, once ready: its pseudo-elements' animations are noted the
   * moment they exist, so none (the UA's short group animation most of all)
   * can finish before a sweep sees it, and held at once when an in-flight
   * capture armed a hold, so none can finish before the capture. The notes
   * stay provisional for two frames: a reveal the page skips once it is
   * ready never plays, and its animations are cancelled (idle) by then.
   */
  const onReady = async () => {
    const anims = document
      .getAnimations()
      .filter((a) =>
        ((a.effect && a.effect.pseudoElement) || "").startsWith(
          "::view-transition"
        )
      );
    for (const a of anims)
      record(
        a,
        document.documentElement,
        a.effect.pseudoElement,
        nameOf(a),
        true
      );
    if (armed !== null) {
      const at = armed;
      armed = null;
      for (const a of anims)
        if (a.playState === "running" && finite(a)) holdAt(a, at);
    }
    await frame();
    await frame();
    for (const rec of records)
      if (
        rec.provisional &&
        anims.includes(rec.anim) &&
        rec.anim.playState !== "idle"
      )
        rec.provisional = false;
  };
  const startViewTransition = Document.prototype.startViewTransition;
  if (startViewTransition)
    Document.prototype.startViewTransition = function (...args) {
      const t = startViewTransition.apply(this, args);
      transition = t;
      const done = () => {
        if (transition === t) transition = null;
      };
      t.finished.then(done, done);
      playing.set(
        t,
        t.ready.then(onReady, () => {})
      );
      return t;
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
      (a) => !seen.has(a) && (a.animationName || a.transitionProperty) === name
    );
    record(
      anim,
      event.target,
      pseudo,
      event.animationName ? name : `transition:${name}`
    );
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
      if (k.cat === "image") data.src = photoOf(k.el);
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

  /** The listed colour tokens an element defines (or inherits). */
  const tokensAt = (el, names) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const name of names) {
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

  /**
   * The photo a picture shows: its file name, read from the original source
   * when an image optimiser serves it (`/_next/image?url=/img/one.webp&w=…`).
   */
  const photoOf = (img) => {
    const src = img.currentSrc || img.getAttribute("src") || "";
    let url;
    try {
      url = new URL(src, location.href);
    } catch {
      return src.split("?")[0].split("/").pop();
    }
    const original = url.searchParams.get("url");
    if (original) {
      try {
        url = new URL(original, location.href);
      } catch {
        return original.split("?")[0].split("/").pop();
      }
    }
    return decodeURIComponent(url.pathname.split("/").pop());
  };

  const labelOf = (el) =>
    (el.getAttribute("aria-label") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

  /** What a control can change in a row: pictures, slides, scroll, pressed. */
  const showsOf = (els, excluded) => {
    const inRow = (selector, skipChildRows) => {
      const found = [];
      for (const root of els) {
        const list = root.matches(selector) ? [root] : [];
        list.push(...root.querySelectorAll(selector));
        for (const el of list) {
          if (found.includes(el) || !visible(el)) continue;
          if (skipChildRows && excluded.some((x) => x === el || x.contains(el)))
            continue;
          found.push(el);
        }
      }
      return found;
    };
    const scrolling = [];
    for (const root of els)
      for (const el of [root, ...root.querySelectorAll("*")]) {
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        const o = getComputedStyle(el).overflowX;
        if (o === "auto" || o === "scroll") scrolling.push(el);
      }
    return {
      photos: inRow("img", true).map(photoOf),
      // A row's slides count even when they are rows of their own.
      slides: inRow('[aria-roledescription="slide"]', false).map(labelOf),
      scroll: scrolling.map((el) => Math.round(el.scrollLeft)),
      pressed: inRow(
        '[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"], [aria-current]:not([aria-current="false"])',
        true
      ).map(labelOf),
    };
  };

  /** Scroll positions of the window and every scrolling element. */
  const scrollState = () => {
    const out = [scrollX, scrollY];
    for (const el of document.querySelectorAll("*"))
      if (
        el.scrollWidth > el.clientWidth + 1 ||
        el.scrollHeight > el.clientHeight + 1
      )
        out.push(el.scrollLeft, el.scrollTop);
    return out.join(",");
  };

  window.__fidelity = {
    /** Starts a fresh motion record. */
    motionStart() {
      records.length = 0;
      recording = true;
    },

    /**
     * Waits until a view transition the page has started is ready (or
     * skipped): until then its animations do not exist, and the page keeps
     * drawing frames, so no fixed wait covers it on a slow host.
     */
    async transitionReady() {
      const t = transition;
      if (t) await playing.get(t);
    },

    /**
     * Arms a hold at the fraction `at` for the view transition a step is
     * about to start: it is held the moment it is ready, whenever the
     * capture itself gets to hold().
     */
    holdArm(at) {
      armed = at;
    },

    /**
     * The motions recorded since motionStart, each attributed to the row and
     * key element it ran on. `owner` takes motions outside every row.
     */
    motionTake(spec) {
      sweep();
      const categories = Object.entries(spec.keys);
      const rows = spec.rows.map((row) => ({
        row,
        els: rowElements(row),
        excluded: excludedFor(row),
      }));
      // A note never confirmed is a reveal that did not play.
      const kept = records.splice(0).filter((rec) => !rec.provisional);
      const out = kept.map((rec) => {
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
        const now = asPlayed(rec);
        return {
          row: best ? best.row.id : spec.owner || null,
          key,
          name: rec.name,
          duration: now.duration,
          direction: now.direction,
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
      // A smooth scroll (a chip strip) is not an animation: wait for it.
      let last = scrollState();
      for (let same = 0, i = 0; same < 3 && i < 120; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = scrollState();
        same = now === last ? same + 1 : 0;
        last = now;
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

    /**
     * Holds every running animation, a view transition's included, at the
     * same fraction `at` of its active duration, so an in-flight state is one
     * fixed frame whenever the capture reaches it. Returns the viewport when
     * a view transition is held: the only frame it draws.
     */
    async hold(at) {
      armed = null;
      const held = transition;
      if (held) await playing.get(held);
      // Only what is moving now: a finished load animation stays finished.
      // A transition armed for this hold is held already.
      for (const a of document.getAnimations())
        if (a.playState === "running" && finite(a)) holdAt(a, at);
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
      return held && transition === held
        ? [scrollX, scrollY, innerWidth, innerHeight]
        : null;
    },

    /**
     * Hides board elements a later ticket adds (a partial build): those on
     * the page now, and any a later step mounts (a plate's interior appears
     * only once its tab is picked), through a stylesheet that stays.
     */
    hide(entries) {
      const rule = (entry) =>
        entry.mode === "remove"
          ? ["display", "none"]
          : ["visibility", "hidden"];
      const style = document.createElement("style");
      style.dataset.fidelityHide = "";
      style.textContent = entries
        .map((entry) => {
          const [prop, value] = rule(entry);
          return `:is(${entry.selector}) { ${prop}: ${value} !important; }`;
        })
        .join("\n");
      (document.head || document.documentElement).appendChild(style);
      for (const entry of entries) {
        const [prop, value] = rule(entry);
        for (const el of document.querySelectorAll(entry.selector))
          el.style.setProperty(prop, value, "important");
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
          shows: showsOf(els, excluded),
        };
        all.push({ id: row.id, x, y });
      }
      // Rendered order: top to bottom, and left to right on one line (tops
      // within 4px), so a CSS reorder counts and DOM order does not.
      all.sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x));
      all.forEach((r, i) => {
        out.rows[r.id].order = i;
      });
      // Tokens are read where the palette is defined: the board's wrapper,
      // or the site's scope for the same tokens.
      const scope = spec.tokens && document.querySelector(spec.tokens.scope);
      out.tokens = !scope
        ? {}
        : spec.tokens.read
          ? tokenValues(scope, spec.tokens.read)
          : tokensAt(scope, spec.tokens.names);
      return out;
    },

    /**
     * The files the page shows as pictures: each image's chosen source (its
     * `<picture>` source for this width) and each CSS background image, as
     * URLs. What the page renders, not what the browser happened to fetch.
     */
    photos() {
      const out = new Set();
      for (const img of document.images) {
        const src = img.currentSrc || img.src;
        if (src) out.add(src);
      }
      for (const el of document.querySelectorAll("*"))
        for (const m of getComputedStyle(el).backgroundImage.matchAll(
          /url\("?([^")]+)"?\)/g
        ))
          out.add(m[1]);
      return [...out].sort();
    },

    /**
     * The page's font faces: each @font-face rule with its family, weight,
     * style, range and file, and the load status of the face it made; and
     * the first family and weight of every visible text element in `rows`.
     */
    fonts(spec) {
      const faces = [];
      const ranges = (v) =>
        (v || "U+0-10FFFF")
          .split(",")
          .map((r) => r.trim().replace(/^U\+/i, "").split("-"))
          .map(([a, b]) => `${parseInt(a, 16)}-${parseInt(b || a, 16)}`)
          .join(",");
      const loaded = [...document.fonts];
      // document.fonts lists the CSS faces in rule order: each rule takes the
      // next face with its descriptors, so two rules alike keep their own.
      const taken = new Set();
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          if (!(rule instanceof CSSFontFaceRule)) continue;
          const st = rule.style;
          const fam = st
            .getPropertyValue("font-family")
            .trim()
            .replace(/^["']|["']$/g, "");
          const weight = st.getPropertyValue("font-weight").trim() || "400";
          const style = st.getPropertyValue("font-style").trim() || "normal";
          const range = ranges(st.getPropertyValue("unicode-range"));
          const urls = [
            ...st
              .getPropertyValue("src")
              .matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g),
          ].map((m) => new URL(m[1], sheet.href || location.href).href);
          const face = loaded.find(
            (f) =>
              !taken.has(f) &&
              f.family.replace(/^["']|["']$/g, "") === fam &&
              f.weight === weight &&
              f.style === style &&
              ranges(f.unicodeRange) === range
          );
          if (face) taken.add(face);
          faces.push({
            family: fam,
            weight,
            style,
            urls,
            local: /local\(/.test(st.getPropertyValue("src")),
            status: face ? face.status : "unknown",
          });
        }
      }
      const used = new Set();
      for (const row of spec.rows)
        for (const root of rowElements(row))
          for (const el of [root, ...root.querySelectorAll(spec.text)]) {
            if (!visible(el) || !el.textContent.trim()) continue;
            const cs = getComputedStyle(el);
            const first = cs.fontFamily
              .split(",")[0]
              .trim()
              .replace(/^["']|["']$/g, "");
            used.add(`${first}|${cs.fontWeight}|${cs.fontStyle}`);
          }
      return { faces, used: [...used].sort() };
    },
  };
})();
