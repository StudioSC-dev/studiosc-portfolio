// Stand-in canvas runtime for the fidelity fixture: wires the drawn controls.
(() => {
  const start = () => {
    const root = document.documentElement;
    const toggle = document.querySelector("[data-toggle]");
    const label = () =>
      toggle.setAttribute(
        "aria-label",
        root.dataset.theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"
      );
    label();
    toggle.addEventListener("click", () => {
      const r = toggle.getBoundingClientRect();
      root.style.setProperty("--rx", `${Math.round(r.left + r.width / 2)}px`);
      root.style.setProperty("--ry", `${Math.round(r.top + r.height / 2)}px`);
      const flip = () => {
        root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
        label();
      };
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !still) document.startViewTransition(flip);
      else flip();
    });

    const tabs = [...document.querySelectorAll("[data-tab]")];
    const plates = [...document.querySelectorAll("[data-plate]")];
    const count = document.querySelector("[data-count]");
    let current = 0;
    const show = (i, from) => {
      plates.forEach((p, j) => {
        p.hidden = j !== i;
        p.classList.remove("from-right", "from-left");
      });
      void plates[i].offsetWidth;
      plates[i].classList.add(from);
      tabs.forEach((t, j) => t.setAttribute("aria-pressed", String(j === i)));
      count.textContent = `${i + 1} of ${plates.length}`;
      current = i;
    };
    tabs.forEach((t, i) =>
      t.addEventListener("click", () => {
        if (i !== current) show(i, i > current ? "from-right" : "from-left");
      })
    );
    document
      .querySelector("[data-next-plate]")
      .addEventListener("click", () => show((current + 1) % plates.length, "from-right"));
    document
      .querySelector("[data-prev-plate]")
      .addEventListener("click", () =>
        show((current + plates.length - 1) % plates.length, "from-left")
      );

    const photos = [...document.querySelectorAll("[data-photo]")];
    const shown = document.querySelector("[data-shown]");
    let photo = 0;
    const pick = (i) => {
      photo = i;
      photos.forEach((p, j) => p.classList.toggle("on", j === i));
      shown.textContent = `${i + 1} of ${photos.length}`;
    };
    document
      .querySelector("[data-next-photo]")
      .addEventListener("click", () => pick((photo + 1) % photos.length));
    document
      .querySelector("[data-prev-photo]")
      .addEventListener("click", () => pick((photo + photos.length - 1) % photos.length));

    const filters = [...document.querySelectorAll("[data-filter]")];
    const items = [...document.querySelectorAll("[data-kind]")];
    filters.forEach((f) =>
      f.addEventListener("click", () => {
        filters.forEach((g) => g.setAttribute("aria-pressed", String(g === f)));
        items.forEach((it) => {
          it.hidden = f.dataset.filter !== "all" && it.dataset.kind !== f.dataset.filter;
        });
      })
    );
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
