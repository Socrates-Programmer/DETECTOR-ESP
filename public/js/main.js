const API_URL = `${window.location.origin}/api`;
const DEVICE_KEY_PATTERN = /^[a-f0-9]{12}$/i;
const SERIAL_BAUD_RATE = 115200;
const KLAUS_PROTOCOL_PREFIX = 'KLAUS';
const KLAUS_PROTOCOL_VERSION = '1';
const VAULT_OPERATION_TIMEOUT_MS = 30000;

const SERVICE_PROFILES = {
  google: {
    title: 'Google',
    usernameLabel: 'Correo de Google',
    usernamePlaceholder: 'usuario@gmail.com',
    usernameMode: 'email',
    authFlow: 'limited_input_device',
    defaultScopes: 'openid email profile',
    usesTenant: false,
    defaultTenant: '',
    hint: 'Google usara un flujo oficial para dispositivos con entrada limitada.'
  },
  github: {
    title: 'GitHub',
    usernameLabel: 'Usuario o correo de GitHub',
    usernamePlaceholder: 'octocat o correo@empresa.com',
    usernameMode: 'text',
    authFlow: 'device_flow',
    defaultScopes: 'read:user user:email',
    usesTenant: false,
    defaultTenant: '',
    hint: 'GitHub encaja bien con device flow y suele ser el flujo mas directo para KLAUS.'
  },
  microsoft: {
    title: 'Microsoft',
    usernameLabel: 'Correo Microsoft',
    usernamePlaceholder: 'usuario@outlook.com',
    usernameMode: 'email',
    authFlow: 'device_code',
    defaultScopes: 'openid profile email offline_access User.Read',
    usesTenant: true,
    defaultTenant: 'common',
    hint: 'Microsoft puede usar device code. Si no sabes el tenant, deja "common".'
  },
  spotify: {
    title: 'Spotify',
    usernameLabel: 'Correo o usuario de Spotify',
    usernamePlaceholder: 'usuario o correo de Spotify',
    usernameMode: 'text',
    authFlow: 'desktop_assisted',
    defaultScopes: 'user-read-email',
    usesTenant: false,
    defaultTenant: '',
    hint: 'Spotify necesitara apoyo del navegador o PC durante el flujo de autorizacion.'
  }
};

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
  detectedKey: '',
  detectedKeyState: null,
  deviceInfo: null,
  deviceAccounts: [],
  requestSequence: 0,
  pendingRequests: new Map()
};

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  syncAccountServiceProfile(true);
  setSerialCapabilityState();
  showAuthMode('login');
  syncDevicePanels();

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
  elements.logoutBtn = document.getElementById('logoutBtn');

  elements.reloadBindingsBtn = document.getElementById('reloadBindingsBtn');
  elements.bindingsList = document.getElementById('bindingsList');

  elements.manualBindForm = document.getElementById('manualBindForm');
  elements.manualEspKey = document.getElementById('manualEspKey');
  elements.manualKeyState = document.getElementById('manualKeyState');

  elements.serialSupport = document.getElementById('serialSupport');
  elements.connectUsbBtn = document.getElementById('connectUsbBtn');
  elements.disconnectUsbBtn = document.getElementById('disconnectUsbBtn');
  elements.refreshDeviceBtn = document.getElementById('refreshDeviceBtn');
  elements.refreshKeyBtn = document.getElementById('refreshKeyBtn');
  elements.linkDetectedBtn = document.getElementById('linkDetectedBtn');
  elements.usbStatus = document.getElementById('usbStatus');
  elements.serialLog = document.getElementById('serialLog');
  elements.detectedKeyValue = document.getElementById('detectedKeyValue');
  elements.bindingStateValue = document.getElementById('bindingStateValue');
  elements.vaultStateValue = document.getElementById('vaultStateValue');
  elements.deviceAccountsCount = document.getElementById('deviceAccountsCount');
  elements.detectedKeyHint = document.getElementById('detectedKeyHint');

  elements.vaultStateNotice = document.getElementById('vaultStateNotice');
  elements.vaultCreateForm = document.getElementById('vaultCreateForm');
  elements.vaultOwnerName = document.getElementById('vaultOwnerName');
  elements.vaultPin = document.getElementById('vaultPin');
  elements.vaultPhrase = document.getElementById('vaultPhrase');
  elements.vaultUnlockForm = document.getElementById('vaultUnlockForm');
  elements.unlockPin = document.getElementById('unlockPin');
  elements.unlockPhrase = document.getElementById('unlockPhrase');
  elements.vaultUnlockedPanel = document.getElementById('vaultUnlockedPanel');
  elements.lockVaultBtn = document.getElementById('lockVaultBtn');

  elements.refreshAccountsBtn = document.getElementById('refreshAccountsBtn');
  elements.accountsListPanel = document.getElementById('accountsListPanel');
  elements.deviceAccountsState = document.getElementById('deviceAccountsState');
  elements.deviceGuardState = document.getElementById('deviceGuardState');
  elements.deviceAccountForm = document.getElementById('deviceAccountForm');
  elements.accountService = document.getElementById('accountService');
  elements.accountLabel = document.getElementById('accountLabel');
  elements.accountUsernameLabel = document.getElementById('accountUsernameLabel');
  elements.accountUsername = document.getElementById('accountUsername');
  elements.accountAuthFlow = document.getElementById('accountAuthFlow');
  elements.accountScopes = document.getElementById('accountScopes');
  elements.accountTenantGroup = document.getElementById('accountTenantGroup');
  elements.accountTenant = document.getElementById('accountTenant');
  elements.accountServiceHint = document.getElementById('accountServiceHint');
  elements.accountRotateHours = document.getElementById('accountRotateHours');
  elements.accountBaseLength = document.getElementById('accountBaseLength');
  elements.accountSecurityLevel = document.getElementById('accountSecurityLevel');
  elements.accountSymbols = document.getElementById('accountSymbols');
  elements.accountAvoidAmbiguous = document.getElementById('accountAvoidAmbiguous');
  elements.deviceAccountsList = document.getElementById('deviceAccountsList');
  elements.accountsPanel = document.getElementById('accountsPanel');

  elements.usernameDisplay = document.getElementById('usernameDisplay');
  elements.userEmailDisplay = document.getElementById('userEmailDisplay');
  elements.alert = document.getElementById('alert');
}

