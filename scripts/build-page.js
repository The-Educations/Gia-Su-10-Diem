import fs from "node:fs";
const i = JSON.parse(fs.readFileSync("inputs.json", "utf8"));
const css = fs.readFileSync("styles.css", "utf8");
const script = fs.readFileSync("scripts/site.js", "utf8");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const arrow = `<svg aria-hidden='true' viewBox='0 0 24 24' fill='none'><path d='M5 19L19 5M5 5h14v14' stroke='currentColor' stroke-width='1.5'/></svg>`;
const brand = `<img src='/assets/icon-v2.svg' width='40' height='40' alt=''><span>${escape(i.brand.name)}</span>`;
const art = (name, cls = "", speed = "0.1") =>
  `<img class='${cls}' src='/assets/landing/${name}.svg' width='600' height='600' alt='' aria-hidden='true' data-parallax='${speed}'>`;
const nav = [
  { label: "Môn học", href: "#labs" },
  { label: "Cách kết nối", href: "#journey" },
  { label: "Dành cho gia sư", href: "#tutors" },
];
const navLinks = nav.map((n) => `<a href='${n.href}'>${n.label}</a>`).join("");
const subjects = {
  toan: "toan",
  khtn: "khtn",
  anh: "tieng-anh",
  van: "ngu-van",
  chuyen: "",
};
const tutorLink = (subject) =>
  subject === "chuyen"
    ? "/app/tutors?goal=" + encodeURIComponent("Thi chuyên · HSG")
    : "/app/tutors?subject=" + subjects[subject];
