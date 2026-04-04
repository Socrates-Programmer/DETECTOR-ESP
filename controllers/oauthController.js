const crypto = require('crypto');
const { getMergedOAuthConfig, saveProviderConfig } = require('../config/oauthConfig');

const OAUTH_SESSION_TTL_MS = 20 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const oauthSessions = new Map();

setInterval(() => {
  const now = Date.now();
  oauthSessions.forEach((session, sessionId) => {
    if ((session.expiresAt || 0) <= now) {
      oauthSessions.delete(sessionId);
    }
  });
}, 60 * 1000).unref();

function normalizeService(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeScopes(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function normalizeTenant(value) {
  return String(value || '').trim() || 'common';
}

function getBaseUrl(req) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol;
  return `${protocol}://${req.get('host')}`;
}

function buildProviderConfigs(req) {
  const baseUrl = getBaseUrl(req);
  const storedConfig = getMergedOAuthConfig();

  return {
    google: {
      configured: Boolean(storedConfig.google.client_id && storedConfig.google.client_secret),
      mode: 'popup',
      title: 'Google',
      clientId: storedConfig.google.client_id || '',
      clientSecret: storedConfig.google.client_secret || '',
      fieldSources: {
        client_id: storedConfig.google.client_id_source,
        client_secret: storedConfig.google.client_secret_source
      },
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      deviceCodeUrl: 'https://oauth2.googleapis.com/device/code',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      callbackUrl: `${baseUrl}/api/oauth/callback/google`,
      defaults: {
        scopes: 'openid email profile'
      }
    },
    github: {
      configured: Boolean(storedConfig.github.client_id),
      mode: 'device',
      title: 'GitHub',
      clientId: storedConfig.github.client_id || '',
      fieldSources: {
        client_id: storedConfig.github.client_id_source
      },
      deviceCodeUrl: 'https://github.com/login/device/code',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      callbackUrl: '',
      defaults: {
        scopes: 'read:user user:email'
      }
    },
    microsoft: {
      configured: Boolean(storedConfig.microsoft.client_id),
      mode: 'device',
      title: 'Microsoft',
      clientId: storedConfig.microsoft.client_id || '',
      fieldSources: {
        client_id: storedConfig.microsoft.client_id_source
      },
      deviceCodeUrl: (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`,
      tokenUrl: (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      callbackUrl: '',
      defaults: {
        scopes: 'openid profile email offline_access User.Read',
        tenant: 'common'
      }
    },
    spotify: {
      configured: Boolean(storedConfig.spotify.client_id),
      mode: 'popup',
      title: 'Spotify',
      clientId: storedConfig.spotify.client_id || '',
      fieldSources: {
        client_id: storedConfig.spotify.client_id_source
      },
      authorizeUrl: 'https://accounts.spotify.com/authorize',
      tokenUrl: 'https://accounts.spotify.com/api/token',
      callbackUrl: `${baseUrl}/api/oauth/callback/spotify`,
      defaults: {
        scopes: 'user-read-email'
      }
    }
  };
}

function getProviderConfig(req, service) {
  return buildProviderConfigs(req)[normalizeService(service)] || null;
}

function serializeProviderAvailability(req) {
  const configs = buildProviderConfigs(req);
  return Object.entries(configs).reduce((result, [service, config]) => {
    const requiresSecret = service === 'google';
    const requiredFields = requiresSecret
      ? ['client_id', 'client_secret']
      : ['client_id'];
    const missingFields = requiredFields.filter((field) => {
      if (field === 'client_secret') {
        return !config.clientSecret;
      }
      return !config.clientId;
    });

    result[service] = {
      configured: config.configured,
      mode: config.mode,
      title: config.title,
      callback_url: config.callbackUrl || '',
      required_fields: requiredFields,
      missing_fields: missingFields,
      client_id: config.clientId || '',
      has_client_secret: Boolean(config.clientSecret),
      field_sources: config.fieldSources || {}
    };
    return result;
  }, {});
}

function createSession(session) {
  const sessionId = crypto.randomUUID();
  oauthSessions.set(sessionId, {
    ...session,
    sessionId,
    createdAt: Date.now()
  });
  return sessionId;
}

function getSession(sessionId) {
  const session = oauthSessions.get(sessionId);
  if (!session) {
    return null;
  }

  if ((session.expiresAt || 0) <= Date.now()) {
    oauthSessions.delete(sessionId);
    return null;
  }

  return session;
}

function deleteSession(sessionId) {
  oauthSessions.delete(sessionId);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  return { response, data };
}

async function postFormJson(url, body, extraHeaders = {}) {
  return fetchJson(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...extraHeaders
    },
    body: new URLSearchParams(body)
  });
}

function buildTokenPayload(service, tokenResponse, fallbackScopes) {
  const expiresIn = Number.parseInt(tokenResponse.expires_in, 10);
  const expiresAt = Number.isFinite(expiresIn)
    ? Math.floor(Date.now() / 1000) + expiresIn
    : 0;

  return {
    service,
    access_token: String(tokenResponse.access_token || ''),
    refresh_token: String(tokenResponse.refresh_token || ''),
    token_type: String(tokenResponse.token_type || 'Bearer'),
    scope: normalizeScopes(tokenResponse.scope || tokenResponse.scopes || fallbackScopes || ''),
    expires_at: expiresAt,
    expires_in: Number.isFinite(expiresIn) ? expiresIn : 0
  };
}

function buildPopupResponseHtml({ sessionId, ok, error, token }) {
  const payload = JSON.stringify({
    type: 'klaus-oauth-result',
    session_id: sessionId,
    ok,
    error: error || '',
    token: token || null
  });

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>KLAUS OAuth</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", sans-serif;
      background: #0c1520;
      color: #f4f7fb;
    }
    .card {
      width: min(28rem, calc(100% - 2rem));
      padding: 1.5rem;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
      text-align: center;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${ok ? 'Cuenta conectada' : 'No se pudo completar el login'}</h1>
    <p>${ok ? 'Puedes volver a la ventana principal de KLAUS.' : 'Esta ventana se cerrara automaticamente en unos segundos.'}</p>
  </div>
  <script>
    (function () {
      const payload = ${payload};
      if (window.opener && window.opener !== window) {
        window.opener.postMessage(payload, window.location.origin);
      }
      window.setTimeout(function () {
        window.close();
      }, 1200);
    }());
  </script>
</body>
</html>`;
}

async function startGoogleDeviceFlow(req, res, config, payload) {
  const scopes = normalizeScopes(payload.scopes || config.defaults.scopes);
  const { response, data } = await postFormJson(config.deviceCodeUrl, {
    client_id: config.clientId,
    scope: scopes
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error_description || data.error || 'No se pudo iniciar el flujo OAuth de Google.'
    });
  }

  const sessionId = createSession({
    type: 'device',
    provider: 'google',
    userId: req.userId,
    accountId: String(payload.account_id || ''),
    scopes,
    deviceCode: data.device_code,
    intervalSeconds: Number.parseInt(data.interval, 10) || DEFAULT_POLL_INTERVAL_SECONDS,
    expiresAt: Date.now() + ((Number.parseInt(data.expires_in, 10) || 900) * 1000)
  });

  return res.json({
    session_id: sessionId,
    mode: 'device',
    service: 'google',
    verification_uri: data.verification_url,
    verification_uri_complete: data.verification_url,
    user_code: data.user_code,
    interval: Number.parseInt(data.interval, 10) || DEFAULT_POLL_INTERVAL_SECONDS,
    expires_in: Number.parseInt(data.expires_in, 10) || 900
  });
}

async function startGooglePopupFlow(req, res, config, payload) {
  const scopes = normalizeScopes(payload.scopes || config.defaults.scopes);
  const loginHint = String(payload.login_hint || '').trim();
  const sessionId = createSession({
    type: 'popup',
    provider: 'google',
    userId: req.userId,
    accountId: String(payload.account_id || ''),
    scopes,
    redirectUri: config.callbackUrl,
    expiresAt: Date.now() + (10 * 60 * 1000)
  });

  const authorizationUrl = new URL(config.authorizeUrl);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: scopes,
    state: sessionId,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent'
  }).toString();

  if (loginHint) {
    authorizationUrl.searchParams.set('login_hint', loginHint);
  }

  return res.json({
    session_id: sessionId,
    mode: 'popup',
    service: 'google',
    authorization_url: authorizationUrl.toString(),
    expires_in: 600
  });
}

async function startGitHubDeviceFlow(req, res, config, payload) {
  const scopes = normalizeScopes(payload.scopes || config.defaults.scopes);
  const { response, data } = await postFormJson(config.deviceCodeUrl, {
    client_id: config.clientId,
    scope: scopes
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error_description || data.error || 'No se pudo iniciar el flujo OAuth de GitHub.'
    });
  }

  const sessionId = createSession({
    type: 'device',
    provider: 'github',
    userId: req.userId,
    accountId: String(payload.account_id || ''),
    scopes,
    deviceCode: data.device_code,
    intervalSeconds: Number.parseInt(data.interval, 10) || DEFAULT_POLL_INTERVAL_SECONDS,
    expiresAt: Date.now() + ((Number.parseInt(data.expires_in, 10) || 900) * 1000)
  });

  return res.json({
    session_id: sessionId,
    mode: 'device',
    service: 'github',
    verification_uri: data.verification_uri,
    user_code: data.user_code,
    interval: Number.parseInt(data.interval, 10) || DEFAULT_POLL_INTERVAL_SECONDS,
    expires_in: Number.parseInt(data.expires_in, 10) || 900
  });
}

