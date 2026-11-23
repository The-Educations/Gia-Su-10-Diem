import { TOPIC_IDS, searchText, slugify, splitLegacyBody } from "./news-policy.js";

const quoted = (values) => values.map((v) => `'${v}'`).join(",");
const COLUMNS = {
  topic: `TEXT NOT NULL DEFAULT 'study' CHECK(topic IN (${quoted(TOPIC_IDS)}))`,
  origin: "TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','auto'))",
  slug: "TEXT NOT NULL DEFAULT ''",
  body_html: "TEXT NOT NULL DEFAULT ''",
  cover_url: "TEXT NOT NULL DEFAULT ''",
  cover_alt: "TEXT NOT NULL DEFAULT ''",
  cover_credit: "TEXT NOT NULL DEFAULT ''",
  source_name: "TEXT NOT NULL DEFAULT ''",
  source_url: "TEXT NOT NULL DEFAULT ''",
  pinned: "INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1))",
  cta_level: "TEXT NOT NULL DEFAULT ''",
  cta_goal: "TEXT NOT NULL DEFAULT ''",
  search_text: "TEXT NOT NULL DEFAULT ''",
  revised_at: "TEXT",
};

// Additive and rerunnable: columns are added only when missing, data fixes only touch rows that need them.
export function migrateNews(db) {
  const existing = new Set(db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name));
  for (const [name, ddl] of Object.entries(COLUMNS))
    if (!existing.has(name)) db.exec(`ALTER TABLE posts ADD COLUMN ${name} ${ddl}`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_pinned_post ON posts(pinned) WHERE pinned=1;
    CREATE INDEX IF NOT EXISTS posts_public_order ON posts(published,published_at,id);
    CREATE TABLE IF NOT EXISTS news_images (
      id TEXT PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS news_image_chunks (
      image_id TEXT NOT NULL REFERENCES news_images(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL,
      PRIMARY KEY(image_id,part)
    );
    CREATE TABLE IF NOT EXISTS news_post_images (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      image_id TEXT NOT NULL REFERENCES news_images(id) ON DELETE CASCADE, PRIMARY KEY(post_id,image_id)
    );
    CREATE INDEX IF NOT EXISTS news_images_owner ON news_images(author_id,created_at);
    CREATE INDEX IF NOT EXISTS news_post_images_image ON news_post_images(image_id);
  `);
  const update = db.prepare(
    `UPDATE posts SET body=?,source_name=?,source_url=?,cover_url=?,cover_alt=?,cover_credit=?,slug=?,search_text=? WHERE id=?`,
  );
  for (const row of db.prepare("SELECT * FROM posts").all()) {
    const split = splitLegacyBody(row.body, { cover: !row.cover_url, source: !row.source_name });
    const next = {
      body: split.body,
      source_name: row.source_name || split.source_name,
      source_url: row.source_url || split.source_url,
      cover_url: row.cover_url || split.cover_url,
      cover_alt: row.cover_url ? row.cover_alt : split.cover_alt,
      cover_credit: row.cover_url ? row.cover_credit : split.cover_credit,
      slug: row.slug || (row.published_at ? slugify(row.title) : ""),
    };
    const search = searchText({ title: row.title, summary: row.summary, body: next.body });
    const same =
      next.body === row.body && next.source_name === row.source_name && next.source_url === row.source_url &&
      next.cover_url === row.cover_url && next.cover_alt === row.cover_alt && next.cover_credit === row.cover_credit &&
      next.slug === row.slug && search === row.search_text;
    if (!same)
      update.run(next.body, next.source_name, next.source_url, next.cover_url, next.cover_alt, next.cover_credit, next.slug, search, row.id);
  }
}
