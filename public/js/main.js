const SERIAL_BAUD_RATE = 115200;
const KLAUS_PROTOCOL_PREFIX = 'KLAUS';
const KLAUS_PROTOCOL_VERSION = '1';
const VAULT_OPERATION_TIMEOUT_MS = 30000;
const ACCOUNTS_OPERATION_TIMEOUT_MS = 10000;
const DEVICE_KEY_PATTERN = /^[a-f0-9]{12}$/i;
const SERIAL_PORT_HINT_STORAGE_KEY = 'klaus.serial-port-hint';
const ESP_USB_VENDOR_IDS = new Set([0x303A, 0x10C4, 0x1A86, 0x0403, 0x067B]);

const SERVICE_OPTIONS = {
  google: {
    label: 'Google',
    url: 'https://accounts.google.com/ServiceLogin'
  },
  netflix: {
    label: 'Netflix',
    url: 'https://www.netflix.com/login'
  },
  youtube: {
    label: 'YouTube',
    url: 'https://accounts.google.com/ServiceLogin?service=youtube'
  },
  facebook: {
    label: 'Facebook',
    url: 'https://www.facebook.com/login'
  },
  instagram: {
    label: 'Instagram',
    url: 'https://www.instagram.com/accounts/login'
  }
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const state = {
  port: null,
  reader: null,
  serialBuffer: '',
  serialLines: [],
  deviceInfo: null,
  accounts: [],
  requestSequence: 0,
  pendingRequests: new Map(),
  authorizedPortsCount: 0,
  autoConnectInProgress: false
};

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  resetSerialLog();
  applyServiceDefaults();
  setSerialCapabilityState();
  syncVaultView();
  void bootstrap();
});

async function bootstrap() {
  await refreshAuthorizedPortsState();
  await tryAutoConnectAuthorizedPort();
}

function cacheElements() {
  elements.serialSupport = document.getElementById('serialSupport');
  elements.connectUsbBtn = document.getElementById('connectUsbBtn');
  elements.disconnectUsbBtn = document.getElementById('disconnectUsbBtn');
  elements.refreshDeviceBtn = document.getElementById('refreshDeviceBtn');
  elements.usbStatus = document.getElementById('usbStatus');
  elements.deviceKeyValue = document.getElementById('deviceKeyValue');
  elements.deviceConsoleValue = document.getElementById('deviceConsoleValue');
  elements.deviceBleValue = document.getElementById('deviceBleValue');
  elements.vaultStateValue = document.getElementById('vaultStateValue');
  elements.deviceAccountsValue = document.getElementById('deviceAccountsValue');
  elements.vaultStateNotice = document.getElementById('vaultStateNotice');
  elements.vaultCreateForm = document.getElementById('vaultCreateForm');
  elements.vaultOwnerName = document.getElementById('vaultOwnerName');
  elements.vaultPin = document.getElementById('vaultPin');
  elements.vaultPhrase = document.getElementById('vaultPhrase');
  elements.vaultUnlockForm = document.getElementById('vaultUnlockForm');
  elements.unlockPin = document.getElementById('unlockPin');
  elements.unlockPhrase = document.getElementById('unlockPhrase');
  elements.vaultActionBar = document.getElementById('vaultActionBar');
  elements.lockVaultBtn = document.getElementById('lockVaultBtn');
  elements.wipeVaultBtn = document.getElementById('wipeVaultBtn');
  elements.accountsSection = document.getElementById('accountsSection');
  elements.accountsStatus = document.getElementById('accountsStatus');
  elements.deviceAccountForm = document.getElementById('deviceAccountForm');
  elements.accountService = document.getElementById('accountService');
  elements.accountEmail = document.getElementById('accountEmail');
  elements.accountPassword = document.getElementById('accountPassword');
  elements.accountUrl = document.getElementById('accountUrl');
  elements.deviceAccountsEmpty = document.getElementById('deviceAccountsEmpty');
  elements.deviceAccountsList = document.getElementById('deviceAccountsList');
  elements.serialLog = document.getElementById('serialLog');
  elements.alert = document.getElementById('alert');
}

