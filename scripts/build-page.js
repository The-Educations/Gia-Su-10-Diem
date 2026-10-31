import fs from 'node:fs';
import path from 'node:path';

const inputs = JSON.parse(fs.readFileSync('inputs.json', 'utf8'));
const baseCss = fs.readFileSync('styles.css', 'utf8');
const siteScript = fs.readFileSync('scripts/site.js', 'utf8');

function mixed(text) {
  if (typeof text === 'string') return text;
  if (!Array.isArray(text)) return String(text ?? '');
  return text.map(seg => {
    seg = { ...seg, text: seg.text.replace(/\n/g, '<br>') };
    if (seg.dot) return `<span class='dot'>${seg.text}</span>`;
    if (seg.em) return `<em>${seg.text}</em>`;
    return seg.text;
  }).join('');
}

function br(s) {
  return String(s || '').replace(/\n/g, '<br/>');
}

function attr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ext(href) {
  if (/^(https?:|mailto:|tel:|\/\/)/i.test(href)) {
    return ` target='_blank' rel='noreferrer noopener'`;
  }
  return '';
}

const ARROW_OUT = `<svg viewBox='0 0 24 24'><path d='M5 19L19 5M19 5H8M19 5v11'/></svg>`;
const ARROW_PLUS = `<svg viewBox='0 0 24 24'><circle cx='12' cy='12' r='9'/><path d='M9 12h6M12 9v6'/></svg>`;

const customStyles = `
/* Bespoke styling for Gia Sư 10 Điểm */
.asset-mode-switcher {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 10;
  display: flex;
  gap: 6px;
  background: rgba(239, 231, 210, 0.94);
  backdrop-filter: blur(8px);
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.mode-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--ink-mute);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.mode-btn:hover {
  color: var(--ink);
  background: rgba(21, 20, 15, 0.05);
}
.mode-btn.active {
  color: var(--paper);
  background: var(--ink);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.mobile-menu-toggle,
.mobile-nav { display: none; }
.hero-art-layer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
}
.three-hint {
  position: absolute;
  bottom: 14px;
  left: 14px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-mute);
  background: rgba(239, 231, 210, 0.88);
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  pointer-events: none;
}

/* Consultation Booking Box in Section VIII */
.booking-box {
  background: var(--paper-dark);
  border: 1.5px solid var(--line-strong);
  padding: 32px;
  margin-top: 36px;
  border-radius: 6px;
  box-shadow: 0 4px 20px rgba(21, 20, 15, 0.06);
}
.booking-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 20px;
}
@media (max-width: 640px) {
  .booking-grid {
    grid-template-columns: 1fr;
  }
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field label {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}
.form-field select,
.form-field input {
  padding: 10px 14px;
  background: var(--paper);
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink);
  outline: none;
  transition: border-color 0.2s;
}
.form-field select:focus,
.form-field input:focus {
  border-color: var(--coral);
}
.booking-submit-btn {
  grid-column: 1 / -1;
  background: var(--coral);
  color: #ffffff;
  border: none;
  padding: 14px 20px;
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.2s, transform 0.1s;
}
.booking-submit-btn:hover {
  background: #e35a46;
}
.booking-submit-btn:active {
  transform: translateY(1px);
}




@media (max-width: 880px) {
  .mobile-menu-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: transparent;
    color: var(--ink);
    font: 600 12px/1 var(--sans);
    cursor: pointer;
  }
  .mobile-menu-toggle[aria-expanded='true'] { background: var(--ink); color: var(--paper); }
  .mobile-nav[hidden] { display: none; }
  .mobile-nav:not([hidden]) {
    display: block;
    background: var(--paper);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .mobile-nav-inner { display: grid; gap: 0; padding-top: 8px; padding-bottom: 12px; }
  .mobile-nav-inner a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--line-soft);
    color: var(--ink);
    text-decoration: none;
    font: 600 15px/1.2 var(--sans);
  }
  .mobile-nav-inner a:last-child { border-bottom: 0; }
  .mobile-nav-inner .num { color: var(--coral); font-size: 11px; margin-left: auto; padding-left: 8px; }
  .mobile-nav-inner .mobile-nav-cta { color: var(--coral); }
}
`;

