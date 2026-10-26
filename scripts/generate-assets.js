import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ASSETS_DIR = path.resolve('assets');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

const RAW_DIR = '/tmp/real_assets';

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const plates = [
  {
    id: 'hero',
    file: 'hero.png',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    tag: 'BẢN IN Nº 01 · TỔNG QUAN',
    title: 'Thầy Trò Đồng Hành · Chinh Phục Điểm 10 Tuyệt Đối',
    subtitle: 'HÀ NỘI · TP.HCM · ĐÀ NẴNG · MMXXVI'
  },
  {
    id: 'about',
    file: 'about.png',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    tag: 'BẢN IN Nº 02 · TUYÊN NGÔN',
    title: 'Không Gian Học Thuật & Tư Duy Bản Chất Vững Vàng',
    subtitle: 'TRIẾT LÝ GIẢNG DẠY · GIA SƯ 10 ĐIỂM'
  },
  {
    id: 'capabilities',
    file: 'capabilities.png',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    tag: 'BẢN IN Nº 03 · TIÊU CHUẨN',
    title: 'Quy Trình Sàng Lọc Gia Sư 4 Vòng Khắt Khe',
    subtitle: 'CHỈ 8.5% ỨNG VIÊN ĐƯỢC CẤP CHỨNG CHỈ'
  },
  {
    id: 'lab-1',
    file: 'lab-1.png',
    width: 1024,
    height: 680,
    ratio: '3:2',
    tag: 'MÔN HỌC Nº 01 · TOÁN HỌC',
    title: 'Toán Học Nâng Cao & Tư Duy Bản Chất Logic',
    subtitle: 'ĐẠI SỐ · HÌNH HỌC KHÔNG GIAN · GIẢI TÍCH'
  },
  {
    id: 'lab-2',
    file: 'lab-2.png',
    width: 1024,
    height: 680,
    ratio: '3:2',
    tag: 'MÔN HỌC Nº 02 · KHOA HỌC TỰ NHIÊN',
    title: 'Phòng Thí Nghiệm Vật Lý & Hóa Học Trực Quan',
    subtitle: 'CƠ HỌC · ĐIỆN TỪ · HÓA HỮU CƠ VÀ VÔ CƠ'
  },
  {
    id: 'lab-3',
    file: 'lab-3.png',
    width: 1024,
    height: 680,
    ratio: '3:2',
    tag: 'MÔN HỌC Nº 03 · NGOẠI NGỮ',
    title: 'Tiếng Anh Học Thuật & Chiến Lược IELTS 8.5+',
    subtitle: 'SAT SUITE · VIẾT LUẬN & TƯ DUY PHẢN BIỆN'
  },
  {
    id: 'lab-4',
    file: 'lab-4.png',
    width: 1024,
    height: 680,
    ratio: '3:2',
    tag: 'MÔN HỌC Nº 04 · NGỮ VĂN',
    title: 'Ngữ Văn Chuyên Sâu & Nghị Luận Xã Hội Sắc Bén',
    subtitle: 'CẢM THỤ VĂN HỌC · KỸ NĂNG NGHỊ LUẬN VĂN HỌC'
  },
  {
    id: 'lab-5',
    file: 'lab-5.png',
    width: 1024,
    height: 680,
    ratio: '3:2',
    tag: 'MÔN HỌC Nº 05 · LUYỆN THI',
    title: 'Luyện Thi Vào 10 Chuyên & Kỳ Thi THPT Quốc Gia',
    subtitle: 'THI THỬ ÁP LỰC CAO · PHÂN LOẠI 9+ VÀ 10 ĐIỂM'
  },
  {
    id: 'method-1',
    file: 'method-1.png',
    width: 800,
    height: 480,
    ratio: '5:3',
    tag: 'GIAI ĐOẠN 01 · CHẨN ĐOÁN',
    title: 'Chẩn Đoán Toàn Diện Lỗ Hổng Kiến Thức 90 Phút',
    subtitle: 'MAPPING NGUYÊN NHÂN MẤT ĐIỂM'
  },
  {
    id: 'method-2',
    file: 'method-2.png',
    width: 800,
    height: 480,
    ratio: '5:3',
    tag: 'GIAI ĐOẠN 02 · GHÉP GIA SƯ',
    title: 'Ghép Đôi Gia Sư Thủ Khoa Phù Hợp Trong 2 Giờ',
    subtitle: 'TƯƠNG THÍCH TÍNH CÁCH VÀ MỤC TIÊU'
  },
  {
    id: 'method-3',
    file: 'method-3.png',
    width: 800,
    height: 480,
    ratio: '5:3',
    tag: 'GIAI ĐOẠN 03 · DẠY 1 KÈM 1',
    title: 'Lộ Trình "May Đo" Cá Nhân Hóa Từng Tuần',
    subtitle: 'LUYỆN TẬP TẬP TRUNG · PHẢN HỒI LIÊN TỤC'
  },
  {
    id: 'method-4',
    file: 'method-4.png',
    width: 800,
    height: 480,
    ratio: '5:3',
    tag: 'GIAI ĐOẠN 04 · ĐẠT ĐIỂM 10',
    title: 'Chinh Phục Điểm 10 Tuyệt Đối Trong Kỳ Thi Thật',
    subtitle: 'TỰ CHỦ HỌC TẬP SUỐT ĐỜI'
  },
  {
    id: 'work-1',
    file: 'work-1.png',
    width: 1024,
    height: 680,
    ratio: '3:2',
    tag: 'BẢNG VÀNG 01 · THỦ KHOA',
    title: 'Học Viên Thủ Khoa Khối A00 Toàn Quốc: 29.85/30',
    subtitle: 'TOÁN 10.0 · LÝ 9.85 · HÓA 10.0'
  },
  {
    id: 'work-2',
    file: 'work-2.png',
    width: 1024,
    height: 680,
    ratio: '3:2',
    tag: 'BẢNG VÀNG 02 · TIẾN BỘ',
    title: 'Bứt Phá Điểm Số Ngoạn Mục Từ 5.5 Lên 9.2 Điểm',
    subtitle: 'ĐỖ NGUYỆN VỌNG 1 ĐẠI HỌC BÁCH KHOA'
  },
  {
    id: 'testimonial',
    file: 'testimonial.png',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    tag: 'BẢN IN Nº 07 · PHỤ HUYNH',
    title: 'Niềm Tin & Trách Nhiệm Với Hơn 3.500 Gia Đình',
    subtitle: '96.8% HỌC VIÊN TĂNG TỐI THIỂU 2 ĐIỂM SAU 8 TUẦN'
  },
  {
    id: 'cta',
    file: 'cta.png',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    tag: 'BẢN IN Nº 08 · HỌC THỬ',
    title: 'Cánh Cửa Đại Học Mơ Ước Đang Chờ Đón Bạn',
    subtitle: 'TẶNG 02 BUỔI HỌC THỬ MIỄN PHÍ HOÀN TOÀN'
  }
];