async function startMicrosoftDeviceFlow(req, res, config, payload) {
  const scopes = normalizeScopes(payload.scopes || config.defaults.scopes);
  const tenant = normalizeTenant(payload.tenant || config.defaults.tenant);
  const { response, data } = await postFormJson(config.deviceCodeUrl(tenant), {
    client_id: config.clientId,
    scope: scopes
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error_description || data.error || 'No se pudo iniciar el flujo OAuth de Microsoft.'
    });
  }

  const sessionId = createSession({
    type: 'device',
    provider: 'microsoft',
    userId: req.userId,
    accountId: String(payload.account_id || ''),
    scopes,
    tenant,
    deviceCode: data.device_code,
    intervalSeconds: Number.parseInt(data.interval, 10) || DEFAULT_POLL_INTERVAL_SECONDS,
    expiresAt: Date.now() + ((Number.parseInt(data.expires_in, 10) || 900) * 1000)
  });

  return res.json({
    session_id: sessionId,
    mode: 'device',
    service: 'microsoft',
    verification_uri: data.verification_uri,
    message: data.message || '',
    user_code: data.user_code,
    interval: Number.parseInt(data.interval, 10) || DEFAULT_POLL_INTERVAL_SECONDS,
    expires_in: Number.parseInt(data.expires_in, 10) || 900
  });
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