function renderPage(i, css) {
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');

  // Hero stats & index
  const statsHtml = i.hero.stats.map(s => {
    const variant = s.variant ?? 'dashed';
    const ringClass = variant === 'solid' ? 'ring solid' : variant === 'coral' ? 'ring coral' : 'ring';
    return `<div class='stat'>
      <span class='${ringClass}'>${s.value}</span>
      <span class='stat-label'><b>${s.label}</b>${s.sub}</span>
    </div>`;
  }).join('\n          ');

  // Capability cards
  const capCards = i.capabilities.cards.map(c => `
    <div class='card' data-reveal>
      <svg class='icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'>
        ${c.icon_svg}
      </svg>
      <h3>${br(c.title)}</h3>
      <p>${c.body}</p>
    </div>
  `).join('\n            ');

  // Lab pills & cards
  const filterKeys = i.labs.pills.map(p => p.key);
  const labPills = i.labs.pills.map((p, idx) =>
    `<button type='button' class='pill${p.active ? ' active' : ''}' data-filter='${filterKeys[idx] || 'all'}' aria-pressed='${p.active ? 'true' : 'false'}'>${p.label}<span class='count'>${p.key === 'all' ? i.labs.cards.length : i.labs.cards.filter(c => c.category === p.key).length}</span></button>`
  ).join('\n          ');

  const labCards = i.labs.cards.map((c, idx) => `
    <div class='lab' data-category='${c.category}' data-reveal>
      <div class='lab-img'>

        <picture>
          <img src='${assets}lab-${idx + 1}.png' alt="${attr(c.title)}" loading='lazy' />
        </picture>
      </div>

      <h3>${c.title}</h3>
      <p>${c.body}</p>
      <a class='course-select' href='#contact' data-subject='${c.subject}' aria-label='Chọn môn học: ${attr(c.title)}'>Chọn môn học <span aria-hidden='true'>↗</span></a>
    </div>
  `).join('\n        ');

  // Method steps
  const methodSteps = i.method.steps.map((s, idx) => `
    <li class='method-step' data-reveal>
      <h3>${s.title}</h3>
      <p>${s.body}</p>
      <div class='img'>
        <picture>
          <img src='${assets}method-${idx + 1}.png' alt="${attr(s.title)}" loading='lazy' />
        </picture>
      </div>
    </li>
  `).join('\n        ');

  // Work cards
  const workCards = i.work.cards.map((c, idx) => `
    <a class='work-card${idx === 1 ? ' alt' : ''}' data-reveal href='#contact'>
      <div class='label-row'>
        <span class='small-label'>${c.small_label}</span>
        <span class='index'>${c.index}</span>
      </div>
      <h3>${c.title}</h3>
      <p>${c.body}</p>
      <div class='img'>
        <picture>
          <img src='${assets}work-${idx + 1}.png' alt="${attr(c.title)}" loading='lazy' />
        </picture>
      </div>
      <div class='meta-row'>
        <span class='year'>${c.year}</span>
        <span>${c.tag}</span>
      </div>
    </a>
  `).join('\n      ');

  // Testimonial partners
  const partnersHtml = i.testimonial.partners.map(p => `
    <div class='partner' data-reveal>
      <span>${p.name}</span>
    </div>
  `).join('\n        ');

  // Footer columns
  const footerCols = i.footer.columns.map(c => `
    <div class='foot-col'>
      <h3>${c.title}</h3>
      <ul>
        ${c.links.map(l => `<li><a href='${l.href}'${ext(l.href)}>${l.label}</a></li>`).join('\n        ')}
      </ul>
    </div>
  `).join('\n      ');

  return `<!DOCTYPE html>
<html lang='${i.brand.locale ?? 'vi'}'>
<head>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1' />
<title>${i.brand.name} — ${i.brand.tagline}</title>
<meta name='description' content='${i.brand.description}' />
<link rel='preconnect' href='https://fonts.googleapis.com' />
<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin />
<link href='https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Inter+Tight:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600&family=JetBrains+Mono:wght@400;500;600&display=swap' rel='stylesheet' />
<!-- Three.js CDN for interactive 3D hero artifact -->
<script src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'></script>
<style>
${customStyles}
${css}
</style>
</head>
<body>

<a class='skip-link' href='#main'>Bỏ qua điều hướng</a>
<div class='shell'>


<header class='nav' data-od-id='nav'>
  <div class='container nav-inner'>
    <a href='#top' class='brand'>
      <span class='brand-mark'>${i.brand.mark}</span>
      <span>${i.brand.name}</span>
    </a>
    <nav aria-label='Điều hướng chính'>
      <ul class='nav-links'>
        ${i.nav.map(n => `<li><a href='${n.href}'>${n.label}</a></li>`).join('\n        ')}
      </ul>
    </nav>
    <div class='nav-side'><a class='nav-login' href='/app/auth'>Đăng nhập</a>
      <a class='nav-cta' href='/app/tutors'>Tìm Gia Sư</a>
    </div>
    <button class='mobile-menu-toggle' type='button' aria-expanded='false' aria-controls='mobile-nav'>
      <span class='sr-only'>Mở menu</span><span aria-hidden='true'>Menu</span>
    </button>
  </div>
  <nav class='mobile-nav' id='mobile-nav' aria-label='Điều hướng di động' hidden>
    <div class='container mobile-nav-inner'>
      ${i.nav.map(n => `<a href='${n.href}'>${n.label}</a>`).join('\n      ')}
      <a href='/app/auth'>Đăng nhập</a>
      <a class='mobile-nav-cta' href='/app/tutors'>Tìm gia sư <span aria-hidden='true'>↗</span></a>
    </div>
  </nav>
</header>

<main id='main' tabindex='-1'>
<section class='hero' id='top' aria-labelledby='hero-title' data-od-id='hero'>
  <div class='container hero-grid'>
    <div class='hero-copy'>
      <h1 id='hero-title' class='display' data-reveal>${mixed(i.hero.headline)}</h1>
      <p class='lead' data-reveal>${i.hero.lead}</p>
      <div class='hero-actions' data-reveal>
        <a class='btn btn-primary' href='${i.hero.primary.href}'>
          ${i.hero.primary.label}
          <span class='arrow'>${ARROW_OUT}</span>
        </a>
        <a class='btn btn-ghost' href='${i.hero.secondary.href}'>
          ${i.hero.secondary.label}
          <span class='arrow'>${ARROW_PLUS}</span>
        </a>
      </div>
      <div class='hero-stats' data-reveal>
          ${statsHtml}
      </div>
    </div>

    <div class='hero-art' data-reveal='scale'>
      <span class='study-float study-float-math' data-parallax='-0.12' aria-hidden='true'>x² + y² <small>Toán học</small></span>
      <span class='study-float study-float-language' data-parallax='0.15' aria-hidden='true'>Aa <small>Ngôn ngữ</small></span>

      <!-- Mode Switcher for Interactive Assets -->
      <div class='asset-mode-switcher'>
        <button type='button' class='mode-btn active' data-mode='3d' aria-pressed='true'>3D</button>
        <button type='button' class='mode-btn' data-mode='pixel' aria-pressed='false'>Pixel</button>
        <button type='button' class='mode-btn' data-mode='plate' aria-pressed='false'>Ảnh</button>
      </div>

      <!-- 3D Three.js Interactive Container -->
      <div id='layer-3d' class='hero-art-layer' style='display:block;'>
        <canvas id='three-canvas' tabindex='0' aria-label='Khối hình học 3D. Dùng phím mũi tên để xoay.' style='width:100%;height:100%;display:block;min-height:480px;'></canvas>
        <div class='three-hint'>✦ Di chuột / Kéo để xoay khối Điểm 10</div>
      </div>

      <!-- Pixel Art Interactive Canvas -->
      <div id='layer-pixel' class='hero-art-layer' style='display:none;'>
        <canvas id='pixel-canvas' role='img' aria-label='Minh họa lớp học bằng pixel' width='360' height='360' style='width:100%;height:100%;display:block;min-height:480px;image-rendering:pixelated;'></canvas>
        <div class='three-hint'>▤ Hoạt Họa Pixel Art · Lớp học 1 kèm 1</div>
      </div>

      <!-- Editorial Plate Fallback (with real photo asset) -->
      <div id='layer-plate' class='hero-art-layer' style='display:none;'>
        <picture>
          <img src="${assets}hero.png" alt="Gia Sư 10 Điểm" style="width:100%;height:100%;max-height:640px;object-fit:contain;display:block;margin:auto;" />
        </picture>
      </div>

    </div>
  </div>
</section>


<section class='learning-journey' id='journey' aria-labelledby='journey-title'>
  <div class='container journey-stage'>
    <div class='journey-copy'>
      <h2 class='display' id='journey-title'>Mỗi cách học.<br><em>Một người đồng hành.</em></h2>
      <ol class='journey-steps'>
        <li class='is-current'><span>01</span><div><h3>Chọn môn em muốn hiểu.</h3><p>Toán, khoa học, ngôn ngữ. Bắt đầu từ mục tiêu của em.</p><a href='/app/library'>Khám phá môn học ↗</a></div></li>
        <li><span>02</span><div><h3>Gặp người dạy phù hợp.</h3><p>Xem chuyên môn, CV và cách dạy. Nhắn hỏi trước khi chọn lịch.</p><a href='/app/tutors'>Tìm gia sư ↗</a></div></li>
        <li><span>03</span><div><h3>Dành một giờ cho tiến bộ.</h3><p>Chọn giờ trống, gửi yêu cầu và trao đổi cùng gia sư.</p><a href='/app/auth?mode=register'>Bắt đầu học ↗</a></div></li>
      </ol>
    </div>
    <div class='learning-desk' aria-hidden='true'>
      <div class='desk-orbit'></div>
      <div class='desk-book book-math'><span>Toán học</span><strong>π</strong><i>Hiểu từ gốc.</i></div>
      <div class='desk-book book-language'><span>Ngôn ngữ</span><strong>Aa</strong><i>Mở góc nhìn.</i></div>
      <div class='desk-notebook'>
        <div class='notebook-binding'></div>
        <span class='notebook-subject'>Một giờ học của em</span>
        <svg viewBox='0 0 260 200' fill='none'><path d='M28 165H240M45 182V20' stroke='#bbb5a5'/><path d='M55 145Q100 140 140 103T220 35' stroke='#852f36' stroke-width='4' stroke-linecap='round'/><path d='M55 145L140 103L220 35' stroke='#b6a888' stroke-dasharray='5 6'/><circle cx='55' cy='145' r='6' fill='#852f36'/><circle cx='140' cy='103' r='6' fill='#852f36'/><circle cx='220' cy='35' r='6' fill='#852f36'/></svg>
        <strong>Hiểu hơn hôm qua.</strong>
        <div class='notebook-lines'></div>
      </div>
      <div class='desk-pencil'></div>
      <div class='desk-note'>Cứ hỏi.<br><em>Mình cùng tìm hiểu.</em></div>
    </div>
  </div>
</section>

<section class='about' aria-labelledby='about-title' data-od-id='about'>
  <div class='container'>
    <div class='about-grid'>
      <div class='about-copy'>
        <h2 id='about-title' class='display' data-reveal>${mixed(i.about.headline)}</h2>
        <p class='lead' data-reveal>${i.about.lead}</p>
        <div class='about-action' data-reveal>
          <a class='btn btn-ghost' href='${i.about.cta_href}'>
            ${i.about.cta_label}
            <span class='arrow'>${ARROW_OUT}</span>
          </a>
        </div>
      </div>
      <div class='about-art' data-reveal='scale'>
        <div class='plate' data-parallax='0.06'>
          <picture>
            <img src='${assets}about.png' alt="${attr(i.about.caption)}" />
          </picture>
        </div>
      </div>
    </div>
  </div>
</section>

<section class='capabilities' id='capabilities' aria-labelledby='capabilities-title' data-od-id='capabilities'>
  <div class='container'>
    <div class='cap-head'>
      <h2 id='capabilities-title' class='display' data-reveal>${mixed(i.capabilities.headline)}</h2>
      <p class='lead' data-reveal>${i.capabilities.lead}</p>
    </div>
    <div class='capabilities-grid'>
      <div class='capabilities-art' data-reveal='scale'>
        <div class='art-frame' data-parallax='-0.05'>
          <picture>
            <img src='${assets}capabilities.png' alt='Quy Chuẩn Tuyển Chọn Gia Sư' />
          </picture>
        </div>
      </div>
      <div class='content'>
        <div class='cards'>
            ${capCards}
        </div>
      </div>
    </div>
  </div>
</section>

<section class='labs' id='labs' aria-labelledby='labs-title' data-od-id='labs'>
  <div class='container'>
    <div class='labs-head'>
      <div data-reveal>
        <h2 id='labs-title' class='display'>${mixed(i.labs.headline)}</h2>
      </div>
      <div class='pills' data-reveal='right'>
          ${labPills}
      </div>
    </div>
    <div class='course-toolbar'>
      <label class='search-field' for='course-search'><svg aria-hidden='true' viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='1.5'><circle cx='10' cy='10' r='6'/><path d='m15 15 5 5'/></svg><input id='course-search' type='search' placeholder='Tìm môn học…' aria-label='Tìm môn học' /></label>
      <p id='course-count' role='status' aria-live='polite'>5 chương trình</p>
    </div>
    <div class='labs-grid' id='labs-container'>
        ${labCards}
    </div>
    <div id='course-empty' class='course-empty' hidden><p>Chưa tìm thấy môn học phù hợp.</p><button type='button' id='reset-courses'>Xem tất cả môn học ↗</button></div>
  </div>
</section>

<section class='method' id='method' aria-labelledby='method-title' data-od-id='method'>
  <div class='container'>
    <div class='method-head'>
      <div data-reveal>
        <h2 id='method-title' class='display'>${mixed(i.method.headline)}</h2>
      </div>
    </div>
    <ol class='method-grid'>
        ${methodSteps}
    </ol>
    <div class='method-foot'>
      <div class='left'>
        <span class='ring'></span>
        <span>${i.method.foot_left}</span>
      </div>
      <div class='right'><a class='method-repo-link' href='#contact'><b>${i.method.foot_right_bold}</b></a> &nbsp;·&nbsp; ${i.method.foot_right_rest}</div>
    </div>
  </div>
</section>

<section class='tight' id='work' aria-labelledby='tight-title' data-od-id='work'>
  <div class='work'>
    <div class='work-grid'>
      <div class='work-copy' data-reveal>
        <h2 id='tight-title'>${mixed(i.work.headline)}</h2>
        <a class='work-link' href='#contact'>${i.work.link_label}</a>
      </div>
      ${workCards}
    </div>
  </div>
</section>

<section class='testimonial' aria-labelledby='testimonial-title' data-od-id='testimonial'>
  <div class='container'>
    <div class='testimonial-grid'>
      <div class='testimonial-copy' data-reveal>
        <h2 id='testimonial-title' class='display'>Cùng con <em>trưởng thành.</em></h2>
        <blockquote>&ldquo;${mixed(i.testimonial.quote)}&rdquo;</blockquote>
        <div class='author'>
          <span class='avatar'>${i.testimonial.author.initial}</span>
          <p>${i.testimonial.author.name}<br/><span>${i.testimonial.author.title}</span></p>
        </div>
        <div class='divider'></div>
        <p class='partners-text'>${i.testimonial.partners_text}</p>
        <div class='partners'>
          ${partnersHtml}
        </div>
        <a class='read-more' href='/app/tutors'>${i.testimonial.read_more_label}</a>
      </div>
      <div class='testimonial-art' data-reveal='right'>
        <picture>
          <img src='${assets}testimonial.png' alt='Minh họa việc học cùng người đồng hành' />
        </picture>
      </div>
    </div>
  </div>
</section>

<section class='cta' id='contact' aria-labelledby='cta-title' data-od-id='cta'>
  <div class='container'>
    <div class='cta-grid'>
      <div data-reveal>
        <h2 id='cta-title' class='display'>${mixed(i.cta.headline)}</h2>
        <p class='lead'>${i.cta.lead}</p>

        <div class='booking-box' id='booking-form'>
          <form id='tutor-booking-form' action='/app/tutors' method='get'>
            <div class='booking-grid'>
              <div class='form-field'><label for='form-subject'>Môn học</label>
                <select id='form-subject' name='subject'><option value=''>Tất cả môn học</option><option value='toan'>Toán</option><option value='vat-li'>Vật lí</option><option value='hoa-hoc'>Hóa học</option><option value='tieng-anh'>Tiếng Anh</option><option value='ngu-van'>Ngữ văn</option><option value='khtn'>Khoa học tự nhiên</option></select>
              </div>
              <div class='form-field'><label for='form-mode'>Hình thức</label>
                <select id='form-mode' name='mode'><option value=''>Tất cả hình thức</option><option value='online'>Trực tuyến</option><option value='offline'>Trực tiếp</option></select>
              </div>
              <button type='submit' class='booking-submit-btn'>Tìm gia sư phù hợp ↗</button>
            </div>
          </form>
        </div>
      </div>

      <div class='art' data-reveal='scale'>
        <div class='plate'>
          <picture>
            <img src='${assets}cta.png' alt='Đăng Ký Tư Vấn' />
          </picture>
        </div>
      </div>
    </div>
  </div>
</section>

</main>
<footer data-od-id='footer'>
  <div class='container'>
    <div class='foot-grid'>
      <div class='foot-brand'>
        <a href='#top' class='brand'>
          <span class='brand-mark'>${i.brand.mark}</span>
          <span>${i.brand.name}</span>
        </a>
        <p style='margin-top:18px;'>${i.footer.brand_description}</p>
        <a class='foot-cta' href='${i.footer.brand_cta.href}'>${i.footer.brand_cta.label}<span class='meta'>${i.footer.brand_cta.meta}</span></a>
      </div>
      ${footerCols}
    </div>
    <div class='foot-bottom'><span>© ${i.brand.year} ${i.brand.name}</span><span>${i.brand.location}</span></div>
    <div class='foot-mega'>
      <div class='word' data-reveal='rise-lg'>${mixed(i.footer.mega)}</div>
    </div>
  </div>
</footer>
</div>

<script>
  /*
   * Scroll-reveal observer.
   * Watches every [data-reveal] element and flips data-revealed='true'.
   */
  (function () {
    var elements = document.querySelectorAll('[data-reveal]:not([data-revealed])');
    if (!elements.length || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (var i = 0; i < elements.length; i++) elements[i].dataset.revealed = 'true';
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.dataset.revealed = 'true';
        observer.unobserve(entries[i].target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.documentElement.classList.add('reveal-ready');
    for (var j = 0; j < elements.length; j++) observer.observe(elements[j]);
  })();

  /*
   * Headroom-style sticky header.
   */
  (function () {
    var nav = document.querySelector('header.nav');
    if (!nav) return;
    var SHOW_TOP = 100;
    var DELTA = 6;
    var lastY = window.scrollY || 0;
    function onScroll() {
      var y = window.scrollY || 0;
      var d = y - lastY;
      if (y <= SHOW_TOP || nav.contains(document.activeElement) || document.querySelector('.mobile-menu-toggle').getAttribute('aria-expanded') === 'true') {
        nav.classList.remove('is-hidden');
      } else if (d > DELTA) {
        nav.classList.add('is-hidden');
      } else if (d < -DELTA) {
        nav.classList.remove('is-hidden');
      }
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    nav.addEventListener('focusin', function () { nav.classList.remove('is-hidden'); });
  })();

  function selectVisual(mode) {
    document.querySelectorAll('.mode-btn').forEach(function (button) {
      var selected = button.dataset.mode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
      document.getElementById('layer-' + button.dataset.mode).style.display = selected ? 'block' : 'none';
    });
    window.dispatchEvent(new Event('visualmodechange'));
  }
  document.querySelectorAll('.mode-btn').forEach(function (button) {
    button.addEventListener('click', function () { selectVisual(button.dataset.mode); });
  });
  function disableThree() {
    var button = document.querySelector('[data-mode="3d"]');
    button.disabled = true;
    button.title = '3D không khả dụng trên trình duyệt này';
    selectVisual('plate');
  }

  // Render only the selected, on-screen visual; one still frame for reduced motion.
  function animateVisual(canvas, draw) {
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var visible = false;
    var request = 0;
    var last = 0;
    var elapsed = 0;
    function active() {
      return visible && !document.hidden && canvas.parentElement.style.display !== 'none';
    }
    function frame(now) {
      request = 0;
      if (!active()) return;
      var delta = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (!motion.matches) elapsed += delta;
      draw(motion.matches ? 0 : delta, elapsed);
      if (!motion.matches) request = requestAnimationFrame(frame);
    }
    function sync() {
      cancelAnimationFrame(request);
      request = 0;
      last = 0;
      if (active()) request = requestAnimationFrame(frame);
    }
    var observer = new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; sync(); });
    observer.observe(document.querySelector('.hero-art'));
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('visualmodechange', sync);
    motion.addEventListener('change', sync);
    return function () {
      cancelAnimationFrame(request);
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('visualmodechange', sync);
      motion.removeEventListener('change', sync);
    };
  }

  /*
   * Three.js Interactive 3D Academic Polyhedron
   */
  (function initThreeScene() {
    if (typeof THREE === 'undefined') { disableThree(); return; }

    var canvas = document.getElementById('three-canvas');
    if (!canvas) return;

    var container = canvas.parentElement;
    var width = container.clientWidth || 480;
    var height = container.clientHeight || 480;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 6.8;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      if (!renderer.getContext()) throw new Error("No WebGL context");
    } catch (e) { disableThree(); return; }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Colors aligned with Atelier Zero
    var coralColor = 0xed6f5c;
    var mustardColor = 0xe9b94a;
    var inkColor = 0x15140f;
    var oliveColor = 0x6e7448;

    // Outer Main Polyhedron: Icosahedron
    var geomIcosa = new THREE.IcosahedronGeometry(1.2, 0);
    var matWire = new THREE.MeshBasicMaterial({
      color: mustardColor,
      wireframe: true,
      wireframeLinewidth: 2,
      transparent: true,
      opacity: 0.85
    });
    var icosaMesh = new THREE.Mesh(geomIcosa, matWire);
    scene.add(icosaMesh);

    // Inner Faceted Core: Dodecahedron
    var geomCore = new THREE.DodecahedronGeometry(0.7, 0);
    var matCore = new THREE.MeshStandardMaterial({
      color: coralColor,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0.75
    });
    var coreMesh = new THREE.Mesh(geomCore, matCore);
    scene.add(coreMesh);

    // Orbital Rings (Sciences, Math, Humanities)
    var ringGroup = new THREE.Group();
    for (var r = 0; r < 3; r++) {
      var ringGeom = new THREE.TorusGeometry(1.7 + r * 0.22, 0.012, 16, 100);
      var ringMat = new THREE.MeshBasicMaterial({
        color: r === 0 ? coralColor : (r === 1 ? oliveColor : inkColor),
        transparent: true,
        opacity: 0.55
      });
      var ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = (r * Math.PI) / 3;
      ringMesh.rotation.y = (r * Math.PI) / 4;
      ringGroup.add(ringMesh);
    }
    scene.add(ringGroup);

    // Floating particles (Knowledge sparks)
    var particleCount = 80;
    var particleGeom = new THREE.BufferGeometry();
    var positions = new Float32Array(particleCount * 3);
    for (var p = 0; p < particleCount * 3; p += 3) {
      positions[p] = (Math.random() - 0.5) * 5;
      positions[p + 1] = (Math.random() - 0.5) * 5;
      positions[p + 2] = (Math.random() - 0.5) * 5;
    }
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var particleMat = new THREE.PointsMaterial({
      color: coralColor,
      size: 0.04,
      transparent: true,
      opacity: 0.6
    });
    var particleSystem = new THREE.Points(particleGeom, particleMat);
    scene.add(particleSystem);

    // Lighting
    var ambLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambLight);

    var dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(3, 4, 3);
    scene.add(dirLight);

    // Mouse Interaction
    var targetRotX = 0;
    var targetRotY = 0;
    var isDragging = false;
    var prevMouseX = 0;
    var prevMouseY = 0;

    canvas.addEventListener('mousedown', function (e) {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', function () { isDragging = false; });

    window.addEventListener('mousemove', function (e) {
      if (isDragging) {
        var deltaX = e.clientX - prevMouseX;
        var deltaY = e.clientY - prevMouseY;
        targetRotY += deltaX * 0.01;
        targetRotX += deltaY * 0.01;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      } else {
        var rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height || e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
        var mx = (e.clientX - rect.left) / rect.width - 0.5;
        var my = (e.clientY - rect.top) / rect.height - 0.5;
        targetRotY = mx * 0.6;
        targetRotX = my * 0.6;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        icosaMesh.rotation.set(targetRotX, targetRotY, 0);
        renderer.render(scene, camera);
      }
    });

    // Touch support for mobile devices
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (isDragging && e.touches.length === 1) {
        var deltaX = e.touches[0].clientX - prevMouseX;
        var deltaY = e.touches[0].clientY - prevMouseY;
        targetRotY += deltaX * 0.01;
        targetRotX += deltaY * 0.01;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          icosaMesh.rotation.set(targetRotX, targetRotY, 0);
          renderer.render(scene, camera);
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchend', function () { isDragging = false; });

    canvas.addEventListener('keydown', function (event) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) === -1) return;
      event.preventDefault();
      targetRotY += event.key === 'ArrowLeft' ? -0.2 : event.key === 'ArrowRight' ? 0.2 : 0;
      targetRotX += event.key === 'ArrowUp' ? -0.2 : event.key === 'ArrowDown' ? 0.2 : 0;
      icosaMesh.rotation.set(targetRotX, targetRotY, 0);
      renderer.render(scene, camera);
    });
    var stopAnimation = animateVisual(canvas, function (delta) {
      var blend = 1 - Math.exp(-3 * delta);
      icosaMesh.rotation.y += (targetRotY - icosaMesh.rotation.y) * blend + 0.18 * delta;
      icosaMesh.rotation.x += (targetRotX - icosaMesh.rotation.x) * blend + 0.12 * delta;
      coreMesh.rotation.y -= 0.24 * delta;
      coreMesh.rotation.z += 0.18 * delta;
      ringGroup.rotation.y += 0.30 * delta;
      ringGroup.rotation.x += 0.12 * delta;
      particleSystem.rotation.y += 0.06 * delta;
      renderer.render(scene, camera);
    });
    function resizeScene() {
      var w = container.clientWidth;
      var h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.position.z = camera.aspect < 0.8 ? 8.5 : 6.8;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    }
    var resizeObserver = new ResizeObserver(resizeScene);
    resizeObserver.observe(container);
    window.addEventListener('pagehide', function (event) {
      if (event.persisted) return;
      stopAnimation();
      resizeObserver.disconnect();
      scene.traverse(function (object) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
      renderer.dispose();
    });
  })();

  /*
   * Pixel Art Classroom Animation Engine
   */
  (function initPixelCanvas() {
    var pCanvas = document.getElementById('pixel-canvas');
    if (!pCanvas) return;
    var ctx = pCanvas.getContext('2d');
    if (!ctx) return;

    var frame = 0;
    var w = pCanvas.width;
    var h = pCanvas.height;

    function drawPixelScene(delta, elapsed) {
      frame = elapsed * 60;
      // Paper background
      ctx.fillStyle = '#efe7d2';
      ctx.fillRect(0, 0, w, h);

      // Pixelated Chalkboard
      ctx.fillStyle = '#1e3328';
      ctx.fillRect(40, 50, 280, 160);
      ctx.strokeStyle = '#8b5a2b';
      ctx.lineWidth = 6;
      ctx.strokeRect(37, 47, 286, 166);

      // Chalk Text & Equation
      ctx.fillStyle = '#f0ede0';
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.fillText('GIA SU 10 DIEM', 60, 85);
      ctx.fillStyle = '#e9b94a';
      ctx.fillText('lim (Diem) -> 10', 60, 115);
      ctx.fillStyle = '#ed6f5c';
      ctx.fillText('a^2 + b^2 = c^2', 60, 145);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('HOC HIEU - HOC VUNG', 60, 175);

      // Pixel Tutor Character
      var bob = Math.sin(frame * 0.08) * 3;
      var cx = 180;
      var cy = 250 + bob;

      // Body (suit in ink)
      ctx.fillStyle = '#15140f';
      ctx.fillRect(cx - 20, cy + 20, 40, 50);

      // Tie in coral
      ctx.fillStyle = '#ed6f5c';
      ctx.fillRect(cx - 4, cy + 24, 8, 25);

      // Head
      ctx.fillStyle = '#f7d3a2';
      ctx.fillRect(cx - 16, cy - 14, 32, 34);

      // Hair
      ctx.fillStyle = '#15140f';
      ctx.fillRect(cx - 18, cy - 20, 36, 12);

      // Glasses
      ctx.fillStyle = '#15140f';
      ctx.fillRect(cx - 12, cy - 4, 10, 8);
      ctx.fillRect(cx + 2, cy - 4, 10, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 10, cy - 2, 4, 4);
      ctx.fillRect(cx + 4, cy - 2, 4, 4);

      // Pointer Stick
      ctx.strokeStyle = '#e9b94a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 18, cy + 30);
      ctx.lineTo(260 + Math.sin(frame * 0.1) * 8, 110);
      ctx.stroke();

      // Floating Retro Sparkles
      ctx.fillStyle = '#ed6f5c';
      var sx = 60 + Math.sin(frame * 0.05) * 20;
      var sy = 280 + Math.cos(frame * 0.05) * 15;
      ctx.fillRect(sx, sy, 6, 6);
      ctx.fillStyle = '#e9b94a';
      ctx.fillRect(300 - sx * 0.4, 290 + sy * 0.1, 8, 8);

    }
    var stopPixelAnimation = animateVisual(pCanvas, drawPixelScene);
    window.addEventListener('pagehide', function (event) { if (!event.persisted) stopPixelAnimation(); });
  })();

${siteScript}
</script>
</body>
</html>`;
}

const html = renderPage(inputs, baseCss);
fs.writeFileSync('index.html', html, 'utf8');
console.log(`✓ Successfully compiled index.html (${(html.length / 1024).toFixed(1)} KB)`);
