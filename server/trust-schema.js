// Tables and columns behind lesson ratings, course reviews and the trust score.
// Additive only and safe to run twice.
const addColumn = (db, table, name, definition) => {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
};

export function migrateTrust(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_ratings (
      booking_id INTEGER PRIMARY KEY REFERENCES bookings(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS course_reviews (
      offer_id INTEGER PRIMARY KEY REFERENCES offers(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      body TEXT NOT NULL DEFAULT '',
      continue_intent TEXT CHECK(continue_intent IN ('yes','no','unsure')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  addColumn(db, "offers", "ended_at", "TEXT");
  addColumn(db, "offers", "ended_by", "INTEGER REFERENCES users(id)");
  addColumn(db, "bookings", "cancelled_by", "INTEGER REFERENCES users(id)");
  addColumn(db, "bookings", "cancelled_at", "TEXT");
  // '' for an ordinary cancellation, 'course_ended' when the course was ended early.
  addColumn(db, "bookings", "cancel_reason", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "bookings", "tutor_missed_at", "TEXT");
}
