const express = require('express');
const router = express.Router();
const espController = require('../controllers/espController');
const { optionalAuth, requireUserAuth } = require('../middleware/auth');

// Rutas del usuario para vincular keys únicas.
router.post('/bind', requireUserAuth, espController.bindESPKey);
router.get('/bindings', requireUserAuth, espController.getUserESPKeys);
router.delete('/bindings/:esp_id', requireUserAuth, espController.deleteESPKey);

// Alias de compatibilidad con la app anterior.
router.post('/register', requireUserAuth, espController.bindESPKey);
router.get('/my-esps', requireUserAuth, espController.getUserESPKeys);
router.delete('/:esp_id', requireUserAuth, espController.deleteESPKey);

// Rutas para validación y autenticación del ESP.
router.post('/check-key', optionalAuth, espController.checkESPKey);
router.post('/device-auth', espController.authenticateDeviceByKey);

module.exports = router;
