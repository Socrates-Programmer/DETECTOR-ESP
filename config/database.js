const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'data.db');
const backupDir = path.join(dataDir, 'backups');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✓ Carpeta de datos creada:', dataDir);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log('✓ Carpeta de backups creada:', backupDir);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar la base de datos:', err);
  } else {
    console.log('✓ Base de datos conectada:', dbPath);
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = FULL');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA cache_size = -64000');
  }
});

function ensureUsersTable() {
  db.run(
    `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    (err) => {
      if (!err) {
        console.log('✓ Tabla "users" lista');
      }
    }
  );
}

function ensureAuditTable() {
  db.run(
    `
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        user_id INTEGER,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    (err) => {
      if (!err) {
        console.log('✓ Tabla "audit_log" lista');
      }
    }
  );
}

function createCurrentESPTable() {
  db.run(
    `
      CREATE TABLE IF NOT EXISTS esps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        esp_key TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `,
    (err) => {
      if (!err) {
        console.log('✓ Tabla "esps" lista');
      }
    }
  );

  db.run('CREATE INDEX IF NOT EXISTS idx_esps_user_id ON esps(user_id)');
}

function migrateLegacyESPTable() {
  db.all('PRAGMA table_info(esps)', (err, columns) => {
    if (err) {
      console.error('Error al inspeccionar la tabla "esps":', err);
      return;
    }

    const columnNames = columns.map((column) => column.name);
    const hasCurrentShape =
      columnNames.includes('id') &&
      columnNames.includes('esp_key') &&
      columnNames.includes('user_id') &&
      columnNames.includes('registered_at') &&
      !columnNames.includes('name') &&
      !columnNames.includes('updated_at');

    if (hasCurrentShape) {
      createCurrentESPTable();
      return;
    }

    db.serialize(() => {
      console.log('↻ Migrando tabla "esps" al modelo de keys únicas...');

      db.run('ALTER TABLE esps RENAME TO esps_legacy');
      createCurrentESPTable();
      db.run(
        `
          INSERT OR IGNORE INTO esps (id, esp_key, user_id, registered_at)
          SELECT
            id,
            LOWER(TRIM(esp_key)),
            user_id,
            COALESCE(registered_at, CURRENT_TIMESTAMP)
          FROM esps_legacy
          WHERE esp_key IS NOT NULL AND user_id IS NOT NULL
        `
      );
      db.run('DROP TABLE esps_legacy');
    });
  });
}

function ensureESPTable() {
  db.get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'esps'",
    (err, row) => {
      if (err) {
        console.error('Error al verificar la tabla "esps":', err);
        return;
      }

      if (!row) {
        createCurrentESPTable();
        return;
      }

      migrateLegacyESPTable();
    }
  );
}

db.serialize(() => {
  ensureUsersTable();
  ensureAuditTable();
  ensureESPTable();
});

function createBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

    const source = fs.createReadStream(dbPath);
    const dest = fs.createWriteStream(backupPath);

    source.pipe(dest);

    source.on('end', () => {
      console.log('✓ Backup creado:', backupPath);

      const backups = fs.readdirSync(backupDir).sort().reverse();
      if (backups.length > 5) {
        for (let index = 5; index < backups.length; index += 1) {
          fs.unlinkSync(path.join(backupDir, backups[index]));
        }
      }
    });

    source.on('error', (err) => {
      console.error('Error al crear backup:', err);
    });
  } catch (err) {
    console.error('Error en createBackup:', err);
  }
}

setInterval(createBackup, 15 * 60 * 1000);
createBackup();

process.on('SIGINT', () => {
  console.log('\n⏹️  Guardando datos y cerrando...');
  db.close((err) => {
    if (err) {
      console.error('Error al cerrar la BD:', err);
    } else {
      console.log('✓ Base de datos cerrada correctamente');
    }
    process.exit(0);
  });
});

module.exports = db;
