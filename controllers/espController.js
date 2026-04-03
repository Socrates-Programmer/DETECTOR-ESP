const db = require('../config/database');
const { createDeviceToken } = require('../middleware/auth');

const DEVICE_KEY_REGEX = /^[a-f0-9]{12}$/i;

function normalizeESPKey(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidESPKey(espKey) {
  return DEVICE_KEY_REGEX.test(espKey);
}

function getESPBindingByKey(espKey, callback) {
  db.get(
    `
      SELECT
        esps.id,
        esps.esp_key,
        esps.user_id,
        esps.registered_at,
        users.username,
        users.email
      FROM esps
      LEFT JOIN users ON users.id = esps.user_id
      WHERE esps.esp_key = ?
    `,
    [espKey],
    callback
  );
}

function buildBindingResponse(binding) {
  return {
    id: binding.id,
    esp_key: binding.esp_key,
    registered_at: binding.registered_at
  };
}

exports.bindESPKey = (req, res) => {
  const espKey = normalizeESPKey(req.body.esp_key);
  const userId = req.userId;

  if (!isValidESPKey(espKey)) {
    return res.status(400).json({
      error: 'La key del ESP debe tener 12 caracteres hexadecimales'
    });
  }

  getESPBindingByKey(espKey, (err, existingBinding) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (existingBinding) {
      if (existingBinding.user_id === userId) {
        return res.status(200).json({
          message: 'Esta key ya está vinculada a tu cuenta',
          alreadyLinked: true,
          binding: buildBindingResponse(existingBinding)
        });
      }

      return res.status(409).json({
        error: 'Esta key ya está vinculada a otra cuenta'
      });
    }

    db.run(
      'INSERT INTO esps (esp_key, user_id) VALUES (?, ?)',
      [espKey, userId],
      function insertBinding(insertErr) {
        if (insertErr) {
          if (insertErr.message.includes('UNIQUE')) {
            return res.status(409).json({
              error: 'Esta key ya está vinculada a otra cuenta'
            });
          }

          return res.status(500).json({ error: 'Error al guardar la key del ESP' });
        }

        return res.status(201).json({
          message: 'Key vinculada correctamente',
          binding: {
            id: this.lastID,
            esp_key: espKey,
            registered_at: new Date().toISOString()
          }
        });
      }
    );
  });
};

exports.getUserESPKeys = (req, res) => {
  const userId = req.userId;

  db.all(
    'SELECT id, esp_key, registered_at FROM esps WHERE user_id = ? ORDER BY registered_at DESC',
    [userId],
    (err, bindings) => {
      if (err) {
        return res.status(500).json({ error: 'Error en el servidor' });
      }

      return res.json(bindings || []);
    }
  );
};

exports.deleteESPKey = (req, res) => {
  const { esp_id } = req.params;
  const userId = req.userId;

  db.get('SELECT id FROM esps WHERE id = ? AND user_id = ?', [esp_id, userId], (err, binding) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (!binding) {
      return res.status(404).json({ error: 'Key no encontrada o sin permisos' });
    }

    db.run('DELETE FROM esps WHERE id = ?', [esp_id], (deleteErr) => {
      if (deleteErr) {
        return res.status(500).json({ error: 'Error al eliminar la key del ESP' });
      }

      return res.json({ message: 'Key eliminada correctamente' });
    });
  });
};

exports.checkESPKey = (req, res) => {
  const espKey = normalizeESPKey(req.body.esp_key);

  if (!isValidESPKey(espKey)) {
    return res.status(400).json({
      error: 'La key del ESP debe tener 12 caracteres hexadecimales'
    });
  }

  getESPBindingByKey(espKey, (err, binding) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (!binding) {
      return res.json({
        esp_key: espKey,
        registered: false,
        available: true,
        owned_by_current_user: false
      });
    }

    return res.json({
      esp_key: espKey,
      registered: true,
      available: false,
      owned_by_current_user: Boolean(req.userId && req.userId === binding.user_id)
    });
  });
};

exports.authenticateDeviceByKey = (req, res) => {
  const espKey = normalizeESPKey(req.body.esp_key);

  if (!isValidESPKey(espKey)) {
    return res.status(400).json({
      error: 'La key del ESP debe tener 12 caracteres hexadecimales'
    });
  }

  getESPBindingByKey(espKey, (err, binding) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (!binding) {
      return res.status(404).json({ error: 'ESP no vinculado a ninguna cuenta' });
    }

    const token = createDeviceToken(binding.user_id, binding.esp_key);

    return res.json({
      message: 'ESP autenticado correctamente',
      token,
      user: {
        id: binding.user_id,
        username: binding.username
      },
      esp: {
        esp_key: binding.esp_key
      }
    });
  });
};

// Alias de compatibilidad con el flujo anterior.
exports.registerESP = exports.bindESPKey;
exports.getUserESPs = exports.getUserESPKeys;
exports.deleteESP = exports.deleteESPKey;
exports.registerESPByKey = exports.checkESPKey;
