const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireUserAuth } = require('../middleware/auth');

// Rutas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);

// Rutas protegidas
router.get('/user', requireUserAuth, authController.getUserInfo);

module.exports = router;
