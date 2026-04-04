const express = require('express');
const router = express.Router();

const oauthController = require('../controllers/oauthController');
const { requireUserAuth } = require('../middleware/auth');

router.get('/providers', requireUserAuth, oauthController.getProviders);
router.put('/providers/:service', requireUserAuth, oauthController.saveProviderSetup);
router.post('/start', requireUserAuth, oauthController.startAuthorization);
router.post('/poll', requireUserAuth, oauthController.pollAuthorization);

router.get('/callback/google', oauthController.handleGoogleCallback);
router.get('/callback/spotify', oauthController.handleSpotifyCallback);

module.exports = router;
