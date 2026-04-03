const API_URL = `${window.location.origin}/api`;
const DEVICE_KEY_PATTERN = /^[a-f0-9]{12}$/i;
const SERIAL_BAUD_RATE = 115200;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const state = {
  token: localStorage.getItem('token'),
  currentUser: null,
  bindings: [],
  port: null,
  reader: null,
  serialBuffer: '',
  serialLines: [],
  detectedKey: ''
};

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  setSerialCapabilityState();
  showAuthMode('login');

  if (state.token) {
    void loadDashboard();
  } else {
    showLoggedOutView();
  }
});

function cacheElements() {
  elements.authSection = document.getElementById('authSection');
  elements.dashboardSection = document.getElementById('dashboardSection');
  elements.showLoginBtn = document.getElementById('showLoginBtn');
  elements.showRegisterBtn = document.getElementById('showRegisterBtn');
  elements.loginForm = document.getElementById('loginFormElement');
  elements.registerForm = document.getElementById('registerFormElement');
  elements.manualBindForm = document.getElementById('manualBindForm');
  elements.logoutBtn = document.getElementById('logoutBtn');
  elements.reloadBindingsBtn = document.getElementById('reloadBindingsBtn');
  elements.connectUsbBtn = document.getElementById('connectUsbBtn');
  elements.disconnectUsbBtn = document.getElementById('disconnectUsbBtn');
  elements.refreshKeyBtn = document.getElementById('refreshKeyBtn');
  elements.linkDetectedBtn = document.getElementById('linkDetectedBtn');
  elements.serialSupport = document.getElementById('serialSupport');
  elements.usbStatus = document.getElementById('usbStatus');
  elements.serialLog = document.getElementById('serialLog');
  elements.detectedKeyValue = document.getElementById('detectedKeyValue');
  elements.detectedKeyHint = document.getElementById('detectedKeyHint');
  elements.manualEspKey = document.getElementById('manualEspKey');
  elements.manualKeyState = document.getElementById('manualKeyState');
  elements.bindingsList = document.getElementById('bindingsList');
  elements.usernameDisplay = document.getElementById('usernameDisplay');
  elements.userEmailDisplay = document.getElementById('userEmailDisplay');
  elements.alert = document.getElementById('alert');
}

function bindEvents() {
  elements.showLoginBtn.addEventListener('click', () => showAuthMode('login'));
  elements.showRegisterBtn.addEventListener('click', () => showAuthMode('register'));
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.manualBindForm.addEventListener('submit', handleManualBind);
  elements.manualEspKey.addEventListener('input', handleManualKeyInput);
  elements.logoutBtn.addEventListener('click', () => {
    void handleLogout();
  });
  elements.reloadBindingsBtn.addEventListener('click', () => {
    void loadBindings();
  });
  elements.connectUsbBtn.addEventListener('click', () => {
    void connectUSB();
  });
  elements.disconnectUsbBtn.addEventListener('click', () => {
    void disconnectUSB();
  });
  elements.refreshKeyBtn.addEventListener('click', () => {
    void requestDeviceKey();
  });
  elements.linkDetectedBtn.addEventListener('click', () => {
    void bindKeyToCurrentUser(state.detectedKey, 'usb');
  });

  if ('serial' in navigator && typeof navigator.serial.addEventListener === 'function') {
    navigator.serial.addEventListener('disconnect', () => {
      void handlePortDisconnected();
    });
  }
}

function showAuthMode(mode) {
  const isLogin = mode === 'login';
  elements.showLoginBtn.classList.toggle('is-active', isLogin);
  elements.showRegisterBtn.classList.toggle('is-active', !isLogin);
  elements.loginForm.classList.toggle('is-active', isLogin);
  elements.registerForm.classList.toggle('is-active', !isLogin);
}

function showLoggedOutView() {
  elements.authSection.hidden = false;
  elements.dashboardSection.hidden = true;
}

function showDashboardView() {
  elements.authSection.hidden = true;
  elements.dashboardSection.hidden = false;
}

function setSerialCapabilityState() {
  if (!('serial' in navigator)) {
    elements.serialSupport.textContent = 'Tu navegador no soporta Web Serial. Usa Chrome o Edge.';
    elements.serialSupport.className = 'status-chip status-box-error';
    elements.connectUsbBtn.disabled = true;
    setUSBStatus('Web Serial no está disponible en este navegador.', 'error');
    return;
  }

  elements.serialSupport.textContent = 'Web Serial disponible. Puedes validar la key por USB.';
  elements.serialSupport.className = 'status-chip status-chip-info';
}

function normalizeDeviceKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-fA-F0-9]/g, '')
    .slice(0, 12)
    .toLowerCase();
}

function isValidDeviceKey(value) {
  return DEVICE_KEY_PATTERN.test(value);
}

function formatKey(value) {
  return value ? value.toUpperCase() : 'Sin detectar';
}

function setUSBStatus(message, tone = 'info') {
  elements.usbStatus.textContent = message;
  elements.usbStatus.className = `status-box status-box-${tone}`;
}

function setManualKeyState(message, tone = 'info') {
  elements.manualKeyState.textContent = message;
  elements.manualKeyState.className = `status-inline ${tone}`;
}

function updateUSBButtons(connected) {
  elements.connectUsbBtn.disabled = connected || !('serial' in navigator);
  elements.disconnectUsbBtn.disabled = !connected;
  elements.refreshKeyBtn.disabled = !connected;
}

function appendSerialLog(line) {
  state.serialLines.push(line);
  state.serialLines = state.serialLines.slice(-40);
  elements.serialLog.textContent = state.serialLines.join('\n');
  elements.serialLog.scrollTop = elements.serialLog.scrollHeight;
}

function resetSerialLog() {
  state.serialLines = [];
  elements.serialLog.textContent = 'Esperando actividad del puerto serial...';
}

