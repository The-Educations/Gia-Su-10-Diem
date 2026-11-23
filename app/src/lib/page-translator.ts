import { en } from "./locales/en";

// English mode for text that is not passed through t(): rendered text,
// placeholders, accessible names, titles and messages from the server. Keys are
// the Vietnamese source; "{name}" parts match any text. Content written by
// people (names, posts, messages) sits under translate="no" and is left alone.
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const ATTRS = ["placeholder", "aria-label", "title", "alt", "aria-description"];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Pattern = { re: RegExp; names: string[]; out: string };
let patterns: Pattern[] | null = null;
function compiled() {
  if (patterns) return patterns;
  patterns = Object.entries(en)
    .filter(([k]) => /\{\w+\}/.test(k))
    // Keys with under 3 literal chars ("T{n}") cannot anchor a pattern: they
    // would swallow any word sharing their first letter ("Thứ" → "Mhứ"). Skip.
    .filter(([k]) => k.replace(/\{\w+\}/g, "").length >= 3)
    .map(([k, out]) => {
      const names: string[] = [];
      const source = k.split(/(\{\w+\})/).map((part) => {
        const m = part.match(/^\{(\w+)\}$/);
        if (!m) return escape(part);
        names.push(m[1]);
        return "(.+?)";
      }).join("");
      return { re: new RegExp(`^${source}$`, "s"), names, out };
    })
    .sort((a, b) => b.re.source.length - a.re.source.length);
  return patterns;
}

const SHORT = ["", "", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS: [RegExp, string | ((...m: string[]) => string)][] = [
  [/Thứ Hai/g, "Monday"], [/Thứ Ba/g, "Tuesday"], [/Thứ Tư/g, "Wednesday"], [/Thứ Năm/g, "Thursday"],
  [/Thứ Sáu/g, "Friday"], [/Thứ Bảy/g, "Saturday"], [/Chủ [Nn]hật/g, "Sunday"],
  [/Thứ ([2-7])/g, (_, d) => SHORT[Number(d)]], [/\bTh ([2-7])\b/g, (_, d) => SHORT[Number(d)]],
  [/[Tt]háng (\d{1,2}) năm (\d{4})/g, (_, m, y) => new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })],
];

// People's writing: only whole system sentences (e.g. a withdrawal request
// posted to support) are translated there, never words inside it.
const WRITTEN = ".community-rich, .community-body, .reading-text, [data-slot='bubble-content'], .review p, .proposal-card blockquote, .material-list p, .pitch-list p, .session-report";

export function translate(text: string, strict = false): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  // Abbreviations without accents (THCS, THPT…) only translate as whole words.
  if (!VI.test(trimmed)) {
    if (!/^[A-ZĐ]{2,6}( · [A-ZĐ]{2,6})*$/.test(trimmed)) return text;
    const parts = trimmed.split(" · ").map((p) => en[p] ?? p);
    return text.replace(trimmed, parts.join(" · "));
  }
  const lead = text.slice(0, text.indexOf(trimmed)), tail = text.slice(text.indexOf(trimmed) + trimmed.length);
  const direct = en[trimmed];
  if (direct !== undefined) return lead + direct + tail;
  for (const p of compiled()) {
    const m = trimmed.match(p.re);
    if (m) {
      let out = p.out;
      p.names.forEach((name, i) => { out = out.replaceAll(`{${name}}`, translate(m[i + 1])); });
      return lead + out + tail;
    }
  }
  if (strict) return text;
  // Sentences joined with " · " translate part by part.
  if (trimmed.includes(" · ")) {
    const parts = trimmed.split(" · ").map((p) => translate(p));
    if (parts.join(" · ") !== trimmed) return lead + parts.join(" · ") + tail;
  }
  let out = trimmed;
  for (const [re, to] of DAYS) out = out.replace(re, to as string);
  return out === trimmed ? text : lead + out + tail;
}

const originals = new WeakMap<Node, string>();
const originalAttrs = new WeakMap<Element, Record<string, string>>();
const skip = (node: Node) => {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return !el || !!el.closest('[translate="no"], script, style, code, pre, textarea, [contenteditable="true"]');
};

function translateNode(node: Node) {
  if (node.nodeType === 3) {
    if (skip(node)) return;
    const value = node.nodeValue || "";
    if (!VI.test(value) && !/^\s*[A-ZĐ]{2,6}( · [A-ZĐ]{2,6})*\s*$/.test(value) && !originals.has(node)) return;
    const known = originals.get(node);
    // React may have replaced the text since the last pass.
    const strict = !!node.parentElement?.closest(WRITTEN);
    const source = known !== undefined && translate(known, strict) === value ? known : value;
    const next = translate(source, strict);
    if (next !== value) {
      originals.set(node, source);
      node.nodeValue = next;
    }
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  // Field hints translate even though what people type in the field does not.
  if (el.closest('[translate="no"], [contenteditable="true"]')) return;
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value || !VI.test(value)) continue;
    const next = translate(value);
    if (next !== value) {
      originalAttrs.set(el, { ...(originalAttrs.get(el) || {}), [name]: value });
      el.setAttribute(name, next);
    }
  }
  if ((el as HTMLInputElement).type === "submit" || (el as HTMLInputElement).type === "button") {
    const v = (el as HTMLInputElement).value;
    if (v && VI.test(v)) (el as HTMLInputElement).value = translate(v);
  }
}

function walk(root: Node) {
  translateNode(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) translateNode(n);
}

let observer: MutationObserver | null = null;
let titleObserver: MutationObserver | null = null;
export function startTranslating() {
  if (observer) return;
  walk(document.body);
  document.title = translate(document.title);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") translateNode(r.target);
      else if (r.type === "attributes") translateNode(r.target);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const title = document.querySelector("title");
  if (title) {
    titleObserver = new MutationObserver(() => { const next = translate(document.title); if (next !== document.title) document.title = next; });
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
  }
}

export function stopTranslating() {
  observer?.disconnect();
  titleObserver?.disconnect();
  observer = titleObserver = null;
  // Put the Vietnamese back.
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const text = originals.get(n);
    if (text !== undefined) { n.nodeValue = text; originals.delete(n); }
    const attrs = n.nodeType === 1 ? originalAttrs.get(n as Element) : undefined;
    if (attrs) { for (const [k, v] of Object.entries(attrs)) (n as Element).setAttribute(k, v); originalAttrs.delete(n as Element); }
  }
}