async function startSpotifyPopupFlow(req, res, config, payload) {
  const scopes = normalizeScopes(payload.scopes || config.defaults.scopes);
  const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
  const sessionId = createSession({
    type: 'popup',
    provider: 'spotify',
    userId: req.userId,
    accountId: String(payload.account_id || ''),
    scopes,
    codeVerifier,
    redirectUri: config.callbackUrl,
    expiresAt: Date.now() + (10 * 60 * 1000)
  });

  const authorizationUrl = new URL(config.authorizeUrl);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.callbackUrl,
    scope: scopes,
    state: sessionId,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    show_dialog: 'true'
  }).toString();

  return res.json({
    session_id: sessionId,
    mode: 'popup',
    service: 'spotify',
    authorization_url: authorizationUrl.toString(),
    expires_in: 600
  });
}

exports.getProviders = (req, res) => {
  return res.json(serializeProviderAvailability(req));
};

exports.saveProviderSetup = (req, res) => {
  try {
    const service = normalizeService(req.params.service);
    const payload = {
      client_id: req.body.client_id,
      client_secret: req.body.client_secret
    };

    saveProviderConfig(service, payload);

    return res.json({
      ok: true,
      service,
      provider: serializeProviderAvailability(req)[service]
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || 'No se pudo guardar la configuracion OAuth.'
    });
  }
};

exports.startAuthorization = async (req, res) => {
  try {
    const service = normalizeService(req.body.service);
    const config = getProviderConfig(req, service);

    if (!config) {
      return res.status(400).json({ error: 'Servicio OAuth no soportado.' });
    }

    if (!config.configured) {
      return res.status(503).json({
        error: `El servicio ${config.title} todavia no esta configurado en el servidor.`
      });
    }

    const payload = {
      account_id: String(req.body.account_id || '').trim(),
      scopes: req.body.scopes || config.defaults.scopes,
      tenant: req.body.tenant || config.defaults.tenant || '',
      login_hint: String(req.body.login_hint || '').trim()
    };

    if (!payload.account_id) {
      return res.status(400).json({ error: 'Falta el account_id del ESP.' });
    }

    if (service === 'google') {
      return await startGooglePopupFlow(req, res, config, payload);
    }
    if (service === 'github') {
      return await startGitHubDeviceFlow(req, res, config, payload);
    }
    if (service === 'microsoft') {
      return await startMicrosoftDeviceFlow(req, res, config, payload);
    }
    if (service === 'spotify') {
      return await startSpotifyPopupFlow(req, res, config, payload);
    }

    return res.status(400).json({ error: 'Servicio OAuth no soportado.' });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'No se pudo iniciar el flujo OAuth.'
    });
  }
};

