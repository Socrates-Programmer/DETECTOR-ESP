require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./config/database');

const authRoutes = require('./routes/auth');
const espRoutes = require('./routes/esp');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/esp', espRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function startServer() {
  try {
    await db.ready;

    app.listen(PORT, () => {
      console.log(`\nServidor ejecutandose en http://localhost:${PORT}`);
      console.log('Presiona Ctrl+C para detener el servidor\n');
    });
  } catch (error) {
    console.error('No se pudo iniciar la aplicacion:', error);
    process.exit(1);
  }
}

startServer();
