const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'data.db');
const backupDir = path.join(dataDir, 'backups');

function ensureDirectory(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`OK Carpeta de ${label} creada: ${dirPath}`);
  }
}

ensureDirectory(dataDir, 'datos');
ensureDirectory(backupDir, 'backups');

let db;

const openPromise = new Promise((resolve, reject) => {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      reject(err);
      return;
    }

    console.log(`OK Base de datos conectada: ${dbPath}`);
    resolve();
  });
});

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows || []);
    });
  });
}

async function configureDatabase() {
  await runAsync('PRAGMA journal_mode = WAL');
  await runAsync('PRAGMA synchronous = FULL');
  await runAsync('PRAGMA foreign_keys = ON');
  await runAsync('PRAGMA cache_size = -64000');
}

async function ensureUsersTable() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('OK Tabla "users" lista');
}

async function ensureAuditTable() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      user_id INTEGER,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('OK Tabla "audit_log" lista');
}

async function createCurrentESPTable() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS esps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      esp_key TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runAsync('CREATE INDEX IF NOT EXISTS idx_esps_user_id ON esps(user_id)');
  console.log('OK Tabla "esps" lista');
}

async function tableExists(tableName) {
  const row = await getAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );

  return Boolean(row);
}

async function getTableColumns(tableName) {
  const columns = await allAsync(`PRAGMA table_info(${tableName})`);
  return columns.map((column) => column.name);
}

function hasCurrentESPShape(columnNames) {
  return (
    columnNames.includes('id') &&
    columnNames.includes('esp_key') &&
    columnNames.includes('user_id') &&
    columnNames.includes('registered_at') &&
    !columnNames.includes('name') &&
    !columnNames.includes('updated_at')
  );
}

async function importLegacyESPBindings(sourceTable) {
  await runAsync(`
    INSERT OR IGNORE INTO esps (id, esp_key, user_id, registered_at)
    SELECT
      id,
      LOWER(TRIM(esp_key)),
      user_id,
      COALESCE(registered_at, CURRENT_TIMESTAMP)
    FROM ${sourceTable}
    WHERE esp_key IS NOT NULL AND user_id IS NOT NULL
  `);
}

async function finalizeLegacyESPTable(sourceTable) {
  await createCurrentESPTable();
  await importLegacyESPBindings(sourceTable);
  await runAsync(`DROP TABLE ${sourceTable}`);
}

async function migrateCurrentESPTable() {
  console.log('Migrando tabla "esps" al modelo de keys unicas...');

  await runAsync('BEGIN IMMEDIATE');

  try {
    await runAsync('ALTER TABLE esps RENAME TO esps_legacy');
    await finalizeLegacyESPTable('esps_legacy');
    await runAsync('COMMIT');
  } catch (error) {
    try {
      await runAsync('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al revertir la migracion de "esps":', rollbackError);
    }

    throw error;
  }

  console.log('OK Migracion de "esps" completada');
}

async function resumeLegacyESPTable() {
  console.log('Reanudando migracion pendiente de "esps"...');
  await finalizeLegacyESPTable('esps_legacy');
  console.log('OK Migracion pendiente de "esps" completada');
}

async function ensureESPTable() {
  const hasESPTable = await tableExists('esps');
  const hasLegacyTable = await tableExists('esps_legacy');

  if (!hasESPTable && !hasLegacyTable) {
    await createCurrentESPTable();
    return;
  }

  if (!hasESPTable && hasLegacyTable) {
    await resumeLegacyESPTable();
    return;
  }

  const columnNames = await getTableColumns('esps');

  if (!hasCurrentESPShape(columnNames)) {
    await migrateCurrentESPTable();
    return;
  }

  await createCurrentESPTable();

  if (hasLegacyTable) {
    await resumeLegacyESPTable();
  }
}

function createBackup() {
  try {
    if (!fs.existsSync(dbPath)) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

    const source = fs.createReadStream(dbPath);
    const dest = fs.createWriteStream(backupPath);

    source.pipe(dest);

    source.on('end', () => {
      console.log(`OK Backup creado: ${backupPath}`);

      const backups = fs.readdirSync(backupDir).sort().reverse();
      if (backups.length > 5) {
        for (let index = 5; index < backups.length; index += 1) {
          fs.unlinkSync(path.join(backupDir, backups[index]));
        }
      }
    });

    source.on('error', (error) => {
      console.error('Error al crear backup:', error);
    });
  } catch (error) {
    console.error('Error en createBackup:', error);
  }
}

async function initializeDatabase() {
  await openPromise;
  await configureDatabase();
  await ensureUsersTable();
  await ensureAuditTable();
  await ensureESPTable();

  createBackup();
  setInterval(createBackup, 15 * 60 * 1000);
}

const ready = initializeDatabase().catch((error) => {
  console.error('Error al inicializar la base de datos:', error);
  throw error;
});

function closeDatabase(signalName) {
  console.log(`\nCerrando base de datos (${signalName})...`);
  db.close((err) => {
    if (err) {
      console.error('Error al cerrar la BD:', err);
    } else {
      console.log('OK Base de datos cerrada correctamente');
    }

    process.exit(err ? 1 : 0);
  });
}

process.on('SIGINT', () => closeDatabase('SIGINT'));
process.on('SIGTERM', () => closeDatabase('SIGTERM'));

db.ready = ready;

module.exports = db;
