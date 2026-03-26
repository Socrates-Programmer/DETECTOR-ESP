const db = require('../config/database');

// Registrar ESP
exports.registerESP = (req, res) => {
  const { esp_key, name } = req.body;
  const userId = req.userId;

  if (!esp_key) {
    return res.status(400).json({ error: 'ESP key requerida' });
  }

  // Verificar que el ESP key no esté registrado en otra cuenta
  db.get('SELECT * FROM esps WHERE esp_key = ?', [esp_key], (err, existingESP) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (existingESP) {
      return res.status(400).json({ error: 'Este ESP ya está registrado en otra cuenta' });
    }

    // Registrar el ESP
    db.run(
      'INSERT INTO esps (esp_key, user_id, name) VALUES (?, ?, ?)',
      [esp_key, userId, name || 'Mi ESP'],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Error al registrar ESP' });
        }

        res.status(201).json({
          message: 'ESP registrado exitosamente',
          esp_id: this.lastID,
          esp_key,
          name: name || 'Mi ESP'
        });
      }
    );
  });
};

// Obtener ESPs del usuario
exports.getUserESPs = (req, res) => {
  const userId = req.userId;

  db.all('SELECT id, esp_key, name, registered_at FROM esps WHERE user_id = ? ORDER BY registered_at DESC', [userId], (err, esps) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    res.json(esps || []);
  });
};

// Eliminar ESP
exports.deleteESP = (req, res) => {
  const { esp_id } = req.params;
  const userId = req.userId;

  // Verificar que el ESP pertenece al usuario
  db.get('SELECT * FROM esps WHERE id = ? AND user_id = ?', [esp_id, userId], (err, esp) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (!esp) {
      return res.status(404).json({ error: 'ESP no encontrado o no tienes permiso' });
    }

    db.run('DELETE FROM esps WHERE id = ?', [esp_id], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar ESP' });
      }

      res.json({ message: 'ESP eliminado exitosamente' });
    });
  });
};

// Registrar ESP por clave (para que el ESP se auto-registre)
exports.registerESPByKey = (req, res) => {
  const { esp_key } = req.body;

  if (!esp_key) {
    return res.status(400).json({ error: 'ESP key requerida' });
  }

  db.get('SELECT user_id FROM esps WHERE esp_key = ?', [esp_key], (err, esp) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (!esp) {
      return res.status(404).json({ error: 'ESP no registrado' });
    }

    res.json({
      message: 'ESP encontrado',
      esp_key,
      registered: true
    });
  });
};

// Actualizar nombre del ESP
exports.updateESP = (req, res) => {
  const { esp_id } = req.params;
  const { name } = req.body;
  const userId = req.userId;

  if (!name) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }

  db.get('SELECT * FROM esps WHERE id = ? AND user_id = ?', [esp_id, userId], (err, esp) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (!esp) {
      return res.status(404).json({ error: 'ESP no encontrado' });
    }

    db.run('UPDATE esps SET name = ? WHERE id = ?', [name, esp_id], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar ESP' });
      }

      res.json({ message: 'ESP actualizado exitosamente', name });
    });
  });
};
