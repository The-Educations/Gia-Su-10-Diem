import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const dir = "assets/landing";
await mkdir(dir, { recursive: true });
const svg = (body, viewBox = "0 0 600 600") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`;
const paper = "#fffaf0",
  ink = "#852f36",
  muted = "#cabfae";
const lines = Array.from(
  { length: 10 },
  (_, i) => `<path d="M94 ${220 + i * 25}H480" stroke="#d7d2c5"/>`,
).join("");
const notebook = svg(
  `<path d="M60 60H493L520 87V540H60Z" fill="#c8bdab"/><path d="M66 52H492L508 72V530H66Z" fill="#e7decc"/><path d="M70 46H488V520H70Z" fill="${paper}"/><path d="M119 46V520" stroke="#c8918f"/>${lines}<path d="M143 127H322M143 153H250" stroke="${ink}" stroke-width="9"/><path d="M164 367V252M164 367H386" stroke="#807969" stroke-width="2"/><path d="M180 348Q227 340 258 311T359 264" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><circle cx="258" cy="311" r="7" fill="${ink}"/><path d="M349 262L365 262L360 279" stroke="${ink}" stroke-width="4"/>${Array.from({ length: 13 }, (_, i) => `<ellipse cx="77" cy="${75 + i * 32}" rx="14" ry="5" stroke="#8d8370" stroke-width="4"/><circle cx="91" cy="${75 + i * 32}" r="3" fill="#685e4c"/>`).join("")}<g transform="translate(362 105) rotate(8)"><ellipse cx="33" cy="22" rx="44" ry="35" stroke="${ink}" stroke-width="3"/><path d="M12 10L22 2V40M40 4C20 4 22 40 40 40C58 40 58 4 40 4Z" stroke="${ink}" stroke-width="4" stroke-linecap="round"/></g>`,
);
const book = svg(
  `<path d="M125 123L415 63L482 390L197 458Z" fill="#572029"/><path d="M127 112L416 55L480 375L192 438Z" fill="${paper}"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M195 ${414 + i * 4}L472 ${354 + i * 4}" stroke="${muted}"/>`).join("")}<path d="M112 90L414 30L479 351L176 414Z" fill="${ink}"/><path d="M137 85L201 409" stroke="#a85759" stroke-width="3"/><path d="M184 139L376 101M191 157L330 130" stroke="#d8b8a0" stroke-width="3"/><path d="M227 310L270 180L357 286Z" stroke="#f3dfbb" stroke-width="3"/><path d="M227 310L319 240M270 180L290 298" stroke="#c78a7a" stroke-width="2"/><circle cx="277" cy="265" r="58" stroke="#f3dfbb" stroke-width="2"/><path d="M339 381L350 436L365 416L386 425L374 374" fill="#c39652"/>`,
);
const pencil = svg(
  `<g transform="rotate(24 300 300)"><path d="M278 88H322V460L300 518L278 460Z" fill="#d8b57b"/><path d="M278 110H322V453H278Z" fill="${ink}"/><path d="M289 110H307V453H289Z" fill="#ac555b"/><path d="M278 78Q300 62 322 78V112H278Z" fill="#c7b5a5"/><path d="M278 106H322M278 91H322" stroke="#8e7c6e" stroke-width="3"/><path d="M292 497L300 518L308 497Z" fill="#342b28"/></g>`,
);
const orbit = svg(
  `<circle cx="300" cy="300" r="208" stroke="${ink}" stroke-width="2"/><ellipse cx="300" cy="300" rx="90" ry="208" stroke="${ink}" stroke-width="2"/><ellipse cx="300" cy="300" rx="208" ry="70" stroke="${ink}" stroke-width="2" transform="rotate(-28 300 300)"/><path d="M92 300H508M300 92V508" stroke="#bba491" stroke-width="1.5"/><circle cx="300" cy="300" r="58" fill="${ink}"/><circle cx="172" cy="137" r="15" fill="#bb8c4d"/><circle cx="469" cy="421" r="11" fill="${ink}"/>`,
);
const desk = svg(
  `<path d="M35 340L326 200L567 329L272 487Z" fill="#d9c8ac"/><path d="M35 340V362L272 511V487Z" fill="#b9a58b"/><path d="M272 487L567 329V352L272 511Z" fill="#c5b095"/><path d="M86 391V541L113 555V406M493 395V520L518 507V381" fill="#a3876e"/><path d="M217 300L338 243L421 288L302 350Z" fill="${paper}"/><path d="M302 350L305 319L263 295L217 300Z" fill="#eee1c9"/><path d="M305 319L338 243M319 304L375 278M325 313L390 283" stroke="#baa68e" stroke-width="2"/><path d="M157 271V155Q157 118 199 117" stroke="${ink}" stroke-width="13"/><path d="M159 286L194 268L170 254L137 273Z" fill="${ink}"/><path d="M181 101L218 103L243 147L167 147Z" fill="${ink}"/><path d="M432 311L472 292L446 278L408 296Z" fill="${ink}"/><path d="M420 295V245L458 245V281Z" fill="#b97a72"/><ellipse cx="439" cy="245" rx="19" ry="8" fill="#e7b6a4"/><path d="M439 247V205M447 249L455 210M428 246L421 215" stroke="#624039" stroke-width="5"/>`,
);
for (const [name, body] of Object.entries({
  notebook,
  book,
  pencil,
  orbit,
  desk,
}))
  await writeFile(`${dir}/${name}.svg`, body);
// A path-only monogram stays identical even without installed fonts.
const icon = svg(
  `<rect width="64" height="64" rx="16" fill="${ink}"/><path d="M13 24L23 17V47M40 17C25 17 25 47 40 47C55 47 55 17 40 17Z" stroke="${paper}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  "0 0 64 64",
);
await writeFile("assets/favicon.svg", icon);
await writeFile("assets/icon-v2.svg", icon);
await sharp(Buffer.from(icon))
  .resize(180)
  .png()
  .toFile("assets/apple-touch-icon.png");
const png = await sharp(Buffer.from(icon)).resize(32).png().toBuffer();
await writeFile("assets/favicon-32.png", png);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile("assets/favicon.ico", Buffer.concat([header, png]));
console.log(
  "Created five original education vectors and SVG/PNG/ICO brand icons.",
);
