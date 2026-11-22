// Turns a YouTube or Google Drive share link into an embeddable player URL.
export function embedUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const youtube = host === "youtu.be" ? u.pathname.slice(1)
      : host === "youtube.com" ? u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]
      : null;
    if (youtube && /^[\w-]{6,20}$/.test(youtube)) return `https://www.youtube-nocookie.com/embed/${youtube}`;
    const drive = host === "drive.google.com" && (u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get("id"));
    if (drive) return `https://drive.google.com/file/d/${drive}/preview`;
  } catch {
    /* not a URL */
  }
  return null;
}
