# 💾 Almacenamiento Local - Guía Completa

Tu aplicación ahora guarda información de forma local de varias maneras. Aquí te explico todo:

## 🗄️ Tipos de Almacenamiento

### 1. **Base de Datos SQLite (Servidor)**
- **Ubicación**: `data/data.db`
- **Qué guarda**: Todos los usuarios, ESPs, y auditoría
- **Persistencia**: Permanente (incluso al reiniciar el servidor)
- **Respaldo automático**: Cada 15 minutos en `data/backups/`

**Ventajas:**
- Datos seguros en el servidor
- Respaldos automáticos
- Base de datos relacional completa
- Claves foráneas y validaciones

### 2. **localStorage (Navegador)**
- **Ubicación**: Caché del navegador del usuario
- **Qué guarda**: 
  - Token de sesión
  - ID del usuario
  - Datos el usuario (nombre, email)
  - Lista de ESPs registrados
- **Persistencia**: Mientras no se limpie el navegador

**Ventajas:**
- Funciona offline
- Acceso rápido a datos
- Auto-guarda automáticamente

### 3. **Auto-save Periódico**
- **Frecuencia**: Cada 5 minutos
- **Qué hace**: Actualiza los datos en caché

### 4. **Backup Manual (Exportar/Importar)**
- **Formato**: JSON
- **Ubicación**: Descargas del usuario

---

## 📋 Carpetas de Datos

```
garciam/
├── data/                          # Datos locales
│   ├── data.db                   # Base de datos SQLite (archivo único)
│   ├── data.db-shm              # Memoria compartida WAL
│   ├── data.db-wal              # Write-Ahead Logging
│   └── backups/                 # Respaldos automáticos
│       ├── backup-2024-03-26T10-30-45.db
│       ├── backup-2024-03-26T10-45-45.db
│       └── ...
```

---

## 🔄 Modo Offline

Tu aplicación ahora funciona sin conexión:

1. **Cuando estás online**:
   - Los datos se sincronizan con el servidor
   - Se guardan en localStorage como caché
   - Se muestran datos frescos

2. **Cuando pierdes conexión** 🔴:
   - Se muestra un mensaje de alerta
   - Los datos se cargan de localStorage
   - Puedes seguir viendo tus ESPs
   - Las operaciones se guardan localmente

3. **Cuando vuelve la conexión** 🟢:
   - Se muestra un mensaje de reconexión
   - Los datos se sincronizan automáticamente

---

## 💾 Exportar/Importar Datos

### Exportar (Descargar Backup)

1. Inicia sesión
2. Haz clic en el botón **"💾 Backup"** en la barra superior
3. Se descargará un archivo: `esp-backup-2024-03-26.json`

**Estructura del archivo:**
```json
{
  "user": {
    "id": 1,
    "username": "tuusuario",
    "email": "tu@email.com"
  },
  "esps": [
    {
      "id": 1,
      "esp_key": "ESP32-A1B2C3D4E5",
      "name": "Mi Sensor",
      "registered_at": "2024-03-26T10:30:00.000Z"
    }
  ],
  "exportDate": "2024-03-26T14:45:30.123Z",
  "version": "1.0"
}
```

### Importar (Restaurar Backup)

1. Inicia sesión
2. En la sección "Mis Dispositivos ESP", haz clic en **"📤 Importar"**
3. Selecciona un archivo `.json` de backup
4. Los datos se restaurarán inmediatamente

---

## 🔐 Configuración de Persistencia

El servidor SQLite está configurado con:

```
PRAGMA journal_mode = WAL         # Write-Ahead Logging (más seguro)
PRAGMA synchronous = FULL         # Sincronización completa
PRAGMA foreign_keys = ON          # Claves foráneas habilitadas
PRAGMA cache_size = -64000        # 64MB de caché
```

Esto asegura que:
- ✅ Los datos se guardan correctamente
- ✅ No se pierden datos al reiniciar
- ✅ Mejor rendimiento con caché
- ✅ Link de integridad entre tablas

---

## 📊 Información de Almacenamiento

Para ver información del almacenamiento:

```javascript
// En la consola del navegador (F12):
console.log('Usuario:', LocalStorage.getUser());
console.log('ESPs:', LocalStorage.getESPs());
```

---

## 🧹 Limpiar Caché

Los datos en caché se mantienen incluso después de logout. Para limpiar:

```javascript
// En la consola del navegador:
LocalStorage.clearSession();
```

O automáticamente al:
- Cerrar sesión
- Importar un nuevo backup
- Ejecutar logout

---

## 📝 Tabla Audit Log

