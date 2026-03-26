const express = require('express');
const router = express.Router();
const espController = require('../controllers/espController');
const { auth } = require('../middleware/auth');

// Rutas protegidas (requieren autenticación)
router.post('/register', auth, espController.registerESP);
router.get('/my-esps', auth, espController.getUserESPs);
router.delete('/:esp_id', auth, espController.deleteESP);
router.put('/:esp_id', auth, espController.updateESP);

// Ruta pública para que ESP verifique si está registrado
router.post('/check-key', espController.registerESPByKey);

module.exports = router;
