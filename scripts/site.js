/* Inlined by build-page.js so the page also works without a web server. */
(function initCourseDiscovery() {
  const pills = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('#labs-container .lab')];
  const search = document.getElementById('course-search');
  let category = 'all';
  const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  function filterCourses() {
    const query = normalize(search.value.trim());
    let count = 0;
    cards.forEach(card => {
      const matches = (category === 'all' || card.dataset.category === category) && normalize(card.textContent).includes(query);
      card.hidden = !matches;
      if (matches) { count++; card.dataset.revealed = 'true'; }
    });
    pills.forEach(pill => {
      const selected = pill.dataset.filter === category;
      pill.classList.toggle('active', selected);
      pill.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('course-count').textContent = count + ' chương trình';
    document.getElementById('course-empty').hidden = count !== 0;
  }
  pills.forEach(pill => pill.addEventListener('click', () => { category = pill.dataset.filter; filterCourses(); }));
  search.addEventListener('input', filterCourses);
  document.getElementById('reset-courses').addEventListener('click', () => {
    category = 'all'; search.value = ''; filterCourses(); search.focus();
  });
  document.querySelectorAll('[data-subject]').forEach(link => link.addEventListener('click', () => {
    const subject = document.getElementById('form-subject');
    subject.value = ({ly:'vat-li',hoa:'hoa-hoc',anh:'tieng-anh',van:'ngu-van',chuyen:''})[link.dataset.subject] ?? link.dataset.subject;
    subject.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('tutor-booking-form').hidden = false;
    // Let the anchor navigate before placing keyboard focus in the form.
    setTimeout(() => subject.focus({ preventScroll: true }), 0);
  }));
})();

(function initMobileMenu() {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const menu = document.getElementById('mobile-nav');
  function closeMenu(restoreFocus = false) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.querySelector('.sr-only').textContent = 'Mở menu';
    menu.hidden = true;
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.querySelector('.sr-only').textContent = open ? 'Mở menu' : 'Đóng menu';
    menu.hidden = open;
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    closeMenu();
    const href = link.getAttribute('href');
    const target = href?.startsWith('#') ? document.querySelector(href) : null;
    if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) closeMenu(true);
  });
  matchMedia('(min-width: 881px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
})();

(function initLearningParallax() {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 880px)');
  const journey = document.querySelector('.learning-journey');
  const steps = [...document.querySelectorAll('.journey-steps li')];
  const layers = [...document.querySelectorAll('[data-parallax]')];
  let frame = 0;
  function paint() {
    frame = 0;
    const still = motion.matches || narrow.matches;
    const rect = journey.getBoundingClientRect();
    const progress = still ? 0.5 : Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - innerHeight)));
    journey.style.setProperty('--journey', progress);
    steps.forEach((step, index) => step.classList.toggle('is-current', still || index === Math.min(2, Math.floor(progress * 3))));
    layers.forEach(layer => {
      const parent = layer.parentElement.getBoundingClientRect();
      const distance = Math.max(-innerHeight, Math.min(innerHeight, innerHeight * 0.5 - parent.top - parent.height * 0.5));
      layer.style.setProperty('--parallax-y', (still ? 0 : distance * Number(layer.dataset.parallax)).toFixed(1) + 'px');
    });
  }
  function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(paint); }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  motion.addEventListener('change', schedule);
  narrow.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
})();