async function apiFetch(path, options = {}) {
  const request = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (options.authenticated && state.token) {
    request.headers.Authorization = `Bearer ${state.token}`;
  }

  if (options.body) {
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, request);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const { response, data } = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    if (!response.ok) {
      showAlert(data.error || 'No se pudo iniciar sesión.', 'error');
      return;
    }

    state.token = data.token;
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', String(data.userId));

    showAlert('Sesión iniciada correctamente.', 'success');
    await loadDashboard();
  } catch (error) {
    showAlert('No fue posible conectarse al servidor.', 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const username = document.getElementById('registerUsername').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;

  if (password.length < 6) {
    showAlert('La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }

  try {
    const { response, data } = await apiFetch('/auth/register', {
      method: 'POST',
      body: { username, email, password }
    });

    if (!response.ok) {
      showAlert(data.error || 'No se pudo crear la cuenta.', 'error');
      return;
    }

    state.token = data.token;
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', String(data.userId));

    showAlert('Cuenta creada correctamente.', 'success');
    await loadDashboard();
  } catch (error) {
    showAlert('No fue posible conectarse al servidor.', 'error');
  }
}

async function loadDashboard() {
  try {
    const { response, data } = await apiFetch('/auth/user', {
      authenticated: true
    });

    if (!response.ok) {
      await handleLogout(false);
      showAlert(data.error || 'Tu sesión ya no es válida.', 'error');
      return;
    }

    state.currentUser = data;
    elements.usernameDisplay.textContent = data.username;
    elements.userEmailDisplay.textContent = data.email;
    showDashboardView();
    setManualKeyState('Introduce una key hexadecimal de 12 caracteres.', 'info');
    await loadBindings();
  } catch (error) {
    await handleLogout(false);
    showAlert('No fue posible cargar tu sesión.', 'error');
  }
}

async function loadBindings() {
  try {
    const { response, data } = await apiFetch('/esp/bindings', {
      authenticated: true
    });

    if (!response.ok) {
      showAlert(data.error || 'No se pudieron cargar las keys vinculadas.', 'error');
      return;
    }

    state.bindings = Array.isArray(data) ? data : [];
    renderBindings();

    if (state.detectedKey) {
      await refreshDetectedKeyState(state.detectedKey);
    }
  } catch (error) {
    showAlert('No fue posible cargar las keys vinculadas.', 'error');
  }
}

function renderBindings() {
  elements.bindingsList.replaceChildren();

  if (state.bindings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Todavía no hay keys vinculadas a esta cuenta.';
    elements.bindingsList.appendChild(empty);
    return;
  }

  state.bindings.forEach((binding) => {
    const item = document.createElement('article');
    item.className = 'binding-item';

    const info = document.createElement('div');

    const key = document.createElement('code');
    key.className = 'binding-key';
    key.textContent = formatKey(binding.esp_key);
    info.appendChild(key);

    const meta = document.createElement('p');
    meta.className = 'binding-meta';
    meta.textContent = `Vinculada el ${formatDate(binding.registered_at)}`;
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'binding-actions';

    if (binding.esp_key === state.detectedKey) {
      const badge = document.createElement('span');
      badge.className = 'binding-badge success';
      badge.textContent = 'Key detectada por USB';
      actions.appendChild(badge);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn binding-delete';
    deleteButton.textContent = 'Eliminar key';
    deleteButton.addEventListener('click', () => {
      void deleteBinding(binding.id);
    });
    actions.appendChild(deleteButton);

    item.appendChild(info);
    item.appendChild(actions);
    elements.bindingsList.appendChild(item);
  });
}

function formatDate(value) {
  if (!value) {
    return 'fecha desconocida';
  }

  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

async function deleteBinding(bindingId) {
  const confirmed = window.confirm('¿Quieres eliminar esta key de tu cuenta?');
  if (!confirmed) {
    return;
  }

  try {
    const { response, data } = await apiFetch(`/esp/bindings/${bindingId}`, {
      method: 'DELETE',
      authenticated: true
    });

    if (!response.ok) {
      showAlert(data.error || 'No fue posible eliminar la key.', 'error');
      return;
    }

    showAlert('Key eliminada correctamente.', 'success');
    await loadBindings();
  } catch (error) {
    showAlert('No fue posible eliminar la key.', 'error');
  }
}

async function handleManualBind(event) {
  event.preventDefault();

  const key = normalizeDeviceKey(elements.manualEspKey.value);
  elements.manualEspKey.value = key;

  if (!isValidDeviceKey(key)) {
    setManualKeyState('La key debe tener 12 caracteres hexadecimales.', 'error');
    showAlert('La key del ESP no tiene un formato válido.', 'error');
    return;
  }

  await bindKeyToCurrentUser(key, 'manual');
}

async function bindKeyToCurrentUser(key, source) {
  if (!isValidDeviceKey(key)) {
    showAlert('No hay una key válida para vincular.', 'error');
    return;
  }

  try {
    const { response, data } = await apiFetch('/esp/bind', {
      method: 'POST',
      authenticated: true,
      body: {
        esp_key: key,
        source
      }
    });

    if (!response.ok) {
      showAlert(data.error || 'No fue posible guardar la key.', 'error');
      return;
    }

    elements.manualEspKey.value = '';
    setManualKeyState('Key vinculada a tu cuenta.', 'success');
    showAlert(data.message || 'Key vinculada correctamente.', 'success');
    await loadBindings();
  } catch (error) {
    showAlert('No fue posible guardar la key.', 'error');
  }
}

function handleManualKeyInput(event) {
  const normalized = normalizeDeviceKey(event.target.value);
  event.target.value = normalized;

  if (!normalized) {
    setManualKeyState('Introduce una key hexadecimal de 12 caracteres.', 'info');
    return;
  }

  if (!isValidDeviceKey(normalized)) {
    setManualKeyState('La key todavía está incompleta o tiene un formato inválido.', 'warning');
    return;
  }

  void refreshManualKeyState(normalized);
}

async function refreshManualKeyState(key) {
  try {
    const keyState = await fetchKeyState(key);
    setManualKeyState(describeKeyState(keyState), keyStateTone(keyState));
  } catch (error) {
    setManualKeyState('No fue posible validar la key contra el servidor.', 'error');
  }
}

async function refreshDetectedKeyState(key) {
  try {
    const keyState = await fetchKeyState(key);
    const tone = keyStateTone(keyState);
    elements.detectedKeyHint.textContent = describeKeyState(keyState);
    elements.linkDetectedBtn.disabled = !keyState.available;
    setUSBStatus(`Key detectada: ${formatKey(key)}. ${describeKeyState(keyState)}`, tone);
  } catch (error) {
    elements.detectedKeyHint.textContent = 'La key se detectó, pero no se pudo validar contra el servidor.';
    elements.linkDetectedBtn.disabled = true;
    setUSBStatus('La key se detectó, pero falló la validación con el servidor.', 'error');
  }
}

async function fetchKeyState(key) {
  const { response, data } = await apiFetch('/esp/check-key', {
    method: 'POST',
    authenticated: true,
    body: { esp_key: key }
  });

  if (!response.ok) {
    throw new Error(data.error || 'No fue posible validar la key.');
  }

  return data;
}

function describeKeyState(keyState) {
  if (keyState.owned_by_current_user) {
    return 'Esta key ya está vinculada a tu cuenta.';
  }

  if (keyState.available) {
    return 'La key está libre y se puede vincular.';
  }

  return 'La key ya está reservada por otra cuenta.';
}

function keyStateTone(keyState) {
  if (keyState.owned_by_current_user) {
    return 'success';
  }

  if (keyState.available) {
    return 'info';
  }

  return 'error';
}

async function connectUSB() {
  if (!('serial' in navigator)) {
    showAlert('Tu navegador no soporta Web Serial.', 'error');
    return;
  }

  try {
    const port = await navigator.serial.requestPort();
    resetSerialLog();
    state.serialBuffer = '';
    await port.open({ baudRate: SERIAL_BAUD_RATE });
    state.port = port;

    updateUSBButtons(true);
    appendSerialLog('[usb] Puerto abierto a 115200 baudios');
    setUSBStatus('Puerto conectado. Solicitando key al ESP...', 'info');

    void startSerialReader();

    await wait(250);
    await requestDeviceKey();
  } catch (error) {
    if (error && error.name === 'NotFoundError') {
      return;
    }

    showAlert('No fue posible abrir el puerto USB.', 'error');
    setUSBStatus('Fallo al abrir el puerto USB.', 'error');
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
      appendSerialLog('[usb] El puerto se desconectó o dejó de responder');
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
    const key = extractDeviceKey(cleanLine);
    if (key) {
      void applyDetectedKey(key);
    }
  });
}

function extractDeviceKey(line) {
  const patterns = [
    /DEVICE_ID:\s*([a-f0-9]{12})/i,
    /KLAUS_KEY:\s*([a-f0-9]{12})/i,
    /Device ID:\s*([a-f0-9]{12})/i
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return normalizeDeviceKey(match[1]);
    }
  }

  return '';
}

async function applyDetectedKey(key) {
  if (!isValidDeviceKey(key)) {
    return;
  }

  state.detectedKey = key;
  elements.detectedKeyValue.textContent = formatKey(key);
  elements.detectedKeyHint.textContent = 'Key detectada por USB. Validando estado...';
  elements.linkDetectedBtn.disabled = true;

  await refreshDetectedKeyState(key);
  renderBindings();
}

async function requestDeviceKey() {
  if (!state.port) {
    showAlert('Conecta primero un puerto USB.', 'error');
    return;
  }

  try {
    await sendSerialCommand('\r');
    await wait(120);
    await sendSerialCommand('ID\r');
    appendSerialLog('[usb] Comando enviado: ID');
    setUSBStatus('Solicitando key al ESP por serial...', 'info');
  } catch (error) {
    showAlert('No fue posible solicitar la key por serial.', 'error');
    setUSBStatus('No fue posible escribir en el puerto serial.', 'error');
  }
}

async function sendSerialCommand(text) {
  if (!state.port || !state.port.writable) {
    throw new Error('PORT_NOT_READY');
  }

  const writer = state.port.writable.getWriter();

  try {
    await writer.write(encoder.encode(text));
  } finally {
    writer.releaseLock();
  }
}

async function disconnectUSB(showNotice = true) {
  if (state.reader) {
    try {
      await state.reader.cancel();
    } catch (error) {
      // Ignorado a propósito.
    }
  }

  if (state.port) {
    try {
      await state.port.close();
    } catch (error) {
      // Ignorado a propósito.
    }
  }

  state.port = null;
  state.reader = null;
  updateUSBButtons(false);
  setUSBStatus('Sin conexión USB.', 'info');

  if (showNotice) {
    showAlert('Conexión USB cerrada.', 'info');
  }
}

async function handlePortDisconnected() {
  if (!state.port) {
    return;
  }

  await disconnectUSB(false);
  setUSBStatus('El puerto USB se desconectó.', 'error');
}

async function handleLogout(showMessage = true) {
  await disconnectUSB(false);

  state.token = null;
  state.currentUser = null;
  state.bindings = [];
  state.detectedKey = '';
  localStorage.removeItem('token');
  localStorage.removeItem('userId');

  elements.loginForm.reset();
  elements.registerForm.reset();
  elements.manualBindForm.reset();
  elements.detectedKeyValue.textContent = 'Sin detectar';
  elements.detectedKeyHint.textContent = 'Cuando el ESP responda por serial, verás aquí su key única.';
  setManualKeyState('Introduce una key hexadecimal de 12 caracteres.', 'info');
  renderBindings();
  showLoggedOutView();
  showAuthMode('login');

  if (showMessage) {
    showAlert('Sesión cerrada.', 'info');
  }
}

function showAlert(message, type = 'info') {
  elements.alert.textContent = message;
  elements.alert.className = `alert ${type}`;
  elements.alert.hidden = false;

  window.clearTimeout(showAlert.timeoutId);
  showAlert.timeoutId = window.setTimeout(() => {
    elements.alert.hidden = true;
  }, 3200);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