function bindEvents() {
  elements.connectUsbBtn.addEventListener('click', () => {
    void connectUSB();
  });

  elements.disconnectUsbBtn.addEventListener('click', () => {
    void disconnectUSB();
  });

  elements.refreshDeviceBtn.addEventListener('click', () => {
    void refreshDeviceSnapshot();
  });

  elements.vaultCreateForm.addEventListener('submit', (event) => {
    void handleVaultCreate(event);
  });

  elements.vaultUnlockForm.addEventListener('submit', (event) => {
    void handleVaultUnlock(event);
  });

  elements.lockVaultBtn.addEventListener('click', () => {
    void handleVaultLock();
  });

  elements.wipeVaultBtn.addEventListener('click', () => {
    void handleVaultWipe();
  });

  elements.accountService.addEventListener('change', () => {
    applyServiceDefaults();
  });

  elements.deviceAccountForm.addEventListener('submit', (event) => {
    void handleDeviceAccountCreate(event);
  });

  elements.deviceAccountsList.addEventListener('click', (event) => {
    void handleAccountListClick(event);
  });

  if ('serial' in navigator && typeof navigator.serial.addEventListener === 'function') {
    navigator.serial.addEventListener('connect', () => {
      void handlePortConnected();
    });

    navigator.serial.addEventListener('disconnect', () => {
      void handlePortDisconnected();
    });
  }
}

function applyServiceDefaults() {
  const service = elements.accountService.value;
  const config = SERVICE_OPTIONS[service];
  if (!config) {
    return;
  }

  elements.accountUrl.value = config.url;
}

function setSerialCapabilityState() {
  if (!('serial' in navigator)) {
    elements.serialSupport.textContent = 'Usa Chrome o Edge.';
    elements.serialSupport.className = 'status-chip status-box-error';
    setUSBStatus('Web Serial no esta disponible en este navegador.', 'error');
    elements.connectUsbBtn.disabled = true;
    return;
  }

  renderSerialCapabilityState();
}

function renderSerialCapabilityState() {
  if (!('serial' in navigator)) {
    return;
  }

  if (state.port) {
    elements.serialSupport.textContent = 'ESP conectado.';
  } else if (state.authorizedPortsCount > 0) {
    elements.serialSupport.textContent = state.authorizedPortsCount === 1
      ? 'ESP autorizado listo para reconexion.'
      : `${state.authorizedPortsCount} puertos autorizados.`;
  } else {
    elements.serialSupport.textContent = 'Listo para conectar el ESP.';
  }

  elements.serialSupport.className = 'status-chip status-chip-info';
  updateUSBButtons(Boolean(state.port));
}

function updateUSBButtons(connected) {
  elements.connectUsbBtn.disabled = !('serial' in navigator) || connected || state.autoConnectInProgress;
  elements.disconnectUsbBtn.disabled = !connected;
  elements.refreshDeviceBtn.disabled = !connected;
}

