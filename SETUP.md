# Guía de Configuración Rápida

## Paso 1: Instalar Node.js

Si no tienes Node.js instalado:
1. Ve a https://nodejs.org/
2. Descarga la versión LTS (Recomendado)
3. Instala siguiendo el asistente

Verifica la instalación:
```bash
node --version
npm --version
```

## Paso 2: Instalar Dependencias

Desde la carpeta `garciam`, ejecuta:

```bash
npm install
```

Esto instalará todas las dependencias necesarias:
- `express` - Framework web
- `sqlite3` - Base de datos
- `bcryptjs` - Encriptación de contraseñas
- `jwt-simple` - Autenticación JWT
- `cors` - Manejo de CORS
- `nodemon` - Auto-reload en desarrollo

## Paso 3: Ejecutar el Servidor

**Desarrollo (con auto-reload):**
```bash
npm run dev
```

**Producción:**
```bash
npm start
```

Deberías ver:
```
🚀 Servidor ejecutándose en http://localhost:3000
Presiona Ctrl+C para detener el servidor
```

## Paso 4: Acceder a la Aplicación

1. Abre tu navegador
2. Ve a: **http://localhost:3000**
3. ¡Listo! Ya puedes usar la aplicación

## Primer Uso

1. **Crear una cuenta:**
   - Haz clic en "Regístrate aquí"
   - Completa el formulario
   - Haz clic en "Registrarse"

2. **Registrar un ESP:**
   - En el dashboard, ve a "Registrar Nuevo ESP"
   - Ingresa la clave única del ESP (ej: ESP32-ABC123)
   - Dale un nombre (opcional)
   - Haz clic en "Registrar ESP"

3. **Gestionar ESPs:**
   - Verás la lista de tus dispositivos
   - Puedes editar el nombre o eliminar dispositivos

## Estructura de Carpetas

```
garciam/
├── app.js                    # Servidor principal
├── package.json             # Configuración del proyecto
├── .env                     # Variables de entorno
├── README.md               # Documentación general
├── SETUP.md                # Esta guía
├── .gitignore              # Archivos a ignorar en Git
├── data.db                 # Base de datos (se crea automáticamente)
├── config/                 # Configuración
├── middleware/             # Middlewares
├── controllers/            # Lógica de negocio
├── routes/                 # Rutas de la API
├── models/                 # Modelos de datos
└── public/                 # Archivos estáticos
    ├── index.html         # Página principal
    ├── css/style.css      # Estilos
    └── js/main.js         # Lógica del cliente
```

## Características Principales

✅ **Autenticación Segura**
- Registro con correo, usuario y contraseña
- Contraseñas encriptadas con bcrypt
- Tokens JWT para sesiones

✅ **Gestión de ESPs**
- Registrar nuevos dispositivos
- Cada ESP tiene una clave única
- Una clave solo puede estar en una cuenta
- Editar y eliminar dispositivos

✅ **API RESTful**
- Bien documentada
- Fácil de integrar con ESP-32
- Manejo de errores

## Comandos Útiles

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Ejecutar en producción
npm start

# Ver versión de Node
node --version

# Ver versión de npm
npm --version
```

## Variables de Entorno

El archivo `.env` contiene:
```
PORT=3000                    # Puerto del servidor
NODE_ENV=development         # Ambiente
JWT_SECRET=...              # Clave para JWT
```

Puedes cambiar el puerto si es necesario:
```
PORT=3001
```

## Problemas Comunes

### Error: "Port already in use"
El puerto 3000 ya está siendo usado. Soluciones:
- Cierra otro servidor en ese puerto
- Cambia el puerto en `.env` a uno diferente (ej: 3001)

### Error: "Cannot find module"
Las dependencias no están instaladas:
```bash
npm install
```

### Base de datos corrupta
```bash
# Elimina el archivo data.db
del data.db
# O en Linux/Mac:
rm data.db

# Reinicia el servidor (creará una nueva BD)
npm start
```

## Desarrollo

El proyecto está estructurado siguiendo patrones MVC:
- **Models**: Definición de datos
- **Controllers**: Lógica de negocio
- **Routes**: Definición de endpoints

### Agregar Nuevas Funcionalidades

1. Crear ruta en `routes/`
2. Crear controlador en `controllers/`
3. Agregar endpoint en `app.js`
4. Actualizar el frontend en `public/`

## Seguridad

⚠️ **Para producción:**
1. Cambiar JWT_SECRET por algo seguro
2. Usar HTTPS
3. Configurar CORS apropiadamente
4. Validar todas las entradas
5. Usar variables de entorno protegidas

## ¿Necesitas ayuda?

- Lee el README.md para documentación completa
- Revisa los comentarios en el código
- Verifica la consola del navegador (F12) para errores
- Verifica la terminal donde ejecutas el servidor para logs

¡Éxito! 🚀
