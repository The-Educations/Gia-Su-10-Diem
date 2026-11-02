/* Inlined by build-page.js so the page also works without a web server. */
(function initCourseDiscovery() {
  const pills = [...document.querySelectorAll("[data-filter]")];
  const cards = [...document.querySelectorAll("#labs-container .lab")];
  const search = document.getElementById("course-search");
  let category = "all";
  const normalize = (value) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
  function filterCourses() {
    const query = normalize(search.value.trim());
    let count = 0;
    cards.forEach((card) => {
      const matches =
        (category === "all" || card.dataset.category === category) &&
        normalize(card.textContent).includes(query);
      card.hidden = !matches;
      if (matches) {
        count++;
        card.dataset.revealed = "true";
      }
    });
    pills.forEach((pill) => {
      const selected = pill.dataset.filter === category;
      pill.classList.toggle("active", selected);
      pill.setAttribute("aria-pressed", String(selected));
    });
    document.getElementById("course-count").textContent =
      count + " chương trình";
    document.getElementById("course-empty").hidden = count !== 0;
  }
  pills.forEach((pill) =>
    pill.addEventListener("click", () => {
      category = pill.dataset.filter;
      filterCourses();
    }),
  );
  search.addEventListener("input", filterCourses);
  document.getElementById("reset-courses").addEventListener("click", () => {
    category = "all";
    search.value = "";
    filterCourses();
    search.focus();
  });
})();

(function initMobileMenu() {
  const toggle = document.querySelector(".mobile-menu-toggle");
  const menu = document.getElementById("mobile-nav");
  function closeMenu(restoreFocus = false) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.querySelector(".sr-only").textContent = "Mở menu";
    menu.hidden = true;
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    toggle.querySelector(".sr-only").textContent = open
      ? "Mở menu"
      : "Đóng menu";
    menu.hidden = open;
  });
  menu.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      closeMenu();
      const href = link.getAttribute("href");
      const target = href?.startsWith("#")
        ? document.querySelector(href)
        : null;
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }),
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) closeMenu(true);
  });
  matchMedia("(min-width: 881px)").addEventListener("change", (event) => {
    if (event.matches) closeMenu();
  });
})();

(function initLearningParallax() {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = matchMedia("(max-width: 880px)");
  const journey = document.querySelector(".learning-journey");
  const steps = [...document.querySelectorAll(".journey-steps li")];
  const layers = [
    ...document.querySelectorAll("[data-parallax], [data-parallax-x]"),
  ];
  const header = document.querySelector(".nav");
  let frame = 0;
  function paint() {
    frame = 0;
    const still = motion.matches;
    header.classList.toggle("is-scrolled", scrollY > 20);
    const rect = journey.getBoundingClientRect();
    const progress =
      still || narrow.matches
        ? 0.5
        : Math.min(
            1,
            Math.max(
              0,
              (70 - rect.top) / Math.max(1, rect.height - innerHeight + 70),
            ),
          );
    journey.style.setProperty("--journey", progress);
    steps.forEach((step, index) =>
      step.classList.toggle(
        "is-current",
        still ||
          narrow.matches ||
          index === Math.min(2, Math.floor(progress * 3)),
      ),
    );
    layers.forEach((layer) => {
      const parent = layer.parentElement.getBoundingClientRect();
      const distance = Math.max(
        -innerHeight,
        Math.min(
          innerHeight,
          innerHeight * 0.5 - parent.top - parent.height * 0.5,
        ),
      );
      const horizontal = layer.hasAttribute("data-parallax-x");
      const speed = Number(
        horizontal ? layer.dataset.parallaxX : layer.dataset.parallax,
      );
      const travel = still ? 0 : distance * speed * (narrow.matches ? 0.35 : 1);
      layer.style.setProperty(
        horizontal ? "--parallax-x" : "--parallax-y",
        travel.toFixed(1) + "px",
      );
    });
  }
  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  motion.addEventListener("change", schedule);
  narrow.addEventListener("change", schedule);
  document.addEventListener("visibilitychange", schedule);
  schedule();
})();

(function initSessionLinks() {
  if (location.protocol === "file:") return;
  function relabel(link, text) {
    const node = [...link.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    if (node) node.textContent = text + " ";
    link.setAttribute("href", "/app/workspace");
  }
  fetch("/api/auth/me", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || !data.user) return;
      document
        .querySelectorAll(
          'a[href="/app/auth"], a[href="/app/auth?mode=register"]',
        )
        .forEach((link) => relabel(link, "Vào ứng dụng"));
    })
    .catch(() => {});
})();

(function initReveals() {
  const elements = document.querySelectorAll("[data-reveal]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  if (!("IntersectionObserver" in window) || motion.matches) return;
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      }),
    { threshold: 0.08 },
  );
  document.documentElement.classList.add("reveal-ready");
  elements.forEach((el) => observer.observe(el));
  motion.addEventListener("change", () => {
    if (motion.matches) {
      elements.forEach((el) => {
        el.dataset.revealed = "true";
      });
      observer.disconnect();
    }
  });
})();