function loadPreferredPortHint() {
  try {
    const raw = localStorage.getItem(SERIAL_PORT_HINT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function savePreferredPortHint(port) {
  const info = getPortInfo(port);
  if (!info.usbVendorId && !info.usbProductId) {
    return;
  }

  localStorage.setItem(SERIAL_PORT_HINT_STORAGE_KEY, JSON.stringify({
    usbVendorId: info.usbVendorId || null,
    usbProductId: info.usbProductId || null
  }));
}

function getPortInfo(port) {
  if (!port || typeof port.getInfo !== 'function') {
    return {};
  }

  return port.getInfo() || {};
}

function isLikelyEspPort(port) {
  const info = getPortInfo(port);
  return ESP_USB_VENDOR_IDS.has(info.usbVendorId || -1);
}

function portMatchesHint(port, hint) {
  if (!hint) {
    return false;
  }

  const info = getPortInfo(port);
  return info.usbVendorId === hint.usbVendorId && info.usbProductId === hint.usbProductId;
}

function chooseAuthorizedPort(ports) {
  if (!Array.isArray(ports) || ports.length === 0) {
    return { port: null, ambiguous: false };
  }

  const hint = loadPreferredPortHint();
  if (hint) {
    const hintedPort = ports.find((port) => portMatchesHint(port, hint));
    if (hintedPort) {
      return { port: hintedPort, ambiguous: false };
    }
  }

  const espPorts = ports.filter((port) => isLikelyEspPort(port));
  if (espPorts.length === 1) {
    return { port: espPorts[0], ambiguous: false };
  }

  if (ports.length === 1) {
    return { port: ports[0], ambiguous: false };
  }

  return { port: null, ambiguous: true };
}

async function refreshAuthorizedPortsState() {
  if (!('serial' in navigator)) {
    state.authorizedPortsCount = 0;
    return [];
  }

  try {
    const ports = await navigator.serial.getPorts();
    state.authorizedPortsCount = ports.length;
    renderSerialCapabilityState();
    return ports;
  } catch (error) {
    state.authorizedPortsCount = 0;
    renderSerialCapabilityState();
    return [];
  }
}

async function tryAutoConnectAuthorizedPort() {
  if (!('serial' in navigator) || state.port || state.autoConnectInProgress) {
    return 'none';
  }

  const ports = await refreshAuthorizedPortsState();
  if (ports.length === 0) {
    return 'none';
  }

  const { port, ambiguous } = chooseAuthorizedPort(ports);
  if (!port) {
    if (ambiguous) {
      setUSBStatus('Hay varios puertos autorizados. Pulsa Conectar ESP.', 'info');
      return 'ambiguous';
    }
    return 'none';
  }

  state.autoConnectInProgress = true;
  renderSerialCapabilityState();

  try {
    const opened = await openUSBPort(port, 'auto');
    return opened ? 'connected' : 'failed';
  } finally {
    state.autoConnectInProgress = false;
    renderSerialCapabilityState();
  }
}

async function connectUSB() {
  if (!('serial' in navigator)) {
    showAlert('Tu navegador no soporta Web Serial.', 'error');
    return;
  }

  const autoStatus = await tryAutoConnectAuthorizedPort();
  if (autoStatus === 'connected' || autoStatus === 'failed') {
    return;
  }

  try {
    const port = await navigator.serial.requestPort();
    await refreshAuthorizedPortsState();
    await openUSBPort(port, 'manual');
  } catch (error) {
    if (error?.name !== 'NotFoundError') {
      showAlert('No fue posible abrir el puerto USB.', 'error');
    }
  }
}

async function openUSBPort(port, source = 'manual') {
  if (!port) {
    return false;
  }

  if (state.port === port) {
    return true;
  }

  try {
    resetSerialLog();
    state.serialBuffer = '';
    await port.open({ baudRate: SERIAL_BAUD_RATE });
    state.port = port;
    savePreferredPortHint(port);
    await refreshAuthorizedPortsState();
    appendSerialLog(`[usb] Puerto ${source === 'auto' ? 'reconectado' : 'abierto'} a ${SERIAL_BAUD_RATE} baudios`);
    setUSBStatus(source === 'auto' ? 'ESP detectado. Reconectando...' : 'Puerto conectado. Consultando estado...', 'info');
    syncVaultView();
    void startSerialReader();
    await wait(250);
    await refreshDeviceSnapshot();
    return true;
  } catch (error) {
    state.port = null;
    renderSerialCapabilityState();
    setUSBStatus('No fue posible abrir el puerto USB.', 'error');
    return false;
  }
}

async function startSerialReader() {
  if (!state.port || !state.port.readable) {
    return;
  }

  while (state.port && state.port.readable) {
    const reader = state.port.readable.getReader();
    state.reader = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (value) {
          processSerialChunk(decoder.decode(value, { stream: true }));
        }
      }
    } catch (error) {
      appendSerialLog('[usb] El puerto se desconecto o dejo de responder');
    } finally {
      if (state.reader === reader) {
        state.reader = null;
      }
      reader.releaseLock();
    }

    break;
  }
}

function processSerialChunk(chunk) {
  state.serialBuffer += chunk;
  const lines = state.serialBuffer.split(/\r?\n/);
  state.serialBuffer = lines.pop() || '';

  lines.forEach((line) => {
    const cleanLine = line.trim();
    if (!cleanLine) {
      return;
    }

    appendSerialLog(cleanLine);
    const frame = parseProtocolFrame(cleanLine);
    if (frame) {
      handleProtocolFrame(frame);
    }
  });
}

function parseProtocolFrame(line) {
  if (!line.startsWith(`${KLAUS_PROTOCOL_PREFIX}|${KLAUS_PROTOCOL_VERSION}|`)) {
    return null;
  }

  const parts = line.split('|');
  if (parts.length < 5) {
    return null;
  }

  return {
    raw: line,
    requestId: parts[2],
    kind: parts[3],
    status: parts[4],
    params: parts.slice(5)
  };
}

function handleProtocolFrame(frame) {
  applyProtocolFrameSideEffects(frame);

  const pending = state.pendingRequests.get(frame.requestId);
  if (!pending) {
    return;
  }

  if (frame.status === 'ERR') {
    clearTimeout(pending.timeoutId);
    state.pendingRequests.delete(frame.requestId);
    pending.reject(new Error(protocolErrorMessage(frame)));
    return;
  }

  if (pending.collectUntilKind) {
    pending.frames.push(frame);
    if (frame.kind === pending.collectUntilKind) {
      clearTimeout(pending.timeoutId);
      state.pendingRequests.delete(frame.requestId);
      pending.resolve(pending.frames.slice());
    }
    return;
  }

  clearTimeout(pending.timeoutId);
  state.pendingRequests.delete(frame.requestId);
  pending.resolve(frame);
}

function applyProtocolFrameSideEffects(frame) {
  if (frame.kind === 'HELLO' || frame.kind === 'INFO' || frame.kind === 'SESSION') {
    const payload = parseKeyValuePayload(frame.params[0] || '');
    state.deviceInfo = buildDeviceInfo(payload, state.deviceInfo);
    syncVaultView();
    return;
  }

  if (frame.kind === 'DEVICE_ID') {
    const payload = parseKeyValuePayload(frame.params[0] || '');
    const nextId = normalizeDeviceId(payload.device_id);
    if (!state.deviceInfo) {
      state.deviceInfo = buildDeviceInfo({});
    }
    state.deviceInfo.device_id = nextId;
    syncVaultView();
  }
}

function parseKeyValuePayload(payload) {
  return String(payload || '')
    .split(';')
    .filter(Boolean)
    .reduce((result, pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        return result;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      result[key] = value;
      return result;
    }, {});
}

function buildDeviceInfo(payload, base = null) {
  const source = payload || {};
  const previous = base || {};

  return {
    device_id: normalizeDeviceId(source.device_id || previous.device_id || ''),
    console: String(source.console || previous.console || '').trim(),
    ble: parseFlag(source.ble, previous.ble),
    autofill_ready: parseFlag(source.autofill_ready, previous.autofill_ready),
    vault_exists: parseFlag(source.vault_exists, previous.vault_exists),
    vault_unlocked: parseFlag(source.vault_unlocked, previous.vault_unlocked),
    total_accounts: parseInteger(source.accounts, previous.total_accounts || 0),
    total_rotations: parseInteger(source.rotations, previous.total_rotations || 0)
  };
}

function parseFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return Boolean(fallback);
  }

  return value === '1' || value === 'true' || value === 'yes';
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDeviceId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-fA-F0-9]/g, '')
    .slice(0, 12)
    .toLowerCase();
}