exports.pollAuthorization = async (req, res) => {
  try {
    const sessionId = String(req.body.session_id || '').trim();
    const session = getSession(sessionId);

    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'La sesion OAuth no existe o ya expiro.' });
    }

    if (session.type !== 'device') {
      return res.status(400).json({ error: 'Esta sesion no usa device flow.' });
    }

    const config = getProviderConfig(req, session.provider);
    if (!config || !config.configured) {
      deleteSession(sessionId);
      return res.status(503).json({ error: 'El proveedor OAuth ya no esta configurado.' });
    }

    let tokenRequest = null;

    if (session.provider === 'google') {
      tokenRequest = await postFormJson(config.tokenUrl, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        device_code: session.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });
    } else if (session.provider === 'github') {
      tokenRequest = await postFormJson(config.tokenUrl, {
        client_id: config.clientId,
        device_code: session.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });
    } else if (session.provider === 'microsoft') {
      tokenRequest = await postFormJson(config.tokenUrl(session.tenant), {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: config.clientId,
        device_code: session.deviceCode
      });
    } else {
      return res.status(400).json({ error: 'Servicio OAuth no soportado para polling.' });
    }

    const { response, data } = tokenRequest;

    if (response.ok && data.access_token) {
      const token = buildTokenPayload(session.provider, data, session.scopes);
      deleteSession(sessionId);
      return res.json({
        status: 'authorized',
        token
      });
    }

    const reason = data.error || data.error_code || 'authorization_pending';
    if (reason === 'authorization_pending' || reason === 'slow_down') {
      return res.json({
        status: reason,
        interval: Number.parseInt(data.interval, 10) || session.intervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS
      });
    }

    if (reason === 'expired_token' || reason === 'expired_token ') {
      deleteSession(sessionId);
      return res.status(410).json({ error: 'La autorizacion expiro. Inicia el proceso otra vez.' });
    }

    if (reason === 'authorization_declined' || reason === 'access_denied') {
      deleteSession(sessionId);
      return res.status(403).json({ error: 'El usuario rechazo la autorizacion.' });
    }

    return res.status(response.status || 400).json({
      error: data.error_description || reason || 'No se pudo completar la autorizacion OAuth.'
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'No se pudo consultar el estado del login OAuth.'
    });
  }
};

exports.handleSpotifyCallback = async (req, res) => {
  const sessionId = String(req.query.state || '').trim();
  const session = getSession(sessionId);

  if (!session || session.provider !== 'spotify') {
    return res.status(400).send(buildPopupResponseHtml({
      sessionId,
      ok: false,
      error: 'La sesion de Spotify ya no existe o expiro.'
    }));
  }

  if (req.query.error) {
    deleteSession(sessionId);
    return res.status(400).send(buildPopupResponseHtml({
      sessionId,
      ok: false,
      error: String(req.query.error)
    }));
  }

  try {
    const config = getProviderConfig(req, 'spotify');
    const { response, data } = await postFormJson(config.tokenUrl, {
      client_id: config.clientId,
      grant_type: 'authorization_code',
      code: String(req.query.code || ''),
      redirect_uri: session.redirectUri,
      code_verifier: session.codeVerifier
    });

    if (!response.ok || !data.access_token) {
      deleteSession(sessionId);
      return res.status(response.status || 400).send(buildPopupResponseHtml({
        sessionId,
        ok: false,
        error: data.error_description || data.error || 'Spotify no devolvio un access token.'
      }));
    }

    const token = buildTokenPayload('spotify', data, session.scopes);
    deleteSession(sessionId);
    return res.send(buildPopupResponseHtml({
      sessionId,
      ok: true,
      token
    }));
  } catch (error) {
    deleteSession(sessionId);
    return res.status(500).send(buildPopupResponseHtml({
      sessionId,
      ok: false,
      error: error.message || 'No se pudo completar el callback de Spotify.'
    }));
  }
};

exports.handleGoogleCallback = async (req, res) => {
  const sessionId = String(req.query.state || '').trim();
  const session = getSession(sessionId);

  if (!session || session.provider !== 'google') {
    return res.status(400).send(buildPopupResponseHtml({
      sessionId,
      ok: false,
      error: 'La sesion de Google ya no existe o expiro.'
    }));
  }

  if (req.query.error) {
    deleteSession(sessionId);
    return res.status(400).send(buildPopupResponseHtml({
      sessionId,
      ok: false,
      error: String(req.query.error)
    }));
  }

  try {
    const config = getProviderConfig(req, 'google');
    const { response, data } = await postFormJson(config.tokenUrl, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code: String(req.query.code || ''),
      redirect_uri: session.redirectUri
    });

    if (!response.ok || !data.access_token) {
      deleteSession(sessionId);
      return res.status(response.status || 400).send(buildPopupResponseHtml({
        sessionId,
        ok: false,
        error: data.error_description || data.error || 'Google no devolvio un access token.'
      }));
    }

    const token = buildTokenPayload('google', data, session.scopes);
    deleteSession(sessionId);
    return res.send(buildPopupResponseHtml({
      sessionId,
      ok: true,
      token
    }));
  } catch (error) {
    deleteSession(sessionId);
    return res.status(500).send(buildPopupResponseHtml({
      sessionId,
      ok: false,
      error: error.message || 'No se pudo completar el callback de Google.'
    }));
  }
};