function buildPlateSvg(p, b64) {
  const w = p.width;
  const h = p.height;
  const margin = Math.round(Math.min(w, h) * 0.04);
  const imgW = w - margin * 2;
  const imgH = h - margin * 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <!-- Atelier Zero warm paper duotone filter for editorial harmony -->
    <filter id="editorial-warmth" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="
        0.95 0 0 0 0.05
        0 0.90 0 0 0.04
        0 0 0.80 0 0.03
        0 0 0 1 0" />
    </filter>
    <clipPath id="clip-${p.id}">
      <rect width="${imgW}" height="${imgH}" rx="4" />
    </clipPath>
  </defs>

  <!-- Warm Paper Background -->
  <rect width="${w}" height="${h}" fill="#efe7d2" />

  <!-- Real Curated Photograph -->
  <g transform="translate(${margin}, ${margin})">
    <image href="data:image/jpeg;base64,${b64}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${p.id})" opacity="0.94" filter="url(#editorial-warmth)" />
    <!-- Fine inner border -->
    <rect width="${imgW}" height="${imgH}" fill="none" stroke="rgba(21, 20, 15, 0.28)" stroke-width="1.5" />
  </g>

  <!-- Precision Corner Crossbars -->
  <path d="M${margin} ${margin + 20} L${margin} ${margin} L${margin + 20} ${margin}" stroke="#15140f" stroke-width="2" fill="none" />
  <path d="M${w - margin - 20} ${margin} L${w - margin} ${margin} L${w - margin} ${margin + 20}" stroke="#15140f" stroke-width="2" fill="none" />
  <path d="M${margin} ${h - margin - 20} L${margin} ${h - margin} L${margin + 20} ${h - margin}" stroke="#15140f" stroke-width="2" fill="none" />
  <path d="M${w - margin - 20} ${h - margin} L${w - margin} ${h - margin} L${w - margin} ${h - margin - 20}" stroke="#15140f" stroke-width="2" fill="none" />

  <!-- Top Badge Label -->
  <rect x="${margin + 16}" y="${margin + 14}" width="280" height="26" fill="#efe7d2" rx="3" fill-opacity="0.94" stroke="rgba(21,20,15,0.15)" stroke-width="1" />
  <text x="${margin + 26}" y="${margin + 31}" font-family="'Be Vietnam Pro', system-ui, sans-serif" font-size="11" font-weight="700" letter-spacing="1.5" fill="#ed6f5c">${escapeXml(p.tag)}</text>

  <!-- Bottom Title Strip with Vietnamese Typography -->
  <rect x="${margin + 16}" y="${h - margin - 44}" width="${w - margin * 2 - 32}" height="36" fill="#efe7d2" rx="3" fill-opacity="0.94" stroke="rgba(21,20,15,0.18)" stroke-width="1" />
  <text x="${margin + 28}" y="${h - margin - 21}" font-family="'Lora', serif" font-style="italic" font-weight="600" font-size="14.5" fill="#15140f">${escapeXml(p.title)}</text>
  <text x="${w - margin - 28}" y="${h - margin - 22}" text-anchor="end" font-family="'Be Vietnam Pro', system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.5" fill="#8b8676">${escapeXml(p.subtitle)}</text>
</svg>`;
}

// Generate Image Manifest
const manifest = {
  $schema: 'https://open-design.dev/schemas/image-manifest.v1.json',
  skill: 'open-design-landing',
  design_system: 'atelier-zero',
  brand: 'Gia Sư 10 Điểm',
  slots: plates.map(a => ({
    id: a.id,
    file: a.file,
    width: a.width,
    height: a.height,
    ratio: a.ratio,
    prompt_section: a.title,
    required: true,
    rekey_on_brand_change: true
  }))
};
fs.writeFileSync(path.join(ASSETS_DIR, 'image-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

for (const p of plates) {
  const rawPath = path.join(RAW_DIR, `${p.id}.jpg`);
  if (!fs.existsSync(rawPath)) {
    throw new Error(`Missing raw image at ${rawPath}`);
  }
  const b64 = fs.readFileSync(rawPath).toString('base64');
  const svg = buildPlateSvg(p, b64);
  const svgPath = path.join(ASSETS_DIR, `${p.id}.svg`);
  const pngPath = path.join(ASSETS_DIR, p.file);

  fs.writeFileSync(svgPath, svg, 'utf8');
  execSync(`rsvg-convert "${svgPath}" -o "${pngPath}"`);
}

console.log(`✓ Successfully compiled all ${plates.length} real photo editorial plates into ${ASSETS_DIR}`);
