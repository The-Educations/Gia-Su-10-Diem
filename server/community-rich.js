import sanitizeHtml from "sanitize-html";
import { decodeHTML } from "entities";

export const IMAGE_PATH = /^\/api\/community\/images\/([a-f0-9-]{36})$/;
export function cleanPostHtml(value) {
  const images = new Set();
  let image_count = 0;
  const html = sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "h2",
      "h3",
      "strong",
      "em",
      "u",
      "s",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "a",
      "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "loading"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: {
          ...(/^https?:\/\//i.test(attrs.href || "")
            ? { href: attrs.href }
            : {}),
          target: "_blank",
          rel: "noopener noreferrer nofollow ugc",
        },
      }),
      img: (_tag, attrs) => ({
        tagName: "img",
        attribs: {
          src: IMAGE_PATH.test(attrs.src || "") ? attrs.src : "",
          alt: (attrs.alt || "").slice(0, 300),
          loading: "lazy",
        },
      }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag !== "img") return false;
      const match = frame.attribs.src?.match(IMAGE_PATH);
      if (!match) return true;
      images.add(match[1]);
      image_count++;
      return false;
    },
  });
  const body = decodeHTML(
    sanitizeHtml(
      html.replace(/<\/(p|h2|h3|li|blockquote|pre)>|<br\s*\/?\s*>/g, "\n"),
      {
        allowedTags: [],
        allowedAttributes: {},
      },
    ),
  ).trim();
  return { body_html: html, body, image_ids: [...images], image_count };
}
