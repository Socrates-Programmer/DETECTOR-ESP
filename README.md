# 🔌 ESP Device Manager

Gestor web de dispositivos ESP-32 S3 Waveshare con autenticación de usuarios y control de dispositivos.

## Características

✅ **Autenticación de Usuarios**
- Registro con correo, username y contraseña
- Login seguro con JWT
- Sesiones persistentes

✅ **Gestión de Dispositivos ESP**
- Registro de ESPs con clave única
- Cada ESP puede estar registrado en una sola cuenta
- Editar nombre del dispositivo
- Eliminar dispositivos
- Ver lista de dispositivos registrados

✅ **Interfaz Moderna**
- Diseño responsivo
- Interfaz intuitiva
- Alertas en tiempo real

## Requisitos

- Node.js 14+
- npm o yarn

## Instalación

1. **Clonar el proyecto**
```bash
cd garciam
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Crear base de datos** (Se crea automáticamente al iniciar)
```bash
# La base de datos SQLite se crea automáticamente
```

## Uso

1. **Iniciar el servidor**

**Desarrollo** (con auto-reload):
```bash
npm run dev
```

**Producción**:
```bash
npm start
```

2. **Acceder a la aplicación**
Abre tu navegador en: `http://localhost:3000`

## Flujo de Uso

### 1. Crear Cuenta
- Haz clic en "Regístrate aquí"
- Ingresa:
  - Nombre de usuario
  - Correo electrónico
  - Contraseña (mínimo 6 caracteres)
- Haz clic en "Registrarse"

### 2. Iniciar Sesión
- Ingresa tu correo y contraseña
- Haz clic en "Iniciar Sesión"

### 3. Registrar ESP
- Una vez logueado, ve a "Registrar Nuevo ESP"
- Ingresa la clave única del ESP (ej: ESP32-A1B2C3D4E5)
- (Opcional) Ingresa un nombre personalizado
- Haz clic en "Registrar ESP"

### 4. Gestionar ESPs
- **Ver dispositivos**: Se muestran todos tus ESPs
- **Editar nombre**: Haz clic en "Editar"
- **Eliminar**: Haz clic en "Eliminar"

## Estructura del Proyecto

```
garciam/
├── app.js                 # Servidor principal
├── package.json          # Dependencias
├── .env                  # Configuración
├── data.db              # Base de datos SQLite
│
├── config/
│   └── database.js      # Configuración de BD
│
├── middleware/
│   └── auth.js          # Middleware de autenticación JWT
│
├── controllers/
│   ├── authController.js    # Lógica de autenticación
│   └── espController.js     # Lógica de ESPs
│
├── routes/
│   ├── auth.js          # Rutas de autenticación
│   └── esp.js           # Rutas de ESPs
│
└── public/
    ├── index.html       # Página principal
    ├── css/
    │   └── style.css    # Estilos
    └── js/
        └── main.js      # Lógica del cliente
```

## Endpoints API

### Autenticación

**POST** `/api/auth/register`
- Registrar nuevo usuario
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**POST** `/api/auth/login`
- Iniciar sesión
```json
{
  "email": "string",
  "password": "string"
}
```

**GET** `/api/auth/user`
- Obtener información del usuario (requiere token)
- Headers: `Authorization: Bearer <token>`

### Dispositivos ESP

**POST** `/api/esp/register`
- Registrar nuevo ESP (requiere token)
```json
{
  "esp_key": "string",
  "name": "string (opcional)"
}
```

**GET** `/api/esp/my-esps`
- Obtener lista de ESPs del usuario (requiere token)
- Headers: `Authorization: Bearer <token>`

**PUT** `/api/esp/:esp_id`
- Actualizar nombre del ESP (requiere token)
```json
{
  "name": "string"
}
```

**DELETE** `/api/esp/:esp_id`
- Eliminar ESP (requiere token)

**POST** `/api/esp/check-key`
- Verificar si un ESP está registrado (pública)
```json
{
  "esp_key": "string"
}
```

## Integración con ESP-32

Para que el ESP-32 se registre automáticamente después de login:

```c
// Código ejemplo en C para ESP-32
#include <HTTPClient.h>

// Después de que el usuario inicia sesión, obtén el token
String token = "tu_token_jwt"; // Del login del usuario

// Prepara la clave única del ESP
String esp_key = "ESP32-" + WiFi.macAddress(); // O genera una clave única

HTTPClient http;
http.begin("http://tu_servidor:3000/api/esp/register");
http.addHeader("Authorization", "Bearer " + token);
http.addHeader("Content-Type", "application/json");

String payload = "{\"esp_key\":\"" + esp_key + "\",\"name\":\"Mi Sensor\"}";
int httpCode = http.POST(payload);

if(httpCode == 201) {
  Serial.println("ESP registrado exitosamente");
} else {
  Serial.println("Error al registrar ESP: " + String(httpCode));
}

http.end();
```

## Seguridad

⚠️ **Importante para producción:**

1. Cambiar la clave secreta en `middleware/auth.js`:
```javascript
const SECRET_KEY = 'una_clave_muy_larga_y_segura_generada_aleatoriamente';
```

2. Usar HTTPS en lugar de HTTP

3. Validar todas las entradas del usuario

4. Configurar CORS según tus necesidades

5. Usar variables de entorno para configuraciones sensibles

## Solución de Problemas

### Puerto 3000 ya está en uso
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

### Base de datos corrupta
```bash
# Elimina data.db y la aplicación creará una nueva
del data.db
npm start
```

### Token expirado
Simplemente vuelve a iniciar sesión

## Tecnologías Usadas

- **Backend**: Express.js, Node.js
- **Base de Datos**: SQLite3
- **Autenticación**: JWT (jwt-simple)
- **Encriptación**: bcryptjs
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Autor

Proyecto desarrollado para gestionar dispositivos ESP-32 S3 Waveshare

## Licencia

MIT
