const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ruta de la base de datos
const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'data.db');
const backupDir = path.join(dataDir, 'backups');

// Crear carpetas si no existen
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✓ Carpeta de datos creada:', dataDir);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log('✓ Carpeta de backups creada:', backupDir);
}

// Configurar base de datos con opciones de persistencia
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar la base de datos:', err);
  } else {
    console.log('✓ Base de datos conectada:', dbPath);
    
    // Optimizar para mejor persistencia
    db.run('PRAGMA journal_mode = WAL');        // Write-Ahead Logging
    db.run('PRAGMA synchronous = FULL');        // Sincronización completa
    db.run('PRAGMA foreign_keys = ON');         // Claves foráneas habilitadas
    db.run('PRAGMA cache_size = -64000');       // 64MB de caché
  }
});

// Crear las tablas si no existen
db.serialize(() => {
  // Tabla de usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (!err) console.log('✓ Tabla "users" lista');
  });

  // Tabla de ESPs
  db.run(`
    CREATE TABLE IF NOT EXISTS esps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      esp_key TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT DEFAULT 'Mi ESP',
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (!err) console.log('✓ Tabla "esps" lista');
  });

  // Tabla de auditoria (para rastrear cambios)
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      user_id INTEGER,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (!err) console.log('✓ Tabla "audit_log" lista');
  });
});

// Función para hacer backup automático
function createBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);
    
    const source = fs.createReadStream(dbPath);
    const dest = fs.createWriteStream(backupPath);
    
    source.pipe(dest);
    
    source.on('end', () => {
      console.log('✓ Backup creado:', backupPath);
      
      // Mantener solo los últimos 5 backups
      const backups = fs.readdirSync(backupDir).sort().reverse();
      if (backups.length > 5) {
        for (let i = 5; i < backups.length; i++) {
          fs.unlinkSync(path.join(backupDir, backups[i]));
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

// Crear backup automático cada 15 minutos
setInterval(createBackup, 15 * 60 * 1000);

// Crear backup inicial
createBackup();

// Cerrar gracefully
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
