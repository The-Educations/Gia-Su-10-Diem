import fs from 'node:fs';
import path from 'node:path';

const inputs = JSON.parse(fs.readFileSync('inputs.json', 'utf8'));
const baseCss = fs.readFileSync('styles.css', 'utf8');

function mixed(text) {
  if (typeof text === 'string') return text;
  if (!Array.isArray(text)) return String(text ?? '');
  return text.map(seg => {
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
.toast-msg {
  display: none;
  background: #2a5a3a;
  color: #ffffff;
  padding: 12px 18px;
  border-radius: 4px;
  font-family: var(--sans);
  font-size: 13px;
  margin-top: 14px;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Dynamic filter transitions in Labs */
.lab.hidden-card {
  display: none !important;
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

  const indexHtml = i.hero.index.map(item => 
    `<span${item.active ? ` class='on'` : ''}><span class='n'>${item.num}</span>${item.label}</span>`
  ).join('\n      ');

  // Capability cards
  const capCards = i.capabilities.cards.map(c => `
    <div class='card' data-reveal>
      <div class='num'>${c.num}<span class='tag'>${c.tag}</span></div>
      <svg class='icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'>
        ${c.icon_svg}
      </svg>
      <h3>${br(c.title)}</h3>
      <p>${c.body}</p>
      <a class='arrow-mark' href='${c.href}'${ext(c.href)} aria-label='Tìm hiểu thêm về ${c.tag}'>
        ${ARROW_OUT}
      </a>
    </div>
  `).join('\n            ');

  // Lab pills & cards
  const filterKeys = ['all', 'math', 'science', 'english', 'exam'];
  const labPills = i.labs.pills.map((p, idx) => 
    `<button class='pill${p.active ? ' active' : ''}' data-filter='${filterKeys[idx] || 'all'}'>${p.label}<span class='count'>${p.count}</span></button>`
  ).join('\n          ');

  const labCategoryMap = ['math', 'science', 'english', 'literature', 'exam'];
  const labCards = i.labs.cards.map((c, idx) => `
    <div class='lab' data-category='${labCategoryMap[idx] || 'math'}' data-reveal>
      <div class='lab-img'>
        <span class='badge'>${c.badge}</span>
        <picture>
          <source srcset='${assets}lab-${idx + 1}.svg' type='image/svg+xml'>
          <img src='${assets}lab-${idx + 1}.png' alt="${attr(c.title)}" loading='lazy' />
        </picture>
      </div>
      <div class='num-row'><span>${c.num}</span><span>${c.year}</span></div>
      <h4>${c.title}</h4>
      <p>${c.body}</p>
      <a class='arrow-mark' href='${c.href}'${ext(c.href)} aria-label='Xem chi tiết môn ${c.title}'>${ARROW_OUT}</a>
    </div>
  `).join('\n        ');

  const progressHtml = Array.from({ length: i.labs.progress.total }, (_, k) =>
    k < i.labs.progress.filled ? `<span class='on'></span>` : `<span></span>`
  ).join('');

  // Method steps
  const methodSteps = i.method.steps.map((s, idx, arr) => `
    <div class='method-step' data-reveal>
      <div class='num'>${s.num}</div>
      <h4>${s.title}${idx === arr.length - 1 ? '' : ` <span class='arrow-r'>→</span>`}</h4>
      <p>${s.body}</p>
      <div class='img'>
        <picture>
          <source srcset='${assets}method-${idx + 1}.svg' type='image/svg+xml'>
          <img src='${assets}method-${idx + 1}.png' alt="${attr(s.title)}" loading='lazy' />
        </picture>
      </div>
    </div>
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
          <source srcset='${assets}work-${idx + 1}.svg' type='image/svg+xml'>
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
    <a class='partner' data-reveal href='${p.href || '#'}'${ext(p.href || '#')}>
      <div class='glyph'>
        <svg viewBox='0 0 80 30' fill='none' stroke='currentColor' stroke-width='2'>
          ${p.glyph_svg}
        </svg>
      </div>
      <span>${p.name}</span>
      <small>${p.role}</small>
    </a>
  `).join('\n        ');

  // Wire items
  const cityRow = [...i.wire.cities, ...i.wire.cities].map(c => 
    `<span class='wire-item'><span class='wire-dot'>·</span><span class='wire-coord'>${c.coord}</span><span class='wire-name'>${c.name}</span></span>`
  ).join('\n          ');

  const contribRow = [...i.wire.contributors, ...i.wire.contributors].map(c =>
    `<a class='wire-item is-link' href='${c.href}'${ext(c.href)}><span class='wire-dot'>·</span><span class='wire-handle'>${c.handle}</span><span class='wire-role'>${c.role}</span></a>`
  ).join('\n          ');

  // Footer columns
  const footerCols = i.footer.columns.map(c => `
    <div class='foot-col'>
      <h5>${c.title}</h5>
      <ul>
        ${c.links.map(l => `<li><a href='${l.href}'${ext(l.href)}>${l.label}</a></li>`).join('\n        ')}
      </ul>
    </div>
  `).join('\n      ');

  return `<!DOCTYPE html>
<html lang='${i.brand.locale ?? 'vi'}'>
<head>
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
${css}
${customStyles}
</style>
</head>
<body>

<div class='side-rail right' data-od-id='rail-right'>
  <span class='rail-text'>${i.brand.rails.right}</span>
</div>
<div class='side-rail left' data-od-id='rail-left'>
  <span class='rail-text'>${i.brand.rails.left}</span>
</div>

<div class='shell'>

<div class='topbar' data-od-id='topbar'>
  <div class='container topbar-inner'>
    <span><b>${i.brand.name}</b> &nbsp;·&nbsp; ${i.brand.edition}</span>
    <span class='mid'>
      <span>Lĩnh vực <b class='coral'>${i.brand.filed_under}</b></span>
      <span>${i.brand.license} · Việt Nam</span>
    </span>
    <span class='right'>
      <a class='topbar-link' href='#contact'><span class='pulse'></span>${i.brand.status}</a>
      <span><b>VI</b> · EN</span>
    </span>
  </div>
</div>

<header class='nav' data-od-id='nav'>
  <div class='container nav-inner'>
    <a href='#top' class='brand'>
      <span class='brand-mark'>${i.brand.mark}</span>
      <span>${i.brand.name}</span>
      <span class='brand-meta'><b>${i.brand.meta.title}</b>${i.brand.meta.subtitle}</span>
    </a>
    <nav>
      <ul class='nav-links'>
        ${i.nav.map(n => `<li><a href='${n.href}'>${n.label}${n.count ? `<span class='num'>${n.count}</span>` : ''}</a></li>`).join('\n        ')}
      </ul>
    </nav>
    <div class='nav-side'>
      <a class='nav-cta ghost' href='#labs'>Xem Môn Học</a>
      <a class='nav-cta' href='#contact'>Tìm Gia Sư</a>
      <span class='status-dot' aria-hidden='true'></span>
    </div>
  </div>
</header>

<section class='hero' id='top' data-od-id='hero'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>I.</span>
      <span class='meta-grp'>
        <span>Khởi Đầu / Trang Bìa</span>
        <span class='dot-mark'>•</span>
        <span>${i.brand.name} / Tập 01</span>
      </span>
      <span>001 / 008</span>
    </div>
  </div>
  <div class='container hero-grid'>
    <div class='hero-copy'>
      <span class='label' data-reveal>${i.hero.label} <span class='ix'>${i.hero.ix}</span></span>
      <h1 class='display' data-reveal>${mixed(i.hero.headline)}</h1>
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
      <div class='hero-foot' data-reveal>
        <span class='meta'>${i.hero.meta}</span>
        <span class='coord'>${i.brand.coordinates}</span>
      </div>
    </div>
    
    <div class='hero-art' data-reveal='scale'>
      <span class='corner tl'></span>
      <span class='corner tr'></span>
      <span class='corner bl'></span>
      <span class='corner br'></span>
      <span class='annot annot-tl coord'>${i.hero.annotations.tl}</span>
      <span class='annot annot-tr'>${i.hero.annotations.tr}</span>
      <span class='annot annot-bl coord'>${i.hero.annotations.bl}</span>
      <span class='annot annot-br'>${i.hero.annotations.br}</span>

      <!-- Mode Switcher for Interactive Assets -->
      <div class='asset-mode-switcher'>
        <button class='mode-btn active' data-mode='3d'>✦ 3D Khối Điểm 10</button>
        <button class='mode-btn' data-mode='pixel'>▤ Pixel Art</button>
        <button class='mode-btn' data-mode='plate'>▧ Bản In Đồ Họa</button>
      </div>

      <!-- 3D Three.js Interactive Container -->
      <div id='layer-3d' class='hero-art-layer' style='display:block;'>
        <canvas id='three-canvas' style='width:100%;height:100%;display:block;min-height:480px;'></canvas>
        <div class='three-hint'>✦ Di chuột / Kéo để xoay khối Điểm 10</div>
      </div>

      <!-- Pixel Art Interactive Canvas -->
      <div id='layer-pixel' class='hero-art-layer' style='display:none;'>
        <canvas id='pixel-canvas' width='360' height='360' style='width:100%;height:100%;display:block;min-height:480px;image-rendering:pixelated;'></canvas>
        <div class='three-hint'>▤ Hoạt Họa Pixel Art · Lớp học 1 kèm 1</div>
      </div>

      <!-- Editorial Plate Fallback (with real photo asset) -->
      <div id='layer-plate' class='hero-art-layer' style='display:none;'>
        <picture>
          <source srcset='${assets}hero.svg' type='image/svg+xml'>
          <img src="${assets}hero.png" alt="Gia Sư 10 Điểm" style="width:100%;height:100%;max-height:640px;object-fit:contain;display:block;margin:auto;" />
        </picture>
      </div>

      <div class='index'>
        ${indexHtml}
      </div>
    </div>
  </div>
</section>

<section class='wire' data-od-id='wire' aria-label='Mạng lưới học thuật toàn quốc'>
  <div class='container wire-inner'>
    <div class='wire-left'>
      <span class='wire-mark' aria-hidden='true'><span class='wire-pulse'></span></span>
      <span class='wire-title'>
        <b>${i.wire.title}</b>
        <span>${i.wire.subtitle}</span>
      </span>
    </div>
    <div class='wire-rows'>
      <div class='wire-row'>
        <div class='marquee-track' aria-hidden='true'>
          ${cityRow}
        </div>
      </div>
      <div class='wire-row'>
        <div class='marquee-track reverse' aria-hidden='true'>
          ${contribRow}
        </div>
      </div>
    </div>
  </div>
</section>

<section class='about' data-od-id='about'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>${i.rules.about.roman}</span>
      <span class='meta-grp'>
        <span>${i.rules.about.meta[0]}</span>
        <span class='dot-mark'>${i.rules.about.meta[1]}</span>
        <span>${i.rules.about.meta[2]}</span>
      </span>
      <span>${i.rules.about.pagination}</span>
    </div>
    <div class='about-grid'>
      <div class='about-copy'>
        <span class='label' data-reveal>${i.about.label} <span class='ix'>${i.about.ix}</span></span>
        <h2 class='display' data-reveal>${mixed(i.about.headline)}</h2>
        <p class='lead' data-reveal>${i.about.lead}</p>
        <div class='about-action' data-reveal>
          <a class='btn btn-ghost' href='${i.about.cta_href}'>
            ${i.about.cta_label}
            <span class='arrow'>${ARROW_OUT}</span>
          </a>
        </div>
        <div class='about-foot' data-reveal>
          <span class='foot-text'>${i.about.footer_text}</span>
          <span class='stamp'>
            <b>${i.about.stamp_top}</b>
            ${i.about.stamp_bottom}
          </span>
        </div>
      </div>
      <div class='about-art' data-reveal='scale'>
        <div class='plate'>
          <picture>
            <source srcset='${assets}about.svg' type='image/svg+xml'>
            <img src='${assets}about.png' alt="${attr(i.about.caption)}" />
          </picture>
        </div>
        <div class='about-side-note'>
          <span class='mono-label'>${i.about.side_note}</span>
          <span class='plate-caption'>${i.about.caption}</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class='capabilities' id='capabilities' data-od-id='capabilities'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>${i.rules.capabilities.roman}</span>
      <span class='meta-grp'>
        <span>${i.rules.capabilities.meta[0]}</span>
        <span class='dot-mark'>${i.rules.capabilities.meta[1]}</span>
        <span>${i.rules.capabilities.meta[2]}</span>
      </span>
      <span>${i.rules.capabilities.pagination}</span>
    </div>
    <div class='cap-head'>
      <span class='label' data-reveal>${i.capabilities.label} <span class='ix'>${i.capabilities.ix}</span></span>
      <h2 class='display' data-reveal>${mixed(i.capabilities.headline)}</h2>
      <p class='lead' data-reveal>${i.capabilities.lead}</p>
    </div>
    <div class='cap-body'>
      <div class='art' data-reveal='scale'>
        <div class='art-frame'>
          <picture>
            <source srcset='${assets}capabilities.svg' type='image/svg+xml'>
            <img src='${assets}capabilities.png' alt='Quy Chuẩn Tuyển Chọn Gia Sư' />
          </picture>
        </div>
        <div class='art-caption'>
          <span class='mono'>SÀNG LỌC 4 VÒNG KHẮT KHE</span>
          <span>Chỉ 8.5% gia sư thủ khoa được chứng nhận</span>
        </div>
      </div>
      <div class='content'>
        <div class='ribbon' data-reveal>
          <span class='ribbon-bar'></span>
          <span>${i.capabilities.ribbon}</span>
        </div>
        <div class='cards'>
            ${capCards}
        </div>
      </div>
    </div>
  </div>
</section>

<section class='labs' id='labs' data-od-id='labs'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>${i.rules.labs.roman}</span>
      <span class='meta-grp'>
        <span>${i.rules.labs.meta[0]}</span>
        <span class='dot-mark'>${i.rules.labs.meta[1]}</span>
        <span>${i.rules.labs.meta[2]}</span>
      </span>
      <span>${i.rules.labs.pagination}</span>
    </div>
    <div class='labs-head'>
      <div data-reveal>
        <span class='label'>${i.labs.label} <span class='ix'>${i.labs.ix}</span></span>
        <h2 class='display' style='margin-top:30px;'>${mixed(i.labs.headline)}</h2>
      </div>
      <div class='pills' data-reveal='right'>
          ${labPills}
      </div>
    </div>
    <div class='labs-meta'>
      <span class='ring'>${i.labs.meta.ring}</span>
      <div class='meta-text'>
        <b>${i.labs.meta.bold}</b>
        ${i.labs.meta.sub}
      </div>
    </div>
    <div class='labs-grid' id='labs-container'>
        ${labCards}
    </div>
    <div class='labs-foot'>
      <div class='progress'>
        ${progressHtml}
      </div>
      <span class='meta'>${i.labs.foot}</span>
    </div>
  </div>
</section>

<section class='method' id='method' data-od-id='method'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>${i.rules.method.roman}</span>
      <span class='meta-grp'>
        <span>${i.rules.method.meta[0]}</span>
        <span class='dot-mark'>${i.rules.method.meta[1]}</span>
        <span>${i.rules.method.meta[2]}</span>
      </span>
      <span>${i.rules.method.pagination}</span>
    </div>
    <div class='method-head'>
      <div data-reveal>
        <span class='label'>${i.method.label} <span class='ix'>${i.method.ix}</span></span>
        <h2 class='display' style='margin-top:30px;'>${mixed(i.method.headline)}</h2>
      </div>
      <div class='right' data-reveal='right'>
        <span class='plus'>+</span>
        <p>${i.method.right}</p>
      </div>
    </div>
    <div class='method-grid'>
        ${methodSteps}
    </div>
    <div class='method-foot'>
      <div class='left'>
        <span class='ring'></span>
        <span>${i.method.foot_left}</span>
      </div>
      <div class='right'><a class='method-repo-link' href='#contact'><b>${i.method.foot_right_bold}</b></a> &nbsp;·&nbsp; ${i.method.foot_right_rest}</div>
    </div>
  </div>
</section>

<section class='tight' id='work' data-od-id='work'>
  <div class='work'>
    <div class='work-rule'>
      <span class='roman'>${i.rules.work.roman}</span>
      <span style='display:inline-flex;gap:24px;'>
        <span>${i.rules.work.meta[0]}</span>
        <span style='color:var(--coral);'>${i.rules.work.meta[1]}</span>
        <span>${i.rules.work.meta[2]}</span>
      </span>
      <span>${i.rules.work.pagination}</span>
    </div>
    <div class='work-grid'>
      <div class='work-copy' data-reveal>
        <span class='label'>${i.work.label}</span>
        <h2>${mixed(i.work.headline)}</h2>
        <a class='work-link' href='#contact'>${i.work.link_label}</a>
      </div>
      ${workCards}
    </div>
    <div class='work-arrows'>
      <button class='nav-btn' aria-label='Trước'><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6'><path d='M14 6l-6 6 6 6'/></svg></button>
      <button class='nav-btn active' aria-label='Tiếp'><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6'><path d='M10 6l6 6-6 6'/></svg></button>
    </div>
  </div>
</section>

<section class='testimonial' data-od-id='testimonial'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>${i.rules.testimonial.roman}</span>
      <span class='meta-grp'>
        <span>${i.rules.testimonial.meta[0]}</span>
        <span class='dot-mark'>${i.rules.testimonial.meta[1]}</span>
        <span>${i.rules.testimonial.meta[2]}</span>
      </span>
      <span>${i.rules.testimonial.pagination}</span>
    </div>
    <div class='testimonial-grid'>
      <div class='testimonial-copy' data-reveal>
        <span class='label'>${i.testimonial.label} <span class='ix'>${i.testimonial.ix}</span></span>
        <h2 style='margin-top:30px;'>&ldquo;${mixed(i.testimonial.quote)}&rdquo;</h2>
        <div class='author'>
          <span class='avatar'>${i.testimonial.author.initial}</span>
          <p>${i.testimonial.author.name}<br/><span>${i.testimonial.author.title}</span></p>
        </div>
        <div class='divider'></div>
        <p class='partners-text'>${i.testimonial.partners_text}</p>
        <div class='partners'>
          ${partnersHtml}
        </div>
        <a class='read-more' href='#contact'>${i.testimonial.read_more_label}</a>
      </div>
      <div class='testimonial-art' data-reveal='right'>
        <picture>
          <source srcset='${assets}testimonial.svg' type='image/svg+xml'>
          <img src='${assets}testimonial.png' alt='Phụ huynh chia sẻ' />
        </picture>
      </div>
    </div>
  </div>
</section>

<section class='cta' id='contact' data-od-id='cta'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>${i.rules.cta.roman}</span>
      <span class='meta-grp'>
        <span>${i.rules.cta.meta[0]}</span>
        <span class='dot-mark'>${i.rules.cta.meta[1]}</span>
        <span>${i.rules.cta.meta[2]}</span>
      </span>
      <span>${i.rules.cta.pagination}</span>
    </div>
    <div class='cta-grid'>
      <div data-reveal>
        <span class='label'>${i.cta.label} <span class='ix'>${i.cta.ix}</span></span>
        <h2 class='display'>${mixed(i.cta.headline)}</h2>
        <p class='lead'>${i.cta.lead}</p>
        
        <!-- Interactive Consultation Booking Form -->
        <div class='booking-box' id='booking-form'>
          <h4 style='font-family:var(--sans);font-size:16px;font-weight:700;color:var(--ink);'>Đăng ký tìm gia sư &amp; nhận 02 buổi học thử 0 đồng</h4>
          <form id='tutor-booking-form' onsubmit='handleBookingSubmit(event)'>
            <div class='booking-grid'>
              <div class='form-field'>
                <label>Lớp của học sinh</label>
                <select id='form-grade' required>
                  <option value='grade12' selected>Lớp 12 &amp; Luyện thi THPTQG</option>
                  <option value='grade11'>Lớp 11 (Chuyên đề nâng cao)</option>
                  <option value='grade10'>Lớp 10 (Chương trình mới)</option>
                  <option value='grade9'>Lớp 9 (Luyện thi vào 10 Chuyên)</option>
                  <option value='secondary'>Cấp 2 (Lớp 6 đến Lớp 8)</option>
                  <option value='dgnl'>Luyện thi ĐGNL / ĐGTD</option>
                </select>
              </div>
              <div class='form-field'>
                <label>Môn học cần gia sư</label>
                <select id='form-subject' required>
                  <option value='toan' selected>Toán học (Đại số &amp; Giải tích)</option>
                  <option value='ly'>Vật lý</option>
                  <option value='hoa'>Hóa học</option>
                  <option value='anh'>Tiếng Anh / Luyện thi IELTS</option>
                  <option value='van'>Ngữ Văn</option>
                  <option value='khtn'>Tổ hợp KHTN (Toán - Lý - Hóa)</option>
                  <option value='chuyen'>Môn Chuyên</option>
                </select>
              </div>
              <div class='form-field'>
                <label>Mục tiêu điểm số</label>
                <select id='form-target'>
                  <option value='10'>Chinh phục điểm 9+ đến 10 tuyệt đối</option>
                  <option value='chuyen'>Đỗ trường Chuyên / ĐH Top 1</option>
                  <option value='goc'>Bứt phá lấy lại căn bản cấp tốc</option>
                  <option value='ielts'>IELTS 7.5 - 8.5+</option>
                </select>
              </div>
              <div class='form-field'>
                <label>Hình thức học</label>
                <select id='form-mode'>
                  <option value='home'>Gia sư trực tiếp tại nhà</option>
                  <option value='online'>Học trực tuyến 1-1 tương tác cao</option>
                </select>
              </div>
              <div class='form-field' style='grid-column: 1 / -1;'>
                <label>Số điện thoại phụ huynh</label>
                <input type='tel' id='form-phone' placeholder='e.g. 0988 10 10 10' required />
              </div>
              <button type='submit' class='booking-submit-btn'>NHẬN 02 BUỔI HỌC THỬ MIỄN PHÍ NGAY &rarr;</button>
            </div>
          </form>
          <div id='toast-alert' class='toast-msg' role='alert'></div>
          <p style='font-family:var(--sans);font-size:12px;color:var(--ink-mute);margin-top:12px;'>* Hoàn toàn không mất phí. Ghép gia sư thủ khoa chuẩn phong cách trong 2 giờ.</p>
        </div>
      </div>
      
      <div class='art' data-reveal='scale'>
        <div class='plate'>
          <picture>
            <source srcset='${assets}cta.svg' type='image/svg+xml'>
            <img src='${assets}cta.png' alt='Đăng Ký Tư Vấn' />
          </picture>
        </div>
      </div>
    </div>
  </div>
</section>

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
    <div class='foot-bottom'>
      <span><span class='pulse'></span>● <b style='color:var(--ink);'>${i.brand.name}</b> · ${i.brand.license} · ${i.brand.year} / ${i.brand.edition}</span>
      <span class='right'>
        <span>${i.brand.location}</span>
        <span>${i.brand.coordinates}</span>
        <span style='color:var(--coral);'>♥ ${i.brand.year_roman}</span>
      </span>
    </div>
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
    if (!elements.length) return;
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
      if (y <= SHOW_TOP) {
        nav.classList.remove('is-hidden');
      } else if (d > DELTA) {
        nav.classList.add('is-hidden');
      } else if (d < -DELTA) {
        nav.classList.remove('is-hidden');
      }
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  })();

  /*
   * Interactive Asset Switcher (Three.js 3D / Pixel Art / Bản In)
   */
  (function () {
    var buttons = document.querySelectorAll('.mode-btn');
    var layer3d = document.getElementById('layer-3d');
    var layerPixel = document.getElementById('layer-pixel');
    var layerPlate = document.getElementById('layer-plate');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var mode = btn.dataset.mode;
        if (layer3d) layer3d.style.display = (mode === '3d') ? 'block' : 'none';
        if (layerPixel) layerPixel.style.display = (mode === 'pixel') ? 'block' : 'none';
        if (layerPlate) layerPlate.style.display = (mode === 'plate') ? 'block' : 'none';
      });
    });
  })();

  /*
   * Three.js Interactive 3D Academic Polyhedron
   */
  (function initThreeScene() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js not loaded, falling back to plate layer.');
      var layerPlate = document.getElementById('layer-plate');
      var layer3d = document.getElementById('layer-3d');
      if (layer3d && layerPlate) {
        layer3d.style.display = 'none';
        layerPlate.style.display = 'block';
      }
      return;
    }

    var canvas = document.getElementById('three-canvas');
    if (!canvas) return;

    var container = canvas.parentElement;
    var width = container.clientWidth || 480;
    var height = container.clientHeight || 480;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 4.2;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      if (!renderer.getContext()) throw new Error("No WebGL context");
    } catch (e) {
      console.warn("WebGL not available, falling back to plate layer:", e);
      var layerPlate = document.getElementById("layer-plate");
      var layer3d = document.getElementById("layer-3d");
      var buttons = document.querySelectorAll(".mode-btn");
      if (layer3d && layerPlate) {
        layer3d.style.display = "none";
        layerPlate.style.display = "block";
        buttons.forEach(function (b) {
          if (b.dataset.mode === "plate") b.classList.add("active");
          else b.classList.remove("active");
        });
      }
      return;
    }
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
        var mx = (e.clientX - rect.left) / rect.width - 0.5;
        var my = (e.clientY - rect.top) / rect.height - 0.5;
        targetRotY = mx * 0.6;
        targetRotX = my * 0.6;
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
      }
    }, { passive: true });

    canvas.addEventListener('touchend', function () { isDragging = false; });

    // Render loop
    function animate() {
      requestAnimationFrame(animate);

      // Smooth inertia
      icosaMesh.rotation.y += (targetRotY - icosaMesh.rotation.y) * 0.05 + 0.003;
      icosaMesh.rotation.x += (targetRotX - icosaMesh.rotation.x) * 0.05 + 0.002;

      coreMesh.rotation.y -= 0.004;
      coreMesh.rotation.z += 0.003;

      ringGroup.rotation.y += 0.005;
      ringGroup.rotation.x += 0.002;

      particleSystem.rotation.y += 0.001;

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', function () {
      var w = container.clientWidth || 480;
      var h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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

    function drawPixelScene() {
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
      ctx.fillText('E = mc^2 + ChamChi', 60, 145);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Thu Khoa A00: 29.85', 60, 175);

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

      frame++;
      requestAnimationFrame(drawPixelScene);
    }
    drawPixelScene();
  })();

  /*
   * Labs Subject Interactive Filtering
   */
  (function initLabsFilter() {
    var pills = document.querySelectorAll('.labs-head .pill');
    var cards = document.querySelectorAll('#labs-container .lab');

    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        var filter = pill.dataset.filter || 'all';

        cards.forEach(function (card) {
          var cat = card.dataset.category;
          if (filter === 'all' || filter === cat) {
            card.classList.remove('hidden-card');
          } else {
            card.classList.add('hidden-card');
          }
        });
      });
    });
  })();

  /*
   * Consultation Booking Form Handler
   */
  function handleBookingSubmit(event) {
    event.preventDefault();
    var phone = document.getElementById('form-phone').value;
    var grade = document.getElementById('form-grade').value;
    var subject = document.getElementById('form-subject').value;
    var toast = document.getElementById('toast-alert');
    if (!phone) return;

    if (toast) {
      toast.style.display = 'block';
      toast.textContent = '✓ Tiếp nhận thành công! Chuyên viên học thuật sẽ liên hệ SĐT ' + phone + ' trong 15 phút để tư vấn ghép gia sư môn ' + subject.toUpperCase() + '.';
    }
  }
</script>
</body>
</html>`;
}

const html = renderPage(inputs, baseCss);
fs.writeFileSync('index.html', html, 'utf8');
console.log(`✓ Successfully compiled index.html (${(html.length / 1024).toFixed(1)} KB)`);
