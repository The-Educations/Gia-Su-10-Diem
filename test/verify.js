import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

console.log('--- Running Automated Verification Suite for 10 Points Tutor Academy ---');

// 1. Verify index.html exists
assert.ok(fs.existsSync('index.html'), 'index.html must exist');
const html = fs.readFileSync('index.html', 'utf8');
assert.ok(html.length > 50000, `index.html should be substantial (>50KB), got ${(html.length/1024).toFixed(1)} KB`);
console.log('✓ index.html exists and is properly sized.');

// 2. Verify all 16 assets exist in both .png and .svg format
const requiredAssets = [
  'hero', 'about', 'capabilities', 'cta', 'testimonial',
  'method-1', 'method-2', 'method-3', 'method-4',
  'lab-1', 'lab-2', 'lab-3', 'lab-4', 'lab-5',
  'work-1', 'work-2'
];

for (const id of requiredAssets) {
  const pngPath = path.join('assets', `${id}.png`);
  const svgPath = path.join('assets', `${id}.svg`);
  assert.ok(fs.existsSync(pngPath), `Missing ${pngPath}`);
  assert.ok(fs.existsSync(svgPath), `Missing ${svgPath}`);
  assert.ok(fs.statSync(pngPath).size > 1000, `${pngPath} is too small`);
  assert.ok(fs.statSync(svgPath).size > 500, `${svgPath} is too small`);

  // Verify binary PNG header (89 50 4E 47 0D 0A 1A 0A)
  const pngBuffer = fs.readFileSync(pngPath);
  const isPng = pngBuffer[0] === 0x89 &&
                pngBuffer[1] === 0x50 &&
                pngBuffer[2] === 0x4E &&
                pngBuffer[3] === 0x47 &&
                pngBuffer[4] === 0x0D &&
                pngBuffer[5] === 0x0A &&
                pngBuffer[6] === 0x1A &&
                pngBuffer[7] === 0x0A;
  assert.ok(isPng, `${pngPath} is not a valid binary PNG file`);
}
console.log(`✓ All 16 assets verified in assets/ (.png valid binary and .svg vector).`);

// 3. Verify XML well-formedness of all 16 SVG files
execSync("python3 -c '\
import xml.etree.ElementTree as ET\n\
import glob\n\
for f in sorted(glob.glob(\"assets/*.svg\")):\n\
    ET.parse(f)\n\
'", { stdio: 'inherit' });
console.log('✓ All 16 SVG files parsed cleanly as valid XML with zero errors.');

// 4. Verify manifest
assert.ok(fs.existsSync('assets/image-manifest.json'), 'image-manifest.json must exist');
const manifest = JSON.parse(fs.readFileSync('assets/image-manifest.json', 'utf8'));
assert.strictEqual(manifest.slots.length, 16, 'Manifest must have 16 slots');
console.log('✓ image-manifest.json is valid with 16 slots.');

// 5. Verify all 8 Roman sections are present in index.html
const romanNumerals = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.', 'VIII.'];
for (const roman of romanNumerals) {
  assert.ok(html.includes(`<span class='roman'>${roman}</span>`), `Missing section ${roman}`);
}
console.log('✓ All 8 Roman sections (I. to VIII.) present.');

// 6. Verify Three.js and Pixel Art integration
assert.ok(html.includes('three.min.js'), 'Three.js CDN script must be linked');
assert.ok(html.includes('id=\'three-canvas\''), 'three-canvas must exist');
assert.ok(html.includes('id=\'pixel-canvas\''), 'pixel-canvas must exist');
assert.ok(html.includes('asset-mode-switcher'), 'asset-mode-switcher must exist');
assert.ok(html.includes('GIA SU 10 DIEM'), 'Pixel Art chalkboard text must exist');
console.log('✓ Three.js and Pixel Art interactive layers verified.');

// 7. Verify Booking Form & interactive filter
assert.ok(html.includes('id=\'tutor-booking-form\''), 'Booking form must exist');
assert.ok(html.includes('id=\'form-phone\''), 'Phone input must exist');
assert.ok(html.includes('id=\'form-grade\''), 'Grade dropdown must exist');
assert.ok(html.includes('id=\'form-subject\''), 'Subject dropdown must exist');
assert.ok(html.includes('data-filter'), 'Interactive filter pills must exist in labs');
console.log('✓ Consultation booking form and subject filter verified.');

// 8. Verify English brand copy and academic credentials
const vietnameseKeywords = [
  "Gia Sư 10 Điểm",
  "Thủ Khoa",
  "Ngoại Thương",
  "Bách Khoa",
  "Y Hà Nội",
  "Sư Phạm",
  "tư duy bản chất",
  "buổi học thử"
];
for (const kw of vietnameseKeywords) {
  assert.ok(html.includes(kw), `Missing expected Vietnamese keyword: ${kw}`);
}
console.log("✓ Vietnamese academic credentials and brand copy verified.");

console.log('\n--- ALL VERIFICATION CHECKS PASSED WITH ZERO ERRORS ---');
