import Database from 'better-sqlite3'

const db = new Database(':memory:')
try {
  db.exec(`
    CREATE TABLE smoke_messages(id INTEGER PRIMARY KEY, content TEXT NOT NULL);
    CREATE VIRTUAL TABLE smoke_messages_fts USING fts5(content, content='smoke_messages', content_rowid='id');
    CREATE TRIGGER smoke_messages_ai AFTER INSERT ON smoke_messages BEGIN
      INSERT INTO smoke_messages_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `)
  db.prepare('INSERT INTO smoke_messages(content) VALUES (?)').run('Ambientic context kernel installed-app smoke test')
  const row = db.prepare("SELECT m.content FROM smoke_messages_fts f JOIN smoke_messages m ON m.id=f.rowid WHERE smoke_messages_fts MATCH 'context'").get()
  if (!row?.content.includes('context kernel')) throw new Error('FTS5 smoke query did not return the inserted record.')
  console.log(`[ambientic] SQLite ${db.prepare('select sqlite_version() AS version').get().version} + FTS5 smoke passed`)
} finally {
  db.close()
}
