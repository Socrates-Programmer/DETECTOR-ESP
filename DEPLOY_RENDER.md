# 🚀 Desplegar en Render.com

Guía paso a paso para subir tu aplicación a Render.

## 📋 Requisitos

- ✅ Cuenta GitHub
- ✅ Cuenta Render.com (gratuita)
- ✅ Git instalado en tu computadora

## ✅ Paso 1: Instalar Git

Si no lo tienes, descarga desde: https://git-scm.com/

Verifica que esté instalado:
```bash
git --version
```

## ✅ Paso 2: Crear Repositorio Local

Desde la carpeta `garciam`:

```bash
cd c:\Users\Marcos Avila\Desktop\garciam
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"

git init
git add .
git commit -m "Initial commit: ESP Device Manager"
```

## ✅ Paso 3: Crear Repositorio en GitHub

### A) Crear Cuenta (si no tienes)
1. Ve a https://github.com/signup
2. Crea una cuenta

### B) Crear Repositorio
1. Ve a https://github.com/new
2. Nombre: `esp-device-manager`
3. Descripción: `Sistema de gestión de dispositivos ESP-32`
4. Selecciona **"Public"** o **"Private"**
5. Haz clic en **"Create repository"**

### C) Conectar tu Código Local a GitHub

GitHub te mostrará unos comandos. En tu terminal, ejecuta:

```bash
git remote add origin https://github.com/TU_USUARIO/esp-device-manager.git
git branch -M main
git push -u origin main
```

Reemplaza `TU_USUARIO` con tu usuario de GitHub.

Si te pide autenticación:
- Genera un Personal Access Token: https://github.com/settings/tokens
- O usa GitHub CLI: https://cli.github.com/

## ✅ Paso 4: Crear Cuenta en Render

1. Ve a https://render.com
2. Haz clic en **"Sign Up"**
3. Selecciona **"GitHub"** (para conectar automáticamente)
4. Autoriza la conexión con GitHub

## ✅ Paso 5: Desplegar en Render

### A) Crear Servicio Web
1. Desde el dashboard de Render, haz clic en **"New +"**
2. Selecciona **"Web Service"**
3. Elige **"Deploy an existing repository"**

### B) Conectar Repositorio
1. Busca tu repositorio: `esp-device-manager`
2. Haz clic en **"Connect"**

### C) Configurar el Servicio

Completa los siguientes campos:

| Campo | Valor |
|-------|-------|
| **Name** | `esp-device-manager` |
| **Environment** | `Node` |
| **Region** | `Elige el más cercano` |
| **Branch** | `main` |
| **Build Command** | `npm install` |
| **Start Command** | `node app.js` |
| **Plan** | Free (puedes cambiar después) |

### D) Agregar Variables de Entorno

Haz clic en **"Add Environment Variable"** y agrega:

```
PORT=3000
NODE_ENV=production
JWT_SECRET=tu_clave_secreta_super_larga_y_segura_render_2024
```

⚠️ **Cambia JWT_SECRET** a algo único y seguro.

### E) Desplegar

1. Haz clic en **"Create Web Service"**
2. Espera 2-3 minutos mientras se despliega
3. Una vez completado, verás un enlace como: `https://esp-device-manager.onrender.com`

## 🎉 ¡Tu App está En Vivo!

Abre tu navegador en el enlace que te proporciona Render y ¡prueba tu aplicación!

---

## 📝 Notas Importantes

### Base de Datos
- **SQLite3** funciona bien en Render
- Los datos se guardan en el contenedor (se pierden al reiniciar)
- **Para producción**: Usa PostgreSQL (gratuito en Render)

### Actualizaciones
Cada vez que hagas cambios:
```bash
git add .
git commit -m "Tu mensaje de cambio"
git push origin main
```

Render se redesplegará automáticamente.

### Dominio Personalizado
1. Ve a tu servicio en Render
2. Haz clic en **"Settings"**
3. En **"Custom Domain"**, agrega tu dominio
4. Sigue las instrucciones para el DNS

---

## 🔧 Solución de Problemas

### "Deploy failed"
- Revisa los logs en Render
- Asegúrate de que `package.json` esté en la raíz
- Verifica el `Start Command`: debe ser `node app.js`

### "Aplicación se reinicia constantemente"
- Revisa los logs de error en Render
- Verifica las variables de entorno
- Comprueba que PORT sea 3000

### "No puedo registrar usuarios"
- Asegúrate de `npm install` se ejecutó correctamente
- Verifica que SQLite3 se instaló: `npm list sqlite3`

### "API返回 404"
- Verifica que las rutas en `app.js` sean correctas
- Comprueba el `API_URL` en `public/js/main.js`

---

## 💡 Consejos

✅ **Para Desarrollo Local:**
```bash
npm run dev
```
Abre: http://localhost:3000

✅ **Para Producción (Render):**
```bash
git push origin main
```
Abre: https://tu-dominio.onrender.com

✅ **Ver Logs en Render:**
1. Ve a tu servicio
2. Haz clic en **"Logs"**
3. Verás todos los errores y eventos

---

## 🆘 ¿Más Ayuda?

- Documentación Render: https://render.com/docs
- Documentación Express: https://expressjs.com/
- Soporte: https://render.com/support

¡Tu ESP Device Manager está ahora en la nube! 🚀