function bindEvents() {
  elements.showLoginBtn.addEventListener('click', () => showAuthMode('login'));
  elements.showRegisterBtn.addEventListener('click', () => showAuthMode('register'));

  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.logoutBtn.addEventListener('click', () => {
    void handleLogout();
  });

  elements.reloadBindingsBtn.addEventListener('click', () => {
    void loadBindings();
  });
  elements.manualBindForm.addEventListener('submit', handleManualBind);
  elements.manualEspKey.addEventListener('input', handleManualKeyInput);

  elements.connectUsbBtn.addEventListener('click', () => {
    void connectUSB();
  });
  elements.disconnectUsbBtn.addEventListener('click', () => {
    void disconnectUSB();
  });
  elements.refreshDeviceBtn.addEventListener('click', () => {
    void refreshDeviceSnapshot();
  });
  elements.refreshKeyBtn.addEventListener('click', () => {
    void requestDeviceKey();
  });
  elements.linkDetectedBtn.addEventListener('click', () => {
    void bindKeyToCurrentUser(state.detectedKey, 'usb');
  });

  elements.vaultCreateForm.addEventListener('submit', handleVaultCreate);
  elements.vaultUnlockForm.addEventListener('submit', handleVaultUnlock);
  elements.lockVaultBtn.addEventListener('click', () => {
    void handleVaultLock();
  });

  elements.refreshAccountsBtn.addEventListener('click', () => {
    void loadDeviceAccounts();
  });
  elements.accountService.addEventListener('change', () => {
    syncAccountServiceProfile(true);
  });
  elements.deviceAccountForm.addEventListener('submit', handleDeviceAccountSubmit);

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
    setUSBStatus('Web Serial no esta disponible en este navegador.', 'error');
    elements.connectUsbBtn.disabled = true;
    return;
  }

  elements.serialSupport.textContent = 'Web Serial disponible. Puedes operar el vault del ESP por USB.';
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

function formatDate(value) {
  if (!value) {
    return 'fecha desconocida';
  }

  return new Date(value).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function setUSBStatus(message, tone = 'info') {
  elements.usbStatus.textContent = message;
  elements.usbStatus.className = `status-box status-box-${tone}`;
}

function setManualKeyState(message, tone = 'info') {
  elements.manualKeyState.textContent = message;
  elements.manualKeyState.className = `status-inline ${tone}`;
}

function setVaultNotice(message, tone = 'info') {
  elements.vaultStateNotice.textContent = message;
  elements.vaultStateNotice.className = `status-box status-box-${tone}`;
}

function setDeviceGuardState(message, tone = 'info') {
  elements.deviceGuardState.textContent = message;
  elements.deviceGuardState.className = `status-box status-box-${tone}`;
}

function setDeviceAccountsState(message, tone = 'info') {
  elements.deviceAccountsState.textContent = message;
  elements.deviceAccountsState.className = `status-box status-box-${tone}`;
}

function normalizeServiceKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SERVICE_PROFILES[normalized] ? normalized : normalized;
}

function getServiceProfile(serviceKey) {
  return SERVICE_PROFILES[normalizeServiceKey(serviceKey)] || null;
}

