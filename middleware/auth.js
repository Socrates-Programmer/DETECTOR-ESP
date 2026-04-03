const jwt = require('jwt-simple');

const SECRET_KEY = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura_2024';
const USER_TOKEN_TTL_SECONDS = 60 * 60 * 12;
const DEVICE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function buildToken(payload, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);

  return jwt.encode(
    {
      ...payload,
      iat: now,
      exp: now + ttlSeconds
    },
    SECRET_KEY
  );
}

function decodeToken(token) {
  const decoded = jwt.decode(token, SECRET_KEY);
  const now = Math.floor(Date.now() / 1000);

  if (decoded.exp && decoded.exp < now) {
    throw new Error('TOKEN_EXPIRED');
  }

  return decoded;
}

function readBearerToken(req) {
  return req.headers.authorization?.split(' ')[1] || null;
}

const auth = (req, res, next) => {
  const token = readBearerToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = decodeToken(token);
    req.auth = decoded;
    req.userId = decoded.userId;
    req.authType = decoded.type || 'user';
    req.espKey = decoded.espKey || null;
    next();
  } catch (error) {
    if (error.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({ error: 'Token expirado' });
    }

    return res.status(401).json({ error: 'Token inválido' });
  }
};

const requireUserAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.authType !== 'user') {
      return res.status(403).json({ error: 'Se requiere una sesión de usuario' });
    }

    next();
  });
};

const optionalAuth = (req, res, next) => {
  const token = readBearerToken(req);

  if (!token) {
    return next();
  }

  try {
    const decoded = decodeToken(token);
    req.auth = decoded;
    req.userId = decoded.userId;
    req.authType = decoded.type || 'user';
    req.espKey = decoded.espKey || null;
  } catch (error) {
    req.auth = null;
    req.userId = null;
    req.authType = null;
    req.espKey = null;
  }

  next();
};

function createUserToken(userId) {
  return buildToken({ type: 'user', userId }, USER_TOKEN_TTL_SECONDS);
}

function createDeviceToken(userId, espKey) {
  return buildToken({ type: 'device', userId, espKey }, DEVICE_TOKEN_TTL_SECONDS);
}

module.exports = {
  auth,
  optionalAuth,
  requireUserAuth,
  SECRET_KEY,
  createUserToken,
  createDeviceToken
};