function formatDeviceId(value) {
  return value ? value.toUpperCase() : 'Sin detectar';
}

function describeVaultState() {
  if (!state.port) {
    return 'Sin conexion';
  }

  if (!state.deviceInfo) {
    return 'Sin leer';
  }

  if (!state.deviceInfo.vault_exists) {
    return 'Sin vault';
  }

  if (!state.deviceInfo.vault_unlocked) {
    return 'Bloqueado';
  }

  return 'Desbloqueado';
}

function protocolErrorMessage(frame) {
  const payload = parseKeyValuePayload(frame.params[0] || '');
  const reason = payload.reason || 'operation_failed';

  switch (reason) {
    case 'invalid_create_payload':
      return 'Los datos del vault no son validos.';
    case 'invalid_unlock_payload':
      return 'El PIN o la frase secreta no son validos.';
    case 'invalid_account_payload':
      return 'Los datos de la cuenta no son validos.';
    case 'missing_account_id':
      return 'Falta el identificador de la cuenta.';
    case 'account_not_found':
      return 'La cuenta no existe en el ESP.';
    case 'vault_not_found':
      return 'El vault no existe.';
    case 'vault_exists':
      return 'Ese ESP ya tiene un vault.';
    case 'vault_locked':
      return 'El vault esta bloqueado.';
    case 'wrong_pin':
      return 'PIN o frase incorrectos.';
    case 'rate_limited':
      return 'Demasiados intentos. Espera un momento.';
    case 'wipe_required':
      return 'El ESP exige borrar el vault antes de continuar.';
    case 'not_initialized':
      return 'El ESP todavia no esta listo.';
    default:
      return `El ESP respondio con error: ${reason}`;
  }
}

async function requestDeviceKey() {
  const frame = await sendProtocolRequest('GET|DEVICE_ID');
  const payload = parseKeyValuePayload(frame.params[0] || '');
  const nextId = normalizeDeviceId(payload.device_id);

  if (!nextId) {
    throw new Error('No fue posible leer la key del ESP.');
  }

  if (!state.deviceInfo) {
    state.deviceInfo = buildDeviceInfo({});
  }
  state.deviceInfo.device_id = nextId;
  syncVaultView();
}

async function refreshDeviceSnapshot() {
  if (!state.port) {
    showAlert('Conecta primero un ESP.', 'error');
    return;
  }

  try {
    const infoFrame = await sendProtocolRequest('GET|INFO');
    const payload = parseKeyValuePayload(infoFrame.params[0] || '');
    state.deviceInfo = buildDeviceInfo(payload, state.deviceInfo);

    if (!state.deviceInfo.device_id || !DEVICE_KEY_PATTERN.test(state.deviceInfo.device_id)) {
      await requestDeviceKey();
    }

    if (state.deviceInfo.vault_unlocked) {
      await loadAccountsFromDevice();
    } else {
      clearAccountsState();
    }

    setUSBStatus(`ESP detectado: ${formatDeviceId(state.deviceInfo.device_id)}.`, 'success');
    syncVaultView();
  } catch (error) {
    clearAccountsState();
    setUSBStatus(error.message || 'No fue posible consultar el ESP.', 'error');
    syncVaultView();
  }
}