function formatServiceName(serviceKey) {
  const profile = getServiceProfile(serviceKey);
  return profile ? profile.title : (serviceKey || 'Servicio');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidGitHubIdentity(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  if (isValidEmail(text)) {
    return true;
  }
  return /^(?!-)(?!.*--)[A-Za-z\d-]{1,39}(?<!-)$/.test(text);
}

function isValidMicrosoftTenant(value) {
  return /^(common|organizations|consumers|[a-z0-9.-]{3,})$/i.test(String(value || '').trim());
}

function syncAccountServiceProfile(forceDefaults = false) {
  const serviceKey = normalizeServiceKey(elements.accountService.value || 'google');
  const profile = getServiceProfile(serviceKey) || SERVICE_PROFILES.google;
  const previousService = elements.deviceAccountForm.dataset.serviceKey || '';
  const serviceChanged = previousService !== serviceKey;

  elements.accountService.value = serviceKey;
  elements.accountUsernameLabel.textContent = profile.usernameLabel;
  elements.accountUsername.placeholder = profile.usernamePlaceholder;
  elements.accountUsername.type = profile.usernameMode === 'email' ? 'email' : 'text';
  elements.accountAuthFlow.value = profile.authFlow;
  elements.accountAuthFlow.readOnly = true;

  if (forceDefaults || serviceChanged || !elements.accountScopes.value.trim()) {
    elements.accountScopes.value = profile.defaultScopes;
  }

  elements.accountTenantGroup.hidden = !profile.usesTenant;
  if (profile.usesTenant) {
    if (forceDefaults || serviceChanged || !elements.accountTenant.value.trim()) {
      elements.accountTenant.value = profile.defaultTenant;
    }
  } else {
    elements.accountTenant.value = '';
  }

  elements.accountServiceHint.textContent = profile.hint;
  elements.deviceAccountForm.dataset.serviceKey = serviceKey;
}

function validateDeviceAccountValues(values) {
  const profile = getServiceProfile(values.service);
  if (!profile) {
    return 'Selecciona un servicio valido.';
  }
  if (values.label.length < 2 || values.label.length > 64) {
    return 'El alias dentro del vault debe tener entre 2 y 64 caracteres.';
  }
  if (values.username.length < 3 || values.username.length > 128) {
    return 'El identificador principal debe tener entre 3 y 128 caracteres.';
  }
  if (values.scopes.length < 3 || values.scopes.length > 160) {
    return 'Los scopes o permisos deben tener entre 3 y 160 caracteres.';
  }

  if (values.service === 'google' && !isValidEmail(values.username)) {
    return 'Google necesita un correo valido.';
  }
  if (values.service === 'github' && !isValidGitHubIdentity(values.username)) {
    return 'GitHub necesita un usuario valido o un correo valido.';
  }
  if (values.service === 'microsoft') {
    if (!isValidEmail(values.username)) {
      return 'Microsoft necesita un correo valido.';
    }
    if (!isValidMicrosoftTenant(values.tenant)) {
      return 'El tenant de Microsoft no es valido.';
    }
  }
  if (values.service === 'spotify' && values.username.length < 2) {
    return 'Spotify necesita un usuario o correo valido.';
  }

  return '';
}

function updateUSBButtons(connected) {
  elements.connectUsbBtn.disabled = connected || !('serial' in navigator);
  elements.disconnectUsbBtn.disabled = !connected;
  elements.refreshDeviceBtn.disabled = !connected;
  elements.refreshKeyBtn.disabled = !connected;
}

function appendSerialLog(line) {
  state.serialLines.push(line);
  state.serialLines = state.serialLines.slice(-60);
  elements.serialLog.textContent = state.serialLines.join('\n');
  elements.serialLog.scrollTop = elements.serialLog.scrollHeight;
}

function resetSerialLog() {
  state.serialLines = [];
  elements.serialLog.textContent = 'Esperando actividad del puerto serial...';
}

function apiFetch(path, options = {}) {
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

  return fetch(`${API_URL}${path}`, request)
    .then(async (response) => ({
      response,
      data: await response.json().catch(() => ({}))
    }));
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
      showAlert(data.error || 'No se pudo iniciar sesion.', 'error');
      return;
    }

    state.token = data.token;
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', String(data.userId));

    showAlert('Sesion iniciada correctamente.', 'success');
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
    showAlert('La contrasena debe tener al menos 6 caracteres.', 'error');
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
      showAlert(data.error || 'Tu sesion ya no es valida.', 'error');
      return;
    }

    state.currentUser = data;
    elements.usernameDisplay.textContent = data.username;
    elements.userEmailDisplay.textContent = data.email;
    showDashboardView();
    setManualKeyState('Introduce una key hexadecimal de 12 caracteres.', 'info');
    await loadBindings();

    if (state.port) {
      await refreshDeviceSnapshot();
    }
  } catch (error) {
    await handleLogout(false);
    showAlert('No fue posible cargar tu sesion.', 'error');
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
    } else {
      syncDevicePanels();
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
    empty.textContent = 'Todavia no hay keys vinculadas a esta cuenta.';
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
    meta.textContent = `Reservada el ${formatDate(binding.registered_at)}`;
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'binding-actions';

    if (binding.esp_key === state.detectedKey) {
      const badge = document.createElement('span');
      badge.className = 'binding-badge success';
      badge.textContent = 'ESP conectado';
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

    const wipeButton = document.createElement('button');
    wipeButton.type = 'button';
    wipeButton.className = 'btn danger-btn';
    wipeButton.textContent = 'Borrar vault';
    wipeButton.disabled = !(state.port && binding.esp_key === state.detectedKey);
    wipeButton.title = wipeButton.disabled
      ? 'Conecta por USB este ESP para borrar su vault.'
      : 'Borra por completo el vault del ESP conectado.';
    wipeButton.addEventListener('click', () => {
      void handleVaultWipe(binding.esp_key);
    });
    actions.appendChild(wipeButton);

    item.appendChild(info);
    item.appendChild(actions);
    elements.bindingsList.appendChild(item);
  });
}

async function deleteBinding(bindingId) {
  const confirmed = window.confirm('Quieres eliminar esta key de tu cuenta?');
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
    showAlert('La key del ESP no tiene un formato valido.', 'error');
    return;
  }

  await bindKeyToCurrentUser(key, 'manual');
}