El servidor mantiene un registro de todos los cambios:

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  action TEXT,              -- INSERT, UPDATE, DELETE
  table_name TEXT,          -- users, esps, etc
  record_id INTEGER,        -- ID del registro modificado
  user_id INTEGER,          -- Quién lo hizo
  details TEXT,             -- Detalles del cambio
  timestamp DATETIME        -- Cuándo ocurrió
)
```

Esto permite:
- 🔍 Auditoría completa
- ⏪ Ver qué cambió y cuándo
- 📋 Rastrear acciones por usuario

---

## 🚀 Flujo de Datos

```
┌─────────────────────────────────────────────────────┐
│            NAVEGADOR DEL USUARIO                    │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │        localStorage (Caché)                 │   │
│  │  - Token                                    │   │
│  │  - Usuario                                  │   │
│  │  - ESPs                                     │   │
│  │  - Sincronización: Automática c/5 min      │   │
│  └──────────────┬────────────────────────────┘   │
│                 │                                 │
│                 │ (Sincronización)                │
│                 ▼                                 │
│  ┌─────────────────────────────────────────────┐   │
│  │        API REST (Servidor)                  │   │
│  │  - /api/auth/login                          │   │
│  │  - /api/auth/register                       │   │
│  │  - /api/esp/register                        │   │
│  │  - /api/esp/my-esps                         │   │
│  └──────────────┬────────────────────────────┘   │
│                 │                                 │
│                 │ (Guardar/Leer)                  │
│                 ▼                                 │
├─────────────────────────────────────────────────────┤
│           SERVIDOR (Node.js)                       │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │    SQLite3 Database (data/data.db)         │   │
│  │  - Tabla: users                            │   │
│  │  - Tabla: esps                             │   │
│  │  - Tabla: audit_log                        │   │
│  │                                            │   │
│  │  Configuración:                            │   │
│  │  ✓ WAL (Write-Ahead Logging)               │   │
│  │  ✓ FULL Synchronous                        │   │
│  │  ✓ Foreign Keys Habilitadas                │   │
│  └────────────────┬─────────────────────────┘   │
│                   │                             │
│                   │ (Respaldo c/15 min)         │
│                   ▼                             │
│  ┌────────────────────────────────────────────┐   │
│  │    Backups Automáticos (data/backups/)     │   │
│  │  - backup-2024-03-26T10-30-45.db           │   │
│  │  - backup-2024-03-26T10-45-45.db           │   │
│  │  - ...                                     │   │
│  │  (Mantiene los últimos 5)                  │   │
│  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## ✅ Checklist de Persistencia

- ✅ SQLite3 configurado con WAL
- ✅ Backups automáticos cada 15 minutos
- ✅ localStorage como caché en el navegador
- ✅ Auto-save del caché cada 5 minutos
- ✅ Funcionalidad offline completa
- ✅ Exportar/Importar datos en JSON
- ✅ Tabla de auditoría para rastreo
- ✅ Sincronización automática al reconectar
- ✅ Campos de timestamp en todas las tablas
- ✅ Eliminación en cascada de datos relacionados

---

## 🆘 Solución de Problemas

### Los datos no se guardan

1. Verifica que la carpeta `data/` existe
2. Comprueba permisos de lectura/escritura:
```bash
# En Windows
dir c:\Users\Marcos Avila\Desktop\garciam\data
```

3. Reinicia el servidor: `npm start`

### No puedo importar un backup

1. Asegúrate de que el archivo es `.json`
2. Verifica que fue exportado desde esta app
3. Abre la consola (F12) para ver errores

### Datos offline se pierden

Los datos en localStorage se pierden si:
- Limpias el caché del navegador
- Desinstala la app (en PWA)
- Cambias de navegador

**Solución**: Exporta regularmente tus datos

### Base de datos corrupta

```bash
# Elimina data.db y la app creará una nueva
rm data/data.db*
npm start
```

---

## 📞 Resumen Rápido

| Aspecto | Detalles |
|--------|---------|
| **DB Server** | SQLite3 en `data/data.db` |
| **Caché Local** | localStorage del navegador |
| **Backup Automático** | Cada 15 minutos |
| **Auto-save Caché** | Cada 5 minutos |
| **Modo Offline** | ✅ Completamente funcional |
| **Exportar** | Botón "💾 Backup" |
| **Importar** | Botón "📤 Importar" en ESPs |
| **Auditoría** | Tabla `audit_log` completa |
| **Sincronización** | Automática online/offline |

¡Tu aplicación ahora tiene un excelente sistema de almacenamiento local! 🎉