const subjectArt = ["orbit", "desk", "book", "notebook", "pencil"];
const html = `<!DOCTYPE html>
<html lang='vi'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<meta name='theme-color' content='#852f36'>
<title>${escape(i.brand.name)} — Tìm gia sư, học theo cách của em</title>
<meta name='description' content='${escape(i.brand.description)}'>
<link rel='icon' href='/assets/brand-icon-20261031.ico' sizes='any'>
<link rel='icon' href='/assets/brand-icon-20261031.svg' type='image/svg+xml'>
<link rel='icon' href='/assets/brand-icon-20261031.png' type='image/png' sizes='32x32'>
<link rel='apple-touch-icon' href='/assets/brand-touch-20261031.png' sizes='180x180'>
<link rel='preconnect' href='https://fonts.googleapis.com'>
<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>
<link href='https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;1,400;1,500&display=swap' rel='stylesheet'>
<style>${css}</style>
</head>
<body>
<a class='skip-link' href='#main'>Bỏ qua điều hướng</a>
<header class='nav'>
  <div class='container nav-inner'>
    <a href='/' class='brand' aria-label='Gia Sư 10 Điểm — Trang chủ'>${brand}</a>
    <nav class='nav-links' aria-label='Điều hướng chính'>${navLinks}</nav>
    <a class='nav-login' href='/app/auth'>Đăng nhập ${arrow}</a>
    <button class='mobile-menu-toggle' type='button' aria-expanded='false' aria-controls='mobile-nav'><span class='sr-only'>Mở menu</span><span aria-hidden='true'>Menu <span class='menu-symbol'>+</span></span></button>
  </div>
  <nav id='mobile-nav' class='mobile-nav' aria-label='Điều hướng di động' hidden><div class='container'>${navLinks}<a href='/app/auth'>Đăng nhập</a><a href='/app/tutors'>Tìm gia sư ${arrow}</a></div></nav>
</header>
<div class='shell'>
<main id='main' tabindex='-1'>
<section class='hero' id='top' aria-labelledby='hero-title' data-od-id='hero'>
  <div class='hero-paper'>
    <div class='hero-margin' aria-hidden='true'></div>
    <div class='hero-heading'>
      <h1 id='hero-title' data-reveal>Học theo cách em.<br><em>Tiến bộ mỗi ngày.</em></h1>
      <p class='lead' data-reveal>Tìm một người dạy hiểu em.<br> Cùng gỡ từng điều chưa hiểu, vững từng bước đi.</p>
      <a class='button primary' href='/app/tutors' data-reveal>Tìm gia sư của em ${arrow}</a>
      <a class='hero-secondary' href='#labs'>Bắt đầu từ môn học <span aria-hidden='true'>↓</span></a>
    </div>
    <div class='hero-objects' aria-hidden='true'>
      ${art("book", "hero-book", "-0.17")}
      ${art("notebook", "hero-notebook", "0.16")}
      ${art("pencil", "hero-pencil", "-0.24")}
      <span class='teacher-mark' data-parallax='0.12'>10</span>
    </div>
  </div>
</section>
<section class='intro section-space' aria-labelledby='intro-title' data-od-id='about'>
  <div class='container intro-grid'>
    <h2 id='intro-title' data-reveal>Không chỉ tìm gia sư.<br><em>Tìm cách hiểu nhau.</em></h2>
    <div data-reveal><p class='lead'>Có người cần học chậm lại. Có người muốn đi xa hơn. Một người đồng hành phù hợp sẽ bắt đầu từ chính điều em cần.</p><a class='text-link' href='/app/tutors'>Gặp người đồng hành ${arrow}</a></div>
  </div>
  <div class='subject-ribbon' aria-hidden='true'><div data-parallax-x='0.13'>Toán học <em>·</em> Ngôn ngữ <em>·</em> Khoa học <em>·</em> Văn chương <em>·</em> Toán học</div></div>
</section>
<section class='subjects section-space' id='labs' aria-labelledby='labs-title' data-od-id='labs'>
  <div class='container'>
    <div class='section-head'><h2 id='labs-title' data-reveal>Hôm nay, em muốn<br><em>hiểu thêm điều gì?</em></h2><a class='text-link' href='/app/library'>Tất cả môn học & kỳ thi ${arrow}</a></div>
    <div class='course-controls'><div class='pills' aria-label='Lọc môn học'>${i.labs.pills.map((p) => `<button class='pill${p.active ? " active" : ""}' type='button' data-filter='${p.key}' aria-pressed='${!!p.active}'>${escape(p.label)}</button>`).join("")}</div><input id='course-search' type='search' placeholder='Tìm môn học' aria-label='Tìm môn học'></div>
    <p id='course-count' class='sr-only' role='status' aria-live='polite'>5 chương trình</p>
    <div class='subject-list' id='labs-container'>${i.labs.cards
      .map(
        (
          c,
          n,
        ) => `<article class='lab' data-category='${c.category}' data-reveal>
      <div class='subject-title'><h3><a href='${tutorLink(c.subject)}'>${escape(c.title)}</a></h3><p>${escape(c.body)}</p></div>
      <div class='subject-art'>${art(subjectArt[n], "", n % 2 ? "0.09" : "-0.09")}</div>
      <a class='subject-open' href='${tutorLink(c.subject)}' aria-label='Tìm gia sư ${escape(c.title)}'>${arrow}</a>
    </article>`,
      )
      .join("")}</div>
    <div id='course-empty' class='course-empty' hidden><p>Chưa tìm thấy môn học phù hợp.</p><button class='text-link' id='reset-courses' type='button'>Xem tất cả môn học ${arrow}</button></div>
  </div>
</section>
<section class='learning-journey' id='journey' aria-labelledby='journey-title' data-od-id='method'>
  <div class='container journey-stage'>
    <div class='journey-copy'>
      <h2 id='journey-title'>Từ lời chào đầu tiên.<br><em>Đến giờ học của em.</em></h2>
      <ol class='journey-steps'>
        <li><span>01</span><div><h3>Chọn người phù hợp.</h3><p>Xem chuyên môn, cách dạy, học phí và CV của gia sư.</p><a href='/app/tutors'>Khám phá hồ sơ ${arrow}</a></div></li>
        <li><span>02</span><div><h3>Cứ hỏi, trước khi học.</h3><p>Nhắn trực tiếp để trao đổi mục tiêu và những điều em còn băn khoăn.</p><a href='/app/tutors'>Tìm người để trò chuyện ${arrow}</a></div></li>
        <li><span>03</span><div><h3>Hẹn một giờ tiến bộ.</h3><p>Chọn giờ trống, gửi yêu cầu và nhận xác nhận từ gia sư.</p><a href='/app/auth?mode=register'>Tạo tài khoản ${arrow}</a></div></li>
      </ol>
    </div>
    <div class='learning-desk' aria-hidden='true'>
      <div class='desk-halo'></div>
      <img class='desk-book' src='/assets/landing/book.svg' width='600' height='600' alt=''>
      <img class='desk-notebook' src='/assets/landing/notebook.svg' width='600' height='600' alt=''>
      <img class='desk-pencil' src='/assets/landing/pencil.svg' width='600' height='600' alt=''>
      <div class='desk-note'>Cứ hỏi.<br><em>Mình cùng tìm hiểu.</em></div>
    </div>
  </div>
</section>
<section class='tutor-section section-space' id='tutors' aria-labelledby='tutor-title' data-od-id='capabilities'>
  <div class='container tutor-grid'>
    <div class='tutor-art'>${art("desk", "", "0.12")}<span class='tutor-handwriting' data-parallax='-0.1'>Một góc học.<br>Mở nhiều chân trời.</span></div>
    <div class='tutor-copy'><h2 id='tutor-title' data-reveal>Giỏi một điều.<br><em>Truyền đi nhiều điều.</em></h2><p class='lead' data-reveal>Đưa chuyên môn và cách dạy của bạn đến với những học sinh đang cần.</p>
      <ul class='tutor-features'><li data-reveal><h3>Hồ sơ mang dấu ấn của bạn</h3><p>Giới thiệu kinh nghiệm, môn nhận dạy, ảnh đại diện và CV.</p></li><li data-reveal><h3>Lịch dạy do bạn chủ động</h3><p>Mở giờ trống, nhận yêu cầu học và trao đổi ngay trong ứng dụng.</p></li></ul>
      <a class='button primary' href='/app/auth?mode=register&role=tutor'>Trở thành gia sư ${arrow}</a>
    </div>
  </div>
</section>
<section class='contact section-space' id='contact' aria-labelledby='cta-title' data-od-id='cta'>
  <div class='container contact-grid'>
    <div><h2 id='cta-title' data-reveal>Một khởi đầu nhỏ.<br><em>Một bước tiến xa.</em></h2><p class='lead' data-reveal>Chọn môn học. Tìm người đồng hành.<br>Phần tiếp theo, mình cùng viết.</p></div>
    <form class='reply-card' id='tutor-booking-form' action='/app/tutors' method='get' data-reveal>
      <h3>Giờ học của em</h3>
      <label for='form-subject'>Em muốn học môn gì?</label><select id='form-subject' name='subject'><option value=''>Tất cả môn học</option><option value='toan'>Toán</option><option value='vat-li'>Vật lí</option><option value='hoa-hoc'>Hóa học</option><option value='tieng-anh'>Tiếng Anh</option><option value='ngu-van'>Ngữ văn</option><option value='khtn'>Khoa học tự nhiên</option></select>
      <label for='form-mode'>Em muốn học ở đâu?</label><select id='form-mode' name='mode'><option value=''>Tất cả hình thức</option><option value='online'>Trực tuyến</option><option value='offline'>Trực tiếp</option></select>
      <button class='button primary' type='submit'>Tìm gia sư phù hợp ${arrow}</button>
    </form>
  </div>
  <div class='contact-orbit' aria-hidden='true'>${art("orbit", "", "-0.08")}</div>
</section>
</main>
<footer><div class='container'><div class='footer-top'><a class='brand' href='/'>${brand}</a><nav aria-label='Điều hướng cuối trang'><a href='/app/tutors'>Tìm gia sư</a><a href='/app/library'>Môn học & kỳ thi</a><a href='/app/auth'>Đăng nhập</a></nav></div><div class='footer-word' aria-hidden='true' data-parallax='0.05'>Học. <em>Hiểu.</em> Lớn lên.</div><div class='footer-bottom'><span>© ${i.brand.year} Gia Sư 10 Điểm</span><a href='#top'>Về đầu trang ↑</a></div></div></footer>
</div>
<script>${script}</script>
</body></html>`;
fs.writeFileSync("index.html", html);
console.log(
  `Built Vietnamese editorial landing (${(html.length / 1024).toFixed(1)} KB).`,
);