function sendProtocolRequest(command, options = {}) {
  if (!state.port) {
    return Promise.reject(new Error('Conecta primero un ESP.'));
  }

  const requestId = nextRequestId(options.prefix || 'web');
  const timeoutMs = options.timeoutMs || 5000;
  const fullCommand = `${KLAUS_PROTOCOL_PREFIX}|${KLAUS_PROTOCOL_VERSION}|${requestId}|${command}`;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      state.pendingRequests.delete(requestId);
      reject(new Error('Timeout esperando al ESP.'));
    }, timeoutMs);

    state.pendingRequests.set(requestId, {
      resolve,
      reject,
      timeoutId,
      collectUntilKind: options.collectUntilKind || '',
      frames: []
    });

    sendSerialCommand(`${fullCommand}\r`)
      .then(() => {
        appendSerialLog(`[usb] -> ${fullCommand}`);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        state.pendingRequests.delete(requestId);
        reject(error);
      });
  });
}

function nextRequestId(prefix = 'web') {
  state.requestSequence += 1;
  return `${prefix}-${state.requestSequence}`;
}

async function sendSerialCommand(text) {
  if (!state.port || !state.port.writable) {
    throw new Error('El puerto no esta listo.');
  }

  const writer = state.port.writable.getWriter();
  try {
    await writer.write(encoder.encode(text));
  } finally {
    writer.releaseLock();
  }
}

