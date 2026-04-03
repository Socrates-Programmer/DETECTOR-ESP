require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar configuración
require('./config/database');

// Importar rutas
const authRoutes = require('./routes/auth');
const espRoutes = require('./routes/esp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/esp', espRoutes);

// Ruta raíz - servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log('Presiona Ctrl+C para detener el servidor\n');
});