async function bindKeyToCurrentUser(key, source) {
  if (!isValidDeviceKey(key)) {
    showAlert('No hay una key valida para vincular.', 'error');
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
    setManualKeyState('La key todavia esta incompleta o es invalida.', 'warning');
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
    return 'Esta key ya esta vinculada a tu cuenta.';
  }
  if (keyState.available) {
    return 'La key esta libre y se puede vincular.';
  }
  return 'La key ya esta reservada por otra cuenta.';
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

async function refreshDetectedKeyState(key) {
  try {
    state.detectedKeyState = await fetchKeyState(key);
    syncDevicePanels();
    renderBindings();
  } catch (error) {
    state.detectedKeyState = null;
    elements.detectedKeyHint.textContent = 'La key se detecto, pero no se pudo validar contra el servidor.';
    setUSBStatus('La key se detecto, pero fallo la validacion con el servidor.', 'error');
    syncDevicePanels();
  }
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
    setUSBStatus('Puerto conectado. Consultando el estado del ESP...', 'info');
    syncDevicePanels();

    void startSerialReader();

    await wait(250);
    await refreshDeviceSnapshot();
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
      return;
    }

    const key = extractDeviceKey(cleanLine);
    if (key) {
      void applyDetectedKey(key);
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

  pending.frames.push(frame);

  if (frame.status === 'ERR') {
    clearTimeout(pending.timeoutId);
    state.pendingRequests.delete(frame.requestId);
    pending.reject(new Error(protocolErrorMessage(frame)));
    return;
  }

  if (pending.completion === 'done') {
    if (frame.kind === 'DONE') {
      clearTimeout(pending.timeoutId);
      state.pendingRequests.delete(frame.requestId);
      pending.resolve(pending.frames);
    }
    return;
  }

  clearTimeout(pending.timeoutId);
  state.pendingRequests.delete(frame.requestId);
  pending.resolve(pending.frames);
}

function applyProtocolFrameSideEffects(frame) {
  if (frame.kind === 'HELLO' || frame.kind === 'INFO') {
    const payload = parseKeyValuePayload(frame.params[0] || '');
    const nextInfo = buildDeviceInfo(payload);
    if (nextInfo) {
      state.deviceInfo = nextInfo;
      if (isValidDeviceKey(nextInfo.device_id)) {
        void applyDetectedKey(nextInfo.device_id);
      } else {
        syncDevicePanels();
      }
    }
    return;
  }

  if (frame.kind === 'DEVICE_ID') {
    const payload = parseKeyValuePayload(frame.params[0] || '');
    const key = normalizeDeviceKey(payload.device_id);
    if (key) {
      void applyDetectedKey(key);
    }
    return;
  }

  if (frame.kind === 'SESSION') {
    const payload = parseKeyValuePayload(frame.params[0] || '');
    const nextInfo = buildDeviceInfo(payload, state.deviceInfo);
    if (nextInfo) {
      state.deviceInfo = nextInfo;
      syncDevicePanels();
    }
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
  const previous = base || state.deviceInfo || {};

  return {
    device_id: normalizeDeviceKey(source.device_id || previous.device_id || ''),
    console: source.console || previous.console || '',
    ble: parseFlag(source.ble, previous.ble),
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

function protocolErrorMessage(frame) {
  const payload = parseKeyValuePayload(frame.params[0] || '');
  const reason = payload.reason || 'operation_failed';

  switch (reason) {
    case 'invalid_unlock_payload':
      return 'El PIN o la frase secreta no pudieron enviarse al ESP. Prueba una frase mas corta o sin caracteres raros.';
    case 'invalid_create_payload':
      return 'Los datos del vault no pudieron enviarse al ESP. Revisa la longitud del nombre, PIN y frase secreta.';
    case 'vault_locked':
      return 'El vault del ESP esta bloqueado.';
    case 'vault_not_found':
      return 'El ESP todavia no tiene un vault creado.';
    case 'vault_exists':
      return 'Ese ESP ya tiene un vault creado.';
    case 'wrong_pin':
      return 'PIN o frase secreta incorrectos.';
    case 'account_not_found':
      return 'La cuenta no existe dentro del ESP.';
    case 'rate_limited':
      return 'El ESP activo la proteccion por intentos fallidos.';
    case 'invalid_param':
      return 'Los datos enviados al ESP no son validos.';
    case 'encode_failed':
      return 'El ESP no pudo serializar la respuesta.';
    default:
      return `El ESP respondio con error: ${reason}`;
  }
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
  elements.detectedKeyHint.textContent = 'Key detectada por USB. Validando contra el servidor...';
  syncDevicePanels();
  await refreshDetectedKeyState(key);
}

async function requestDeviceKey() {
  if (!state.port) {
    showAlert('Conecta primero un puerto USB.', 'error');
    return;
  }

  try {
    const frames = await sendProtocolRequest('GET|DEVICE_ID');
    const payload = parseKeyValuePayload(frames[0]?.params[0] || '');
    const key = normalizeDeviceKey(payload.device_id);

    if (key) {
      await applyDetectedKey(key);
      setUSBStatus(`Key leida correctamente: ${formatKey(key)}.`, 'success');
      return;
    }

    throw new Error('DEVICE_ID_NOT_FOUND');
  } catch (error) {
    try {
      await sendSerialCommand('\r');
      await wait(120);
      await sendSerialCommand('ID\r');
      appendSerialLog('[usb] -> ID');
      setUSBStatus('Solicitando key por compatibilidad legacy...', 'info');
    } catch (legacyError) {
      showAlert('No fue posible solicitar la key por serial.', 'error');
      setUSBStatus('No fue posible escribir en el puerto serial.', 'error');
    }
  }
}

function nextRequestId(prefix = 'web') {
  state.requestSequence += 1;
  return `${prefix}-${state.requestSequence}`;
}

function sendProtocolRequest(command, options = {}) {
  if (!state.port) {
    return Promise.reject(new Error('PORT_NOT_READY'));
  }

  const requestId = nextRequestId(options.prefix || 'web');
  const completion = options.completion || 'single';
  const timeoutMs = options.timeoutMs || 4500;
  const fullCommand = `${KLAUS_PROTOCOL_PREFIX}|${KLAUS_PROTOCOL_VERSION}|${requestId}|${command}`;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      state.pendingRequests.delete(requestId);
      reject(new Error('TIMEOUT'));
    }, timeoutMs);

    state.pendingRequests.set(requestId, {
      completion,
      frames: [],
      resolve,
      reject,
      timeoutId
    });

    sendSerialCommand(`${fullCommand}\r`)
      .then(() => {
        appendSerialLog(`[usb] -> ${fullCommand}`);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        state.pendingRequests.delete(requestId);
        reject(error);
      });
  });
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

async function refreshDeviceSnapshot() {
  if (!state.port) {
    showAlert('Conecta primero un ESP por USB.', 'error');
    return;
  }

  try {
    const infoFrames = await sendProtocolRequest('GET|INFO');
    const payload = parseKeyValuePayload(infoFrames[0]?.params[0] || '');
    state.deviceInfo = buildDeviceInfo(payload);

    if (isValidDeviceKey(state.deviceInfo.device_id)) {
      state.detectedKey = state.deviceInfo.device_id;
      await refreshDetectedKeyState(state.detectedKey);
      setUSBStatus(`ESP detectado: ${formatKey(state.detectedKey)}. Estado actualizado.`, 'success');
    } else {
      await requestDeviceKey();
    }

    if (canManageDeviceAccounts()) {
      await loadDeviceAccounts(false);
    } else {
      state.deviceAccounts = [];
      renderDeviceAccounts();
      syncDevicePanels();
    }
  } catch (error) {
    if (String(error.message || '') === 'TIMEOUT') {
      setUSBStatus('El ESP no respondio al protocolo USB a tiempo.', 'error');
    } else {
      setUSBStatus(error.message || 'No fue posible consultar el estado del ESP.', 'error');
    }
    syncDevicePanels();
  }
}

function canUseCurrentDevice() {
  return Boolean(state.port && isValidDeviceKey(state.detectedKey));
}

function isDetectedDeviceOwnedByCurrentUser() {
  return Boolean(state.detectedKeyState && state.detectedKeyState.owned_by_current_user);
}

function canManageDeviceAccounts() {
  return Boolean(canUseCurrentDevice() &&
    isDetectedDeviceOwnedByCurrentUser() &&
    state.deviceInfo &&
    state.deviceInfo.vault_exists &&
    state.deviceInfo.vault_unlocked);
}

function syncDevicePanels() {
  elements.detectedKeyValue.textContent = formatKey(state.detectedKey);
  elements.bindingStateValue.textContent = describeBindingSummary();
  elements.vaultStateValue.textContent = describeVaultSummary();
  elements.deviceAccountsCount.textContent = String(state.deviceInfo?.total_accounts ?? state.deviceAccounts.length);

  const hasVaultSurface = Boolean(
    canUseCurrentDevice() &&
    isDetectedDeviceOwnedByCurrentUser() &&
    state.deviceInfo &&
    state.deviceInfo.vault_exists
  );

  elements.accountsPanel.hidden = !hasVaultSurface;
  elements.accountsListPanel.hidden = !hasVaultSurface;

  if (!state.detectedKey) {
    elements.detectedKeyHint.textContent = 'Cuando el ESP responda por serial, aqui veras su key unica y el estado del vault.';
  } else if (state.detectedKeyState) {
    elements.detectedKeyHint.textContent = describeKeyState(state.detectedKeyState);
  }

  elements.linkDetectedBtn.disabled = !Boolean(
    state.detectedKey &&
    state.detectedKeyState &&
    state.detectedKeyState.available
  );

  elements.refreshAccountsBtn.disabled = !canManageDeviceAccounts();
  toggleFormDisabled(elements.deviceAccountForm, !canManageDeviceAccounts());
  syncVaultPanels();
}

function describeBindingSummary() {
  if (!state.detectedKey) {
    return 'Sin validar';
  }
  if (!state.detectedKeyState) {
    return 'Validando...';
  }
  if (state.detectedKeyState.owned_by_current_user) {
    return 'Reservada en esta cuenta';
  }
  if (state.detectedKeyState.available) {
    return 'Libre para vincular';
  }
  return 'Reservada por otra cuenta';
}

function describeVaultSummary() {
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

function syncVaultPanels() {
  const authorized = isDetectedDeviceOwnedByCurrentUser();

  elements.vaultCreateForm.hidden = true;
  elements.vaultUnlockForm.hidden = true;
  elements.vaultUnlockedPanel.hidden = true;

  if (!state.port) {
    setVaultNotice('Conecta un ESP autorizado para consultar su vault.', 'info');
    setDeviceGuardState('Conecta un ESP, valida su key y desbloquea el vault para administrar cuentas.', 'info');
    setDeviceAccountsState('Conecta un ESP autorizado para consultar las cuentas del vault.', 'info');
    return;
  }

  if (!isValidDeviceKey(state.detectedKey)) {
    setVaultNotice('Solicita primero el DEVICE_ID del ESP por USB.', 'info');
    setDeviceGuardState('Solicita primero la key del ESP para saber con que dispositivo estas trabajando.', 'info');
    setDeviceAccountsState('Solicita primero la key del ESP para saber que vault quieres leer.', 'info');
    return;
  }

  if (!state.detectedKeyState) {
    setVaultNotice('Validando la key detectada contra el servidor...', 'info');
    setDeviceGuardState('Esperando la validacion de la key contra tu cuenta.', 'info');
    setDeviceAccountsState('Esperando la validacion de la key para habilitar el listado del vault.', 'info');
    return;
  }

  if (!authorized) {
    if (state.detectedKeyState.available) {
      setVaultNotice('Esta key aun no esta reservada. Vinculala a tu cuenta para operar el vault.', 'warning');
      setDeviceGuardState('Reserva la key detectada antes de enviar informacion al ESP.', 'warning');
      setDeviceAccountsState('Reserva primero esta key para consultar las cuentas del vault.', 'warning');
    } else {
      setVaultNotice('Esta key pertenece a otra cuenta y no se puede administrar desde esta sesion.', 'error');
      setDeviceGuardState('La key detectada pertenece a otra cuenta. No puedes modificar este ESP.', 'error');
      setDeviceAccountsState('La key detectada pertenece a otra cuenta. No puedes listar sus cuentas.', 'error');
    }
    return;
  }

  if (!state.deviceInfo) {
    setVaultNotice('Consulta el estado del ESP para saber si el vault existe o esta bloqueado.', 'info');
    setDeviceGuardState('Actualiza el estado del ESP antes de operar sus cuentas.', 'info');
    setDeviceAccountsState('Actualiza el estado del ESP para saber si el vault existe.', 'info');
    return;
  }

  if (!state.deviceInfo.vault_exists) {
    elements.vaultCreateForm.hidden = false;
    setVaultNotice('Este ESP todavia no tiene un vault. Crealo por USB para empezar a guardar cuentas.', 'warning');
    setDeviceGuardState('Primero crea el vault local del ESP. Sin eso no hay donde guardar cuentas.', 'warning');
    setDeviceAccountsState('Este ESP todavia no tiene un vault creado, asi que no hay cuentas para listar.', 'warning');
    return;
  }

  if (!state.deviceInfo.vault_unlocked) {
    elements.vaultUnlockForm.hidden = false;
    setVaultNotice('El vault existe, pero esta bloqueado. Desbloquealo para administrar cuentas.', 'info');
    setDeviceGuardState('Desbloquea el vault para leer o guardar cuentas dentro del ESP.', 'info');
    setDeviceAccountsState('El vault existe, pero esta bloqueado. Desbloquealo para leer las cuentas guardadas.', 'info');
    return;
  }

  elements.vaultUnlockedPanel.hidden = false;
  setVaultNotice('Vault desbloqueado. Todo lo que guardes ahora se escribe directamente en el ESP.', 'success');
  setDeviceGuardState('ESP listo. Puedes crear, rotar o borrar cuentas dentro del vault local.', 'success');
  setDeviceAccountsState(
    state.deviceAccounts.length > 0
      ? 'Estas son las cuentas que viven dentro del vault del ESP.'
      : 'El vault esta desbloqueado. Todavia no hay cuentas guardadas en este dispositivo.',
    state.deviceAccounts.length > 0 ? 'success' : 'info'
  );
}

function toggleFormDisabled(form, disabled) {
  Array.from(form.elements).forEach((element) => {
    element.disabled = disabled;
  });
}

async function handleVaultCreate(event) {
  event.preventDefault();

  if (!isDetectedDeviceOwnedByCurrentUser()) {
    showAlert('Reserva primero la key detectada en tu cuenta.', 'error');
    return;
  }

  const name = elements.vaultOwnerName.value.trim();
  const pin = elements.vaultPin.value;
  const phrase = elements.vaultPhrase.value;

  if (name.length < 2) {
    showAlert('Introduce un nombre valido para el propietario.', 'error');
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
    setVaultNotice('Creando vault en el ESP. Esta operacion puede tardar unos segundos.', 'info');
    setDeviceAccountsState('Esperando a que el ESP cree el vault antes de listar cuentas.', 'info');
    await sendProtocolRequest(`SESSION|CREATE|${encodeToken(name)}|${encodeToken(pin)}|${encodeToken(phrase)}`, {
      timeoutMs: VAULT_OPERATION_TIMEOUT_MS
    });
    elements.vaultCreateForm.reset();
    showAlert('Vault creado correctamente en el ESP.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    if (String(error.message || '') === 'TIMEOUT') {
      showAlert('El ESP tardo demasiado en crear el vault. Espera unos segundos y vuelve a consultar el estado del dispositivo.', 'error');
      setVaultNotice('La creacion del vault tardo demasiado. Si el ESP sigue trabajando, espera un poco y pulsa "Actualizar ESP".', 'error');
      setDeviceAccountsState('Todavia no se pudo confirmar la creacion del vault.', 'error');
      return;
    }

    showAlert(error.message || 'No fue posible crear el vault en el ESP.', 'error');
  }
}

async function handleVaultUnlock(event) {
  event.preventDefault();

  const pin = elements.unlockPin.value;
  const phrase = elements.unlockPhrase.value;

  if (pin.length < 4 || phrase.length < 6) {
    showAlert('Introduce un PIN y una frase secreta validos.', 'error');
    return;
  }

  try {
    setVaultNotice('Desbloqueando vault. El ESP puede tardar varios segundos derivando las claves.', 'info');
    setDeviceAccountsState('Esperando a que el ESP desbloquee el vault para poder listar las cuentas.', 'info');
    await sendProtocolRequest(`SESSION|UNLOCK|${encodeToken(pin)}|${encodeToken(phrase)}`, {
      timeoutMs: VAULT_OPERATION_TIMEOUT_MS
    });
    elements.vaultUnlockForm.reset();
    showAlert('Vault desbloqueado correctamente.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    if (String(error.message || '') === 'TIMEOUT') {
      showAlert('El ESP tardo demasiado en desbloquear el vault. Espera unos segundos y vuelve a actualizar el estado del dispositivo.', 'error');
      setVaultNotice('El desbloqueo tardo demasiado. Si el ESP sigue trabajando, espera un poco y pulsa "Actualizar ESP".', 'error');
      setDeviceAccountsState('No se pudo confirmar a tiempo el desbloqueo del vault.', 'error');
      return;
    }

    showAlert(error.message || 'No fue posible desbloquear el vault.', 'error');
  }
}

async function handleVaultLock() {
  try {
    await sendProtocolRequest('SESSION|LOCK');
    state.deviceAccounts = [];
    renderDeviceAccounts();
    showAlert('Vault bloqueado correctamente.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    showAlert(error.message || 'No fue posible bloquear el vault.', 'error');
  }
}

async function handleVaultWipe(expectedKey = '') {
  if (!state.port || !isValidDeviceKey(state.detectedKey)) {
    showAlert('Conecta primero por USB el ESP cuyo vault quieres borrar.', 'error');
    return;
  }

  if (expectedKey && expectedKey !== state.detectedKey) {
    showAlert('Conecta por USB exactamente el ESP de esa key antes de borrar su vault.', 'error');
    return;
  }

  if (!isDetectedDeviceOwnedByCurrentUser()) {
    showAlert('Solo puedes borrar el vault de un ESP reservado en tu cuenta.', 'error');
    return;
  }

  const confirmed = window.confirm(
    `Esto borrara todo el vault del ESP ${formatKey(state.detectedKey)}, incluyendo cuentas, configuracion y datos cifrados. Esta accion no se puede deshacer. Quieres continuar?`
  );

  if (!confirmed) {
    return;
  }

  try {
    await sendProtocolRequest('SESSION|WIPE', { timeoutMs: 8000 });
    state.deviceAccounts = [];
    renderDeviceAccounts();
    showAlert('El vault del ESP fue borrado correctamente.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    showAlert(error.message || 'No fue posible borrar el vault del ESP.', 'error');
  }
}

function encodeToken(value) {
  return encodeURIComponent(String(value || '').trim());
}

async function loadDeviceAccounts(showFeedback = true) {
  if (!canManageDeviceAccounts()) {
    state.deviceAccounts = [];
    renderDeviceAccounts();
    syncDevicePanels();
    return;
  }

  try {
    setDeviceAccountsState('Leyendo las cuentas guardadas dentro del vault del ESP...', 'info');
    const frames = await sendProtocolRequest('GET|ACCOUNTS', {
      completion: 'done',
      timeoutMs: 10000
    });

    state.deviceAccounts = frames
      .filter((frame) => frame.kind === 'ACCOUNT' && frame.status === 'OK')
      .map(parseAccountFrame)
      .filter(Boolean);

    renderDeviceAccounts();
    syncDevicePanels();
    setDeviceAccountsState(
      state.deviceAccounts.length > 0
        ? `${state.deviceAccounts.length} cuenta(s) cargadas desde el vault del ESP.`
        : 'El vault esta desbloqueado, pero todavia no hay cuentas guardadas.',
      state.deviceAccounts.length > 0 ? 'success' : 'info'
    );

    if (showFeedback) {
      showAlert('Cuentas del ESP actualizadas.', 'success');
    }
  } catch (error) {
    state.deviceAccounts = [];
    renderDeviceAccounts();
    syncDevicePanels();
    setDeviceAccountsState(
      String(error.message || '') === 'TIMEOUT'
        ? 'El ESP tardo demasiado en devolver el listado de cuentas.'
        : (error.message || 'No fue posible leer las cuentas del ESP.'),
      'error'
    );
    if (showFeedback) {
      showAlert(error.message || 'No fue posible leer las cuentas del ESP.', 'error');
    }
  }
}

function parseAccountFrame(frame) {
  const usesExtendedShape = frame.params.length >= 13;
  const [
    accountId,
    rawService,
    rawLabel,
    rawUsername,
    rawAuthFlow,
    rawScopes,
    rawTenant,
    rotateHours,
    counter,
    baseLength,
    level,
    symbols,
    avoidAmbiguous
  ] = usesExtendedShape
    ? frame.params
    : [
        frame.params[0],
        frame.params[1],
        '',
        frame.params[2],
        '',
        '',
        '',
        frame.params[3],
        frame.params[4],
        frame.params[5],
        frame.params[6],
        frame.params[7],
        frame.params[8]
      ];

  if (!accountId) {
    return null;
  }

  const decodedService = decodeToken(rawService);
  const serviceKey = normalizeServiceKey(decodedService);
  const profile = getServiceProfile(serviceKey);

  return {
    account_id: accountId,
    service: serviceKey || decodedService,
    service_name: formatServiceName(serviceKey || decodedService),
    label: decodeToken(rawLabel),
    username: decodeToken(rawUsername),
    auth_flow: decodeToken(rawAuthFlow) || profile?.authFlow || '',
    scopes: decodeToken(rawScopes) || profile?.defaultScopes || '',
    tenant: decodeToken(rawTenant),
    rotate_hours: parseInteger(rotateHours, 0),
    counter: parseInteger(counter, 0),
    policy: {
      base_length: parseInteger(baseLength, 16),
      level: parseInteger(level, 1),
      symbols: symbols === '1',
      avoid_ambiguous: avoidAmbiguous === '1'
    }
  };
}

function decodeToken(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (error) {
    return value || '';
  }
}

async function handleDeviceAccountSubmit(event) {
  event.preventDefault();

  if (!canManageDeviceAccounts()) {
    showAlert('El ESP debe estar autorizado y con el vault desbloqueado.', 'error');
    return;
  }

  syncAccountServiceProfile();

  const values = {
    service: normalizeServiceKey(elements.accountService.value),
    label: elements.accountLabel.value.trim(),
    username: elements.accountUsername.value.trim(),
    authFlow: elements.accountAuthFlow.value.trim(),
    scopes: elements.accountScopes.value.trim(),
    tenant: elements.accountTenant.value.trim() || 'common'
  };

  const validationError = validateDeviceAccountValues(values);
  if (validationError) {
    showAlert(validationError, 'error');
    return;
  }

  const command = [
    'ACCOUNT',
    'ADD',
    encodeToken(values.service),
    encodeToken(values.label),
    encodeToken(values.username),
    encodeToken(values.authFlow),
    encodeToken(values.scopes),
    encodeToken(values.service === 'microsoft' ? values.tenant : ''),
    elements.accountRotateHours.value,
    elements.accountBaseLength.value,
    elements.accountSecurityLevel.value,
    elements.accountSymbols.checked ? '1' : '0',
    elements.accountAvoidAmbiguous.checked ? '1' : '0'
  ].join('|');

  try {
    await sendProtocolRequest(command, { timeoutMs: 7000 });
    elements.deviceAccountForm.reset();
    syncAccountServiceProfile(true);
    elements.accountRotateHours.value = '168';
    elements.accountBaseLength.value = '16';
    elements.accountSecurityLevel.value = '1';
    elements.accountSymbols.checked = true;
    elements.accountAvoidAmbiguous.checked = true;
    showAlert('Cuenta guardada correctamente en el ESP.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    showAlert(error.message || 'No fue posible guardar la cuenta en el ESP.', 'error');
  }
}

function renderDeviceAccounts() {
  elements.deviceAccountsList.replaceChildren();

  if (state.deviceAccounts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    if (!state.deviceInfo?.vault_exists) {
      empty.textContent = 'Este ESP todavia no tiene un vault creado.';
    } else if (!state.deviceInfo?.vault_unlocked) {
      empty.textContent = 'Desbloquea el vault para ver el listado de cuentas guardadas.';
    } else {
      empty.textContent = 'Todavia no hay cuentas cargadas en este ESP.';
    }
    elements.deviceAccountsList.appendChild(empty);
    return;
  }

  state.deviceAccounts.forEach((account) => {
    const card = document.createElement('article');
    card.className = 'device-account-card';

    const left = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'device-account-header';

    const service = document.createElement('strong');
    service.className = 'device-account-service';
    service.textContent = account.service_name || formatServiceName(account.service);
    header.appendChild(service);

    const accountId = document.createElement('code');
    accountId.className = 'device-account-id';
    accountId.textContent = account.account_id;
    header.appendChild(accountId);

    const pill = document.createElement('span');
    pill.className = 'device-pill info';
    pill.textContent = `Rota cada ${account.rotate_hours}h`;
    header.appendChild(pill);

    if (account.auth_flow) {
      const flowPill = document.createElement('span');
      flowPill.className = 'device-pill success';
      flowPill.textContent = account.auth_flow;
      header.appendChild(flowPill);
    }

    left.appendChild(header);

    if (account.label) {
      const label = document.createElement('p');
      label.className = 'device-account-meta';
      label.textContent = `Alias: ${account.label}`;
      left.appendChild(label);
    }

    const meta = document.createElement('p');
    meta.className = 'device-account-meta';
    meta.textContent = `Identificador: ${account.username} | Contador: ${account.counter}`;
    left.appendChild(meta);

    if (account.tenant) {
      const tenant = document.createElement('p');
      tenant.className = 'device-account-meta';
      tenant.textContent = `Tenant: ${account.tenant}`;
      left.appendChild(tenant);
    }

    if (account.scopes) {
      const scopes = document.createElement('p');
      scopes.className = 'device-account-meta';
      scopes.textContent = `Scopes: ${account.scopes}`;
      left.appendChild(scopes);
    }

    const policy = document.createElement('p');
    policy.className = 'device-account-policy';
    policy.textContent = `Politica: base ${account.policy.base_length}, nivel ${account.policy.level}, simbolos ${account.policy.symbols ? 'si' : 'no'}, ambiguos ${account.policy.avoid_ambiguous ? 'no' : 'si'}`;
    left.appendChild(policy);

    const actions = document.createElement('div');
    actions.className = 'device-account-actions';

    const rotateButton = document.createElement('button');
    rotateButton.type = 'button';
    rotateButton.className = 'btn account-rotate-btn';
    rotateButton.textContent = 'Rotar';
    rotateButton.addEventListener('click', () => {
      void rotateDeviceAccount(account.account_id);
    });
    actions.appendChild(rotateButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn account-delete-btn';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', () => {
      void deleteDeviceAccount(account.account_id);
    });
    actions.appendChild(deleteButton);

    card.appendChild(left);
    card.appendChild(actions);
    elements.deviceAccountsList.appendChild(card);
  });
}

async function rotateDeviceAccount(accountId) {
  if (!canManageDeviceAccounts()) {
    showAlert('El ESP debe estar listo y desbloqueado para rotar cuentas.', 'error');
    return;
  }

  try {
    await sendProtocolRequest(`ACCOUNT|ROTATE|${accountId}`, { timeoutMs: 7000 });
    showAlert(`Cuenta ${accountId} rotada correctamente.`, 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    showAlert(error.message || 'No fue posible rotar la cuenta.', 'error');
  }
}

async function deleteDeviceAccount(accountId) {
  if (!canManageDeviceAccounts()) {
    showAlert('El ESP debe estar listo y desbloqueado para borrar cuentas.', 'error');
    return;
  }

  const confirmed = window.confirm(`Quieres eliminar la cuenta ${accountId} del ESP?`);
  if (!confirmed) {
    return;
  }

  try {
    await sendProtocolRequest(`ACCOUNT|DELETE|${accountId}`, { timeoutMs: 7000 });
    showAlert(`Cuenta ${accountId} eliminada del ESP.`, 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    showAlert(error.message || 'No fue posible eliminar la cuenta del ESP.', 'error');
  }
}

async function disconnectUSB(showNotice = true) {
  rejectPendingRequests('USB_DISCONNECTED');

  if (state.reader) {
    try {
      await state.reader.cancel();
    } catch (error) {
      // Ignorado a proposito.
    }
  }

  if (state.port) {
    try {
      await state.port.close();
    } catch (error) {
      // Ignorado a proposito.
    }
  }

  state.port = null;
  state.reader = null;
  state.deviceInfo = null;
  state.deviceAccounts = [];
  state.detectedKey = '';
  state.detectedKeyState = null;
  updateUSBButtons(false);
  setUSBStatus('Sin conexion USB.', 'info');
  syncDevicePanels();
  renderBindings();
  renderDeviceAccounts();

  if (showNotice) {
    showAlert('Conexion USB cerrada.', 'info');
  }
}

function rejectPendingRequests(reason) {
  state.pendingRequests.forEach((pending, requestId) => {
    window.clearTimeout(pending.timeoutId);
    pending.reject(new Error(reason));
    state.pendingRequests.delete(requestId);
  });
}

async function handlePortDisconnected() {
  if (!state.port) {
    return;
  }

  await disconnectUSB(false);
  setUSBStatus('El puerto USB se desconecto.', 'error');
}

async function handleLogout(showMessage = true) {
  await disconnectUSB(false);

  state.token = null;
  state.currentUser = null;
  state.bindings = [];
  localStorage.removeItem('token');
  localStorage.removeItem('userId');

  elements.loginForm.reset();
  elements.registerForm.reset();
  elements.manualBindForm.reset();
  elements.vaultCreateForm.reset();
  elements.vaultUnlockForm.reset();
  elements.deviceAccountForm.reset();
  syncAccountServiceProfile(true);

  setManualKeyState('Introduce una key hexadecimal de 12 caracteres.', 'info');
  renderBindings();
  renderDeviceAccounts();
  syncDevicePanels();
  showLoggedOutView();
  showAuthMode('login');

  if (showMessage) {
    showAlert('Sesion cerrada.', 'info');
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