async function handleVaultCreate(event) {
  event.preventDefault();

  const owner = elements.vaultOwnerName.value.trim();
  const pin = elements.vaultPin.value;
  const phrase = elements.vaultPhrase.value;

  if (owner.length < 2) {
    showAlert('Introduce un nombre valido.', 'error');
    return;
  }

  if (pin.length < 4) {
    showAlert('El PIN debe tener al menos 4 caracteres.', 'error');
    return;
  }

  if (phrase.length < 6) {
    showAlert('La frase secreta debe tener al menos 6 caracteres.', 'error');
    return;
  }

  try {
    setVaultNotice('Creando vault...', 'info');
    await sendProtocolRequest(`SESSION|CREATE|${encodeToken(owner)}|${encodeToken(pin, false)}|${encodeToken(phrase, false)}`, {
      timeoutMs: VAULT_OPERATION_TIMEOUT_MS
    });
    elements.vaultCreateForm.reset();
    showAlert('Vault creado correctamente.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    setVaultNotice(error.message || 'No se pudo crear el vault.', 'error');
    showAlert(error.message || 'No se pudo crear el vault.', 'error');
  }
}

async function handleVaultUnlock(event) {
  event.preventDefault();

  const submitButton = elements.vaultUnlockForm.querySelector('button[type="submit"]');
  if (submitButton?.disabled) {
    return;
  }

  const pin = elements.unlockPin.value;
  const phrase = elements.unlockPhrase.value;

  if (pin.length < 4) {
    showAlert('Introduce un PIN valido.', 'error');
    return;
  }

  if (phrase.length < 6) {
    showAlert('Introduce una frase secreta valida.', 'error');
    return;
  }

  try {
    setButtonBusy(submitButton, true, 'Desbloqueando...');
    setVaultNotice('Desbloqueando vault...', 'info');
    await sendProtocolRequest(`SESSION|UNLOCK|${encodeToken(pin, false)}|${encodeToken(phrase, false)}`, {
      timeoutMs: VAULT_OPERATION_TIMEOUT_MS
    });
    elements.vaultUnlockForm.reset();
    showAlert('Vault desbloqueado.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    setVaultNotice(error.message || 'No se pudo desbloquear el vault.', 'error');
    showAlert(error.message || 'No se pudo desbloquear el vault.', 'error');
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function handleVaultLock() {
  try {
    await sendProtocolRequest('SESSION|LOCK');
    clearAccountsState();
    showAlert('Vault bloqueado.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    setVaultNotice(error.message || 'No se pudo bloquear el vault.', 'error');
    showAlert(error.message || 'No se pudo bloquear el vault.', 'error');
  }
}

async function handleVaultWipe() {
  if (!state.deviceInfo?.vault_exists) {
    showAlert('No hay un vault para borrar.', 'error');
    return;
  }

  const confirmed = window.confirm('Se borrara todo el vault del ESP. Esta accion no se puede deshacer. Continuar?');
  if (!confirmed) {
    return;
  }

  try {
    setVaultNotice('Borrando vault...', 'warning');
    await sendProtocolRequest('SESSION|WIPE', {
      timeoutMs: VAULT_OPERATION_TIMEOUT_MS
    });
    clearAccountsState();
    showAlert('Vault borrado.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    setVaultNotice(error.message || 'No se pudo borrar el vault.', 'error');
    showAlert(error.message || 'No se pudo borrar el vault.', 'error');
  }
}

async function handleDeviceAccountCreate(event) {
  event.preventDefault();

  if (!state.deviceInfo?.vault_unlocked) {
    showAlert('Desbloquea el vault antes de guardar cuentas.', 'error');
    return;
  }

  const service = elements.accountService.value;
  const email = elements.accountEmail.value.trim();
  const password = elements.accountPassword.value;
  const url = elements.accountUrl.value.trim();

  if (!SERVICE_OPTIONS[service]) {
    showAlert('Selecciona un servicio valido.', 'error');
    return;
  }

  if (!looksLikeEmail(email)) {
    showAlert('Introduce un email valido.', 'error');
    return;
  }

  if (password.length < 1) {
    showAlert('Introduce el password de la cuenta.', 'error');
    return;
  }

  if (!looksLikeHttpUrl(url)) {
    showAlert('Introduce una URL valida.', 'error');
    return;
  }

  try {
    setAccountsStatus('Guardando cuenta en el ESP...', 'info');
    await sendProtocolRequest(
      `ACCOUNT|ADD|${encodeToken(service)}|${encodeToken(email)}|${encodeToken(password, false)}|${encodeToken(url)}`,
      { timeoutMs: ACCOUNTS_OPERATION_TIMEOUT_MS }
    );
    elements.accountEmail.value = '';
    elements.accountPassword.value = '';
    applyServiceDefaults();
    showAlert('Cuenta guardada dentro del ESP.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    setAccountsStatus(error.message || 'No se pudo guardar la cuenta.', 'error');
    showAlert(error.message || 'No se pudo guardar la cuenta.', 'error');
  }
}

async function loadAccountsFromDevice() {
  if (!state.deviceInfo?.vault_unlocked) {
    clearAccountsState();
    return;
  }

  setAccountsStatus('Leyendo cuentas del ESP...', 'info');

  const frames = await sendProtocolRequest('GET|ACCOUNTS', {
    timeoutMs: ACCOUNTS_OPERATION_TIMEOUT_MS,
    collectUntilKind: 'DONE'
  });

  state.accounts = frames
    .filter((frame) => frame.kind === 'ACCOUNT')
    .map((frame) => parseAccountFrame(frame))
    .filter(Boolean);

  if (state.deviceInfo) {
    state.deviceInfo.total_accounts = state.accounts.length;
  }

  renderAccountsList();
}

function parseAccountFrame(frame) {
  const accountId = String(frame.params[0] || '').trim();
  if (!accountId) {
    return null;
  }

  return {
    accountId,
    service: decodeToken(frame.params[1] || ''),
    email: decodeToken(frame.params[2] || ''),
    password: decodeToken(frame.params[3] || ''),
    url: decodeToken(frame.params[4] || ''),
    counter: parseInteger(frame.params[5] || '0', 0)
  };
}

function syncVaultView() {
  elements.deviceKeyValue.textContent = formatDeviceId(state.deviceInfo?.device_id || '');
  elements.deviceConsoleValue.textContent = state.deviceInfo?.console || 'Sin leer';
  elements.deviceBleValue.textContent = state.deviceInfo
    ? (state.deviceInfo.ble ? (state.deviceInfo.autofill_ready ? 'Listo' : 'Activo') : 'No')
    : 'Sin leer';
  elements.vaultStateValue.textContent = describeVaultState();
  elements.deviceAccountsValue.textContent = String(state.deviceInfo?.total_accounts ?? state.accounts.length ?? 0);

  elements.vaultCreateForm.hidden = true;
  elements.vaultUnlockForm.hidden = true;
  elements.vaultActionBar.hidden = true;
  elements.lockVaultBtn.hidden = true;
  elements.accountsSection.hidden = true;

  if (!state.port) {
    setVaultNotice('Conecta un ESP para consultar el vault.', 'info');
    setAccountsStatus('Conecta un ESP para ver sus cuentas.', 'info');
    renderAccountsList();
    return;
  }

  if (!state.deviceInfo) {
    setVaultNotice('Pulsa "Actualizar ESP" para leer el estado.', 'info');
    setAccountsStatus('Pulsa "Actualizar ESP" para consultar las cuentas.', 'info');
    renderAccountsList();
    return;
  }

  if (!state.deviceInfo.vault_exists) {
    elements.vaultCreateForm.hidden = false;
    setVaultNotice('Este ESP no tiene vault. Puedes crearlo ahora.', 'warning');
    setAccountsStatus('Crea el vault para empezar a guardar cuentas.', 'info');
    renderAccountsList();
    return;
  }

  elements.vaultActionBar.hidden = false;

  if (!state.deviceInfo.vault_unlocked) {
    elements.vaultUnlockForm.hidden = false;
    setVaultNotice('El vault existe. Puedes desbloquearlo o borrarlo.', 'info');
    setAccountsStatus('Desbloquea el vault para ver y guardar cuentas.', 'info');
    renderAccountsList();
    return;
  }

  elements.lockVaultBtn.hidden = false;
  elements.accountsSection.hidden = false;
  setVaultNotice('Vault desbloqueado.', 'success');
  renderAccountsList();
}

function renderAccountsList() {
  const canManageAccounts = Boolean(state.port && state.deviceInfo?.vault_unlocked);

  elements.deviceAccountsList.replaceChildren();
  elements.deviceAccountsList.hidden = true;
  elements.deviceAccountsEmpty.hidden = true;

  if (!canManageAccounts) {
    return;
  }

  if (state.accounts.length === 0) {
    elements.deviceAccountsEmpty.hidden = false;
    setAccountsStatus('Vault listo. Guarda la primera cuenta.', 'info');
    return;
  }

  const fragment = document.createDocumentFragment();
  state.accounts.forEach((account) => {
    fragment.appendChild(createAccountCard(account));
  });

  elements.deviceAccountsList.appendChild(fragment);
  elements.deviceAccountsList.hidden = false;
  setAccountsStatus(`${state.accounts.length} cuenta${state.accounts.length === 1 ? '' : 's'} guardada${state.accounts.length === 1 ? '' : 's'} en el ESP.`, 'success');
}

function createAccountCard(account) {
  const card = document.createElement('article');
  card.className = 'device-account-card';

  const main = document.createElement('div');
  main.className = 'device-account-main';

  const header = document.createElement('div');
  header.className = 'device-account-header';

  const service = document.createElement('strong');
  service.className = 'device-account-service';
  service.textContent = SERVICE_OPTIONS[account.service]?.label || account.service || 'Cuenta';

  const accountId = document.createElement('span');
  accountId.className = 'device-account-id';
  accountId.textContent = account.accountId;

  header.append(service, accountId);
  main.appendChild(header);

  const fields = document.createElement('div');
  fields.className = 'device-account-fields';
  fields.appendChild(createAccountField('Email', account.email));
  fields.appendChild(createSecretAccountField(account));
  fields.appendChild(createAccountField('URL', account.url));
  main.appendChild(fields);

  const actions = document.createElement('div');
  actions.className = 'device-account-actions';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'btn btn-outline';
  openButton.textContent = 'Abrir pagina';
  openButton.dataset.action = 'open-url';
  openButton.dataset.accountId = account.accountId;
  openButton.disabled = !looksLikeHttpUrl(account.url);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn account-delete-btn';
  deleteButton.textContent = 'Eliminar';
  deleteButton.dataset.action = 'delete-account';
  deleteButton.dataset.accountId = account.accountId;

  actions.append(openButton, deleteButton);
  card.append(main, actions);
  return card;
}

function createAccountField(label, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'device-account-field';

  const fieldLabel = document.createElement('span');
  fieldLabel.className = 'summary-label';
  fieldLabel.textContent = label;

  const fieldValue = document.createElement('div');
  fieldValue.className = 'device-account-field-value';
  fieldValue.textContent = value || '-';

  wrapper.append(fieldLabel, fieldValue);
  return wrapper;
}

function createSecretAccountField(account) {
  const wrapper = document.createElement('div');
  wrapper.className = 'device-account-field';

  const fieldLabel = document.createElement('span');
  fieldLabel.className = 'summary-label';
  fieldLabel.textContent = 'Password';

  const secretWrap = document.createElement('div');
  secretWrap.className = 'device-account-secret';

  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'device-account-secret-input';
  input.readOnly = true;
  input.value = account.password || '';
  input.dataset.accountId = account.accountId;

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'btn btn-secondary device-account-secret-toggle';
  toggleButton.textContent = 'Mostrar';
  toggleButton.dataset.action = 'toggle-password';
  toggleButton.dataset.accountId = account.accountId;

  secretWrap.append(input, toggleButton);
  wrapper.append(fieldLabel, secretWrap);
  return wrapper;
}

async function handleAccountListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const { action, accountId } = button.dataset;
  const account = state.accounts.find((item) => item.accountId === accountId);
  if (!account) {
    return;
  }

  if (action === 'toggle-password') {
    toggleAccountPasswordVisibility(accountId, button);
    return;
  }

  if (action === 'open-url') {
    window.open(account.url, '_blank', 'noopener,noreferrer');
    return;
  }

  if (action === 'delete-account') {
    await deleteAccountFromDevice(account);
  }
}

function toggleAccountPasswordVisibility(accountId, button) {
  const selector = `input[data-account-id="${escapeSelectorValue(accountId)}"]`;
  const input = elements.deviceAccountsList.querySelector(selector);
  if (!input) {
    return;
  }

  const shouldShow = input.type === 'password';
  input.type = shouldShow ? 'text' : 'password';
  button.textContent = shouldShow ? 'Ocultar' : 'Mostrar';
}

async function deleteAccountFromDevice(account) {
  const confirmed = window.confirm(`Se eliminara la cuenta ${account.email} de ${SERVICE_OPTIONS[account.service]?.label || account.service}. Continuar?`);
  if (!confirmed) {
    return;
  }

  try {
    setAccountsStatus('Eliminando cuenta...', 'warning');
    await sendProtocolRequest(`ACCOUNT|DELETE|${account.accountId}`, {
      timeoutMs: ACCOUNTS_OPERATION_TIMEOUT_MS
    });
    showAlert('Cuenta eliminada del ESP.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    setAccountsStatus(error.message || 'No se pudo eliminar la cuenta.', 'error');
    showAlert(error.message || 'No se pudo eliminar la cuenta.', 'error');
  }
}

function clearAccountsState() {
  state.accounts = [];
  if (state.deviceInfo && state.deviceInfo.vault_unlocked) {
    state.deviceInfo.total_accounts = 0;
  }
  renderAccountsList();
}

function setUSBStatus(message, tone = 'info') {
  elements.usbStatus.textContent = message;
  elements.usbStatus.className = `status-box status-box-${tone}`;
}

function setVaultNotice(message, tone = 'info') {
  elements.vaultStateNotice.textContent = message;
  elements.vaultStateNotice.className = `status-box status-box-${tone}`;
}

function setAccountsStatus(message, tone = 'info') {
  elements.accountsStatus.textContent = message;
  elements.accountsStatus.className = `status-box status-box-${tone}`;
}

function appendSerialLog(line) {
  state.serialLines.push(line);
  state.serialLines = state.serialLines.slice(-160);
  elements.serialLog.textContent = state.serialLines.join('\n');
  elements.serialLog.scrollTop = elements.serialLog.scrollHeight;
}

function resetSerialLog() {
  state.serialLines = ['Esperando actividad del puerto serial...'];
  elements.serialLog.textContent = state.serialLines.join('\n');
}

async function disconnectUSB(showNotice = true) {
  rejectPendingRequests('USB_DISCONNECTED');

  if (state.reader) {
    try {
      await state.reader.cancel();
    } catch (error) {
      // ignored
    }
  }

  if (state.port) {
    try {
      await state.port.close();
    } catch (error) {
      // ignored
    }
  }

  state.port = null;
  state.reader = null;
  state.serialBuffer = '';
  state.deviceInfo = null;
  state.accounts = [];
  resetSerialLog();
  await refreshAuthorizedPortsState();
  setUSBStatus('Sin conexion USB.', 'info');
  syncVaultView();

  if (showNotice) {
    showAlert('Conexion USB cerrada.', 'info');
  }
}

function rejectPendingRequests(reason) {
  state.pendingRequests.forEach((pending, requestId) => {
    clearTimeout(pending.timeoutId);
    pending.reject(new Error(reason));
    state.pendingRequests.delete(requestId);
  });
}

async function handlePortConnected() {
  await refreshAuthorizedPortsState();

  if (state.port) {
    return;
  }

  setUSBStatus('ESP detectado. Intentando reconectar...', 'info');
  await tryAutoConnectAuthorizedPort();
}

async function handlePortDisconnected() {
  if (!state.port) {
    await refreshAuthorizedPortsState();
    return;
  }

  await disconnectUSB(false);
  setUSBStatus('El puerto USB se desconecto.', 'error');
}

function encodeToken(value, trim = true) {
  const raw = trim ? String(value || '').trim() : String(value || '');
  return encodeURIComponent(raw);
}

function decodeToken(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch (error) {
    return String(value || '');
  }
}

function looksLikeEmail(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  const at = text.indexOf('@');
  if (at <= 0 || at === text.length - 1) {
    return false;
  }

  return text.slice(at + 1).includes('.');
}

function looksLikeHttpUrl(value) {
  const text = String(value || '').trim();
  return text.startsWith('https://') || text.startsWith('http://');
}

function escapeSelectorValue(value) {
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function setButtonBusy(button, busy, busyLabel = 'Procesando...') {
  if (!button) {
    return;
  }

  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = busyLabel;
    return;
  }

  button.disabled = false;
  button.textContent = button.dataset.originalLabel || button.textContent;
}

function showAlert(message, type = 'info') {
  elements.alert.textContent = message;
  elements.alert.className = `alert ${type}`;
  elements.alert.hidden = false;

  clearTimeout(showAlert.timeoutId);
  showAlert.timeoutId = window.setTimeout(() => {
    elements.alert.hidden = true;
  }, 3200);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
