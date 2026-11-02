import { RULES_TITLE, RULES_BODY, fold } from "./community-policy.js";

export function migrateCommunity(db) {
  const columns = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((c) => c.name);
  for (const [name, definition] of Object.entries({
    display_name: "TEXT NOT NULL DEFAULT ''",
    community_locked: "INTEGER NOT NULL DEFAULT 0",
    community_lock_reason: "TEXT NOT NULL DEFAULT ''",
  })) {
    if (!columns.includes(name))
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'user' CHECK(kind IN ('user','announcement','rules')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','hidden','deleted')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT '',          -- title+body đã bỏ dấu, chữ thường
  review_note TEXT NOT NULL DEFAULT '',          -- lý do từ chối / ẩn mới nhất
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  solved INTEGER NOT NULL DEFAULT 0,
  best_comment_id INTEGER,
  revision_title TEXT,                           -- bản sửa chờ duyệt
  revision_body TEXT,
  revision_status TEXT CHECK(revision_status IN ('pending','rejected')),
  revision_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS one_rules_post ON community_posts(kind) WHERE kind='rules';
CREATE INDEX IF NOT EXISTS community_posts_feed ON community_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_author ON community_posts(author_id, created_at);

CREATE TABLE IF NOT EXISTS community_comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES community_comments(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible'
    CHECK(status IN ('visible','removed_by_author','removed_by_admin')),
  removal_note TEXT NOT NULL DEFAULT '',
  edited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS community_comments_post ON community_comments(post_id, id);
CREATE INDEX IF NOT EXISTS community_comments_author_time ON community_comments(author_id, created_at);

CREATE TABLE IF NOT EXISTS community_helpful (
  comment_id INTEGER NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY(comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_follows (
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  resolved_by INTEGER REFERENCES users(id),
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reporter_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS community_notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  post_id INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS community_notifications_user ON community_notifications(user_id, read_at, id);
`);
  if (
    !db
      .prepare("PRAGMA table_info(community_posts)")
      .all()
      .some((c) => c.name === "review_version")
  )
    db.exec(
      "ALTER TABLE community_posts ADD COLUMN review_version INTEGER NOT NULL DEFAULT 0",
    );
  db.prepare(
    `INSERT INTO community_posts(author_id,kind,status,title,body,search_text,published_at) SELECT id,'rules','approved',?,?,?,CURRENT_TIMESTAMP FROM users WHERE role='admin' AND status='active' AND NOT EXISTS (SELECT 1 FROM community_posts WHERE kind='rules') ORDER BY id LIMIT 1`,
  ).run(RULES_TITLE, RULES_BODY, fold(RULES_TITLE + " " + RULES_BODY));
}
