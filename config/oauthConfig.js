const fs = require('fs');
const path = require('path');

const OAUTH_CONFIG_PATH = path.join(__dirname, '..', 'data', 'oauth-providers.json');

const PROVIDER_FIELDS = {
  google: ['client_id', 'client_secret'],
  github: ['client_id'],
  microsoft: ['client_id'],
  spotify: ['client_id']
};

const ENV_FIELD_MAP = {
  google: {
    client_id: 'GOOGLE_OAUTH_CLIENT_ID',
    client_secret: 'GOOGLE_OAUTH_CLIENT_SECRET'
  },
  github: {
    client_id: 'GITHUB_OAUTH_CLIENT_ID'
  },
  microsoft: {
    client_id: 'MICROSOFT_OAUTH_CLIENT_ID'
  },
  spotify: {
    client_id: 'SPOTIFY_OAUTH_CLIENT_ID'
  }
};

function emptyConfig() {
  return Object.keys(PROVIDER_FIELDS).reduce((result, service) => {
    result[service] = PROVIDER_FIELDS[service].reduce((fields, key) => {
      fields[key] = '';
      return fields;
    }, {});
    return result;
  }, {});
}

function ensureDataDirectory() {
  const dataDirectory = path.dirname(OAUTH_CONFIG_PATH);
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function sanitizeValue(value) {
  return String(value || '').trim();
}

function readStoredConfig() {
  ensureDataDirectory();

  if (!fs.existsSync(OAUTH_CONFIG_PATH)) {
    return emptyConfig();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, 'utf8'));
    const normalized = emptyConfig();

    Object.keys(PROVIDER_FIELDS).forEach((service) => {
      const source = parsed?.[service] || {};
      PROVIDER_FIELDS[service].forEach((field) => {
        normalized[service][field] = sanitizeValue(source[field]);
      });
    });

    return normalized;
  } catch (error) {
    return emptyConfig();
  }
}

function writeStoredConfig(config) {
  ensureDataDirectory();
  fs.writeFileSync(OAUTH_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function getMergedOAuthConfig() {
  const stored = readStoredConfig();

  return Object.keys(PROVIDER_FIELDS).reduce((result, service) => {
    result[service] = PROVIDER_FIELDS[service].reduce((fields, field) => {
      const envName = ENV_FIELD_MAP[service]?.[field];
      const envValue = envName ? sanitizeValue(process.env[envName]) : '';
      fields[field] = envValue || stored[service][field] || '';
      fields[`${field}_source`] = envValue ? 'env' : (stored[service][field] ? 'file' : 'none');
      return fields;
    }, {});
    return result;
  }, {});
}

function saveProviderConfig(service, payload) {
  const normalizedService = sanitizeValue(service).toLowerCase();
  if (!PROVIDER_FIELDS[normalizedService]) {
    throw new Error('Servicio OAuth no soportado.');
  }

  const stored = readStoredConfig();
  const nextProvider = { ...stored[normalizedService] };

  PROVIDER_FIELDS[normalizedService].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      return;
    }

    const nextValue = sanitizeValue(payload[field]);

    if (field === 'client_secret' && nextValue === '') {
      return;
    }

    nextProvider[field] = nextValue;
  });

  stored[normalizedService] = nextProvider;
  writeStoredConfig(stored);

  return getMergedOAuthConfig()[normalizedService];
}

module.exports = {
  PROVIDER_FIELDS,
  getMergedOAuthConfig,
  saveProviderConfig
};
