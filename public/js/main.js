const API_URL = `${window.location.origin}/api`;
const DEVICE_KEY_PATTERN = /^[a-f0-9]{12}$/i;
const SERIAL_BAUD_RATE = 115200;
const KLAUS_PROTOCOL_PREFIX = 'KLAUS';
const KLAUS_PROTOCOL_VERSION = '1';
const VAULT_OPERATION_TIMEOUT_MS = 30000;
const DEFAULT_OAUTH_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_AUTOFILL_DELAY_MS = 4000;

const SERVICE_PROFILES = {
  website: {
    title: 'Sitio web',
    usernameLabel: 'Usuario o correo',
    usernamePlaceholder: 'usuario o correo',
    usernameMode: 'text',
    authFlow: 'local_autofill',
    defaultScopes: 'autofill',
    usesTenant: false,
    defaultTenant: '',
    hint: 'Autofill local por BLE.',
    showScopes: false,
    oauthCapable: false,
    defaultPolicy: {
      rotateHours: '168',
      baseLength: '20',
      level: '2',
      symbols: '1',
      avoidAmbiguous: '0'
    }
  },
  google: {
    title: 'Google',
    usernameLabel: 'Correo de Google',
    usernamePlaceholder: 'usuario@gmail.com',
    usernameMode: 'email',
    authFlow: 'limited_input_device',
    defaultScopes: 'openid email profile',
    usesTenant: false,
    defaultTenant: '',
    hint: 'Flujo oficial de Google.',
    showScopes: true,
    oauthCapable: true,
    defaultPolicy: {
      rotateHours: '168',
      baseLength: '16',
      level: '1',
      symbols: '1',
      avoidAmbiguous: '1'
    }
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
    hint: 'Flujo oficial de GitHub.',
    showScopes: true,
    oauthCapable: true,
    defaultPolicy: {
      rotateHours: '168',
      baseLength: '16',
      level: '1',
      symbols: '1',
      avoidAmbiguous: '1'
    }
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
    hint: 'Flujo oficial de Microsoft.',
    showScopes: true,
    oauthCapable: true,
    defaultPolicy: {
      rotateHours: '168',
      baseLength: '18',
      level: '1',
      symbols: '1',
      avoidAmbiguous: '1'
    }
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
    hint: 'Flujo oficial de Spotify.',
    showScopes: true,
    oauthCapable: true,
    defaultPolicy: {
      rotateHours: '168',
      baseLength: '16',
      level: '1',
      symbols: '1',
      avoidAmbiguous: '1'
    }
  }
};

const FALLBACK_ACCOUNT_POLICY = {
  rotateHours: '168',
  baseLength: '16',
  level: '1',
  symbols: '1',
  avoidAmbiguous: '1'
};

const OAUTH_PROVIDER_SETUP = {
  google: {
    title: 'Google',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'Tu client ID de Google' },
      { key: 'client_secret', label: 'Client Secret', type: 'password', placeholder: 'Tu client secret de Google' }
    ],
    note: 'Necesitas una app OAuth de Google preparada para device flow y permisos como openid, email y profile.'
  },
  github: {
    title: 'GitHub',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'Tu client ID de GitHub' }
    ],
    note: 'Necesitas una OAuth App de GitHub con device flow habilitado.'
  },
  microsoft: {
    title: 'Microsoft',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'Tu client ID de Microsoft' }
    ],
    note: 'Registra una app en Microsoft Entra y habilita device code flow.'
  },
  spotify: {
    title: 'Spotify',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'Tu client ID de Spotify' }
    ],
    note: 'Spotify usa popup con PKCE. Debes dar de alta la URL de callback que te mostramos abajo.'
  }
};

const MICROSOFT_STANDARD_TENANTS = new Set(['common', 'organizations', 'consumers']);
const ESP_USB_VENDOR_IDS = new Set([0x303A, 0x10C4, 0x1A86, 0x0403, 0x067B]);
const SERIAL_PORT_HINT_STORAGE_KEY = 'klaus.serial-port-hint';
const OAUTH_EMPTY_FIELD = '__KLAUS_EMPTY__';

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
  oauthProviders: {},
  activeDeviceOAuth: null,
  requestSequence: 0,
  pendingRequests: new Map(),
  authorizedPortsCount: 0,
  autoConnectInProgress: false
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

  void refreshAuthorizedPortsState();
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
  elements.oauthConfigPanel = document.getElementById('oauthConfigPanel');
  elements.oauthSetupState = document.getElementById('oauthSetupState');
  elements.oauthProvidersGrid = document.getElementById('oauthProvidersGrid');
  elements.oauthDevicePanel = document.getElementById('oauthDevicePanel');
  elements.oauthDeviceTitle = document.getElementById('oauthDeviceTitle');
  elements.oauthDeviceMessage = document.getElementById('oauthDeviceMessage');
  elements.oauthDeviceCode = document.getElementById('oauthDeviceCode');
  elements.oauthDeviceState = document.getElementById('oauthDeviceState');
  elements.oauthDeviceOpenBtn = document.getElementById('oauthDeviceOpenBtn');
  elements.oauthDeviceCopyBtn = document.getElementById('oauthDeviceCopyBtn');
  elements.oauthDeviceHideBtn = document.getElementById('oauthDeviceHideBtn');

  elements.manualBindForm = document.getElementById('manualBindForm');
  elements.manualEspKey = document.getElementById('manualEspKey');
  elements.manualKeyState = document.getElementById('manualKeyState');

  elements.serialSupport = document.getElementById('serialSupport');
  elements.connectUsbBtn = document.getElementById('connectUsbBtn');
  elements.disconnectUsbBtn = document.getElementById('disconnectUsbBtn');
  elements.refreshDeviceBtn = document.getElementById('refreshDeviceBtn');
  elements.usbQuickHint = document.getElementById('usbQuickHint');
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
  elements.accountScopesGroup = document.getElementById('accountScopesGroup');
  elements.accountScopes = document.getElementById('accountScopes');
  elements.accountTenantGroup = document.getElementById('accountTenantGroup');
  elements.accountTenantMode = document.getElementById('accountTenantMode');
  elements.accountCustomTenantGroup = document.getElementById('accountCustomTenantGroup');
  elements.accountCustomTenant = document.getElementById('accountCustomTenant');
  elements.accountServiceHint = document.getElementById('accountServiceHint');
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
  elements.manualBindForm?.addEventListener('submit', handleManualBind);
  elements.manualEspKey?.addEventListener('input', handleManualKeyInput);
  elements.oauthDeviceOpenBtn?.addEventListener('click', handleOpenOAuthDevicePage);
  elements.oauthDeviceCopyBtn?.addEventListener('click', () => {
    void handleCopyOAuthDeviceCode();
  });
  elements.oauthDeviceHideBtn?.addEventListener('click', () => {
    hideDeviceOAuthPanel(false);
  });

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
  elements.accountTenantMode?.addEventListener('change', () => {
    syncTenantVisibility();
  });
  elements.deviceAccountForm.addEventListener('submit', handleDeviceAccountSubmit);

  if ('serial' in navigator && typeof navigator.serial.addEventListener === 'function') {
    navigator.serial.addEventListener('connect', () => {
      void handlePortConnected();
    });
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
  hideDeviceOAuthPanel(true);
}

function showDashboardView() {
  elements.authSection.hidden = true;
  elements.dashboardSection.hidden = false;
}

function setDeviceOAuthState(message, tone = 'info') {
  if (!elements.oauthDeviceState) {
    return;
  }

  elements.oauthDeviceState.textContent = message;
  elements.oauthDeviceState.className = `status-box status-box-${tone === 'warning' ? 'info' : tone}`;
}

function showDeviceOAuthPanel({ serviceLabel, account, verificationUrl, userCode, message }) {
  state.activeDeviceOAuth = {
    serviceLabel,
    accountLabel: account?.label || account?.username || '',
    verificationUrl: verificationUrl || '',
    userCode: String(userCode || '').trim(),
    message: message || ''
  };

  elements.oauthDevicePanel.hidden = false;
  elements.oauthDeviceTitle.textContent = `Conecta ${serviceLabel}`;
  elements.oauthDeviceMessage.textContent = message
    || `Abre la pagina oficial y pega este codigo para ${account?.label || account?.username || 'la cuenta'}.`;
  elements.oauthDeviceCode.textContent = state.activeDeviceOAuth.userCode || 'Sin codigo';
  elements.oauthDeviceOpenBtn.disabled = !verificationUrl;
  setDeviceOAuthState(`Codigo listo para ${serviceLabel}.`, 'info');
}

function hideDeviceOAuthPanel(reset = false) {
  if (elements.oauthDevicePanel) {
    elements.oauthDevicePanel.hidden = true;
  }

  if (reset) {
    state.activeDeviceOAuth = null;
    if (elements.oauthDeviceTitle) {
      elements.oauthDeviceTitle.textContent = 'Conecta la cuenta';
    }
    if (elements.oauthDeviceMessage) {
      elements.oauthDeviceMessage.textContent = 'Copia el codigo y pegalo en la pagina oficial.';
    }
    if (elements.oauthDeviceCode) {
      elements.oauthDeviceCode.textContent = '------';
    }
    if (elements.oauthDeviceOpenBtn) {
      elements.oauthDeviceOpenBtn.disabled = false;
    }
    setDeviceOAuthState('Esperando autorizacion...', 'info');
  }
}

function handleOpenOAuthDevicePage() {
  const verificationUrl = state.activeDeviceOAuth?.verificationUrl || '';
  if (!verificationUrl) {
    showAlert('No hay una URL de autorizacion disponible para este flujo.', 'error');
    return;
  }

  window.open(verificationUrl, '_blank', 'noopener');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temp = document.createElement('textarea');
  temp.value = text;
  temp.setAttribute('readonly', 'readonly');
  temp.style.position = 'absolute';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);
  temp.select();
  document.execCommand('copy');
  document.body.removeChild(temp);
}

async function handleCopyOAuthDeviceCode() {
  const code = state.activeDeviceOAuth?.userCode || '';
  if (!code) {
    showAlert('Todavia no hay un codigo para copiar.', 'error');
    return;
  }

  try {
    await copyTextToClipboard(code);
    setDeviceOAuthState('Codigo copiado.', 'success');
    showAlert('Codigo copiado al portapapeles.', 'success');
  } catch (error) {
    showAlert('No se pudo copiar el codigo. Copialo manualmente desde la pantalla.', 'error');
  }
}

function setSerialCapabilityState() {
  if (!('serial' in navigator)) {
    elements.serialSupport.textContent = 'Tu navegador no soporta Web Serial. Usa Chrome o Edge.';
    elements.serialSupport.className = 'status-chip status-box-error';
    if (elements.usbQuickHint) {
      elements.usbQuickHint.textContent = 'Usa Chrome o Edge.';
    }
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
    elements.serialSupport.textContent = 'ESP conectado por Web Serial.';
    if (elements.usbQuickHint) {
      elements.usbQuickHint.textContent = 'Reconectaremos automaticamente cuando sea posible.';
    }
  } else if (state.authorizedPortsCount > 0) {
    elements.serialSupport.textContent = state.authorizedPortsCount === 1
      ? 'Web Serial disponible. Este navegador ya recuerda 1 ESP autorizado.'
      : `Web Serial disponible. Este navegador ya recuerda ${state.authorizedPortsCount} puertos autorizados.`;
    if (elements.usbQuickHint) {
      elements.usbQuickHint.textContent = state.authorizedPortsCount === 1
        ? 'Intentaremos reabrir el ESP automaticamente.'
        : 'Si no reconectamos el puerto correcto, pulsa Conectar ESP.';
    }
  } else {
    elements.serialSupport.textContent = 'Web Serial disponible. La primera vez debes autorizar el puerto del ESP.';
    if (elements.usbQuickHint) {
      elements.usbQuickHint.textContent = 'Tras la primera autorizacion, intentaremos reconectar automaticamente.';
    }
  }

  elements.serialSupport.className = 'status-chip status-chip-info';
  updateUSBButtons(Boolean(state.port));
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
  if (!elements.manualKeyState) {
    return;
  }
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

function getHiddenAccountPolicy(serviceKey) {
  const profile = getServiceProfile(serviceKey);
  return {
    ...FALLBACK_ACCOUNT_POLICY,
    ...(profile?.defaultPolicy || {})
  };
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

  const espLikePorts = ports.filter((port) => isLikelyEspPort(port));
  if (espLikePorts.length === 1) {
    return { port: espLikePorts[0], ambiguous: false };
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

function syncTenantVisibility() {
  if (!elements.accountTenantMode || !elements.accountCustomTenantGroup) {
    return;
  }

  const showCustomTenant = !elements.accountTenantGroup.hidden && elements.accountTenantMode.value === 'custom';
  elements.accountCustomTenantGroup.hidden = !showCustomTenant;

  if (!showCustomTenant && elements.accountCustomTenant) {
    elements.accountCustomTenant.value = '';
  }
}

function getSelectedTenantValue() {
  if (!elements.accountTenantMode) {
    return '';
  }
  if (elements.accountTenantMode.value === 'custom') {
    return elements.accountCustomTenant?.value.trim() || '';
  }
  return elements.accountTenantMode.value.trim();
}

function syncAccountServiceProfile(forceDefaults = false) {
  const serviceKey = normalizeServiceKey(elements.accountService.value || 'website');
  const profile = getServiceProfile(serviceKey) || SERVICE_PROFILES.website;
  const previousService = elements.deviceAccountForm.dataset.serviceKey || '';
  const serviceChanged = previousService !== serviceKey;

  elements.accountService.value = serviceKey;
  elements.accountUsernameLabel.textContent = profile.usernameLabel;
  elements.accountUsername.placeholder = profile.usernamePlaceholder;
  elements.accountUsername.type = profile.usernameMode === 'email' ? 'email' : 'text';
  elements.accountLabel.placeholder = serviceKey === 'website' ? 'Ej. Netflix principal' : `Ej. ${profile.title} principal`;
  elements.accountAuthFlow.value = profile.authFlow;
  elements.accountAuthFlow.readOnly = true;
  elements.accountScopes.placeholder = profile.defaultScopes;

  if (forceDefaults || serviceChanged || !elements.accountScopes.value.trim()) {
    elements.accountScopes.value = profile.defaultScopes;
  }

  if (elements.accountScopesGroup) {
    elements.accountScopesGroup.hidden = profile.showScopes === false;
  }
  elements.accountTenantGroup.hidden = !profile.usesTenant;
  if (profile.usesTenant) {
    let tenantValue = getSelectedTenantValue();
    if (forceDefaults || serviceChanged || !tenantValue) {
      tenantValue = profile.defaultTenant || 'common';
    }

    if (MICROSOFT_STANDARD_TENANTS.has(tenantValue)) {
      elements.accountTenantMode.value = tenantValue;
      elements.accountCustomTenant.value = '';
    } else {
      elements.accountTenantMode.value = 'custom';
      elements.accountCustomTenant.value = tenantValue;
    }
  } else {
    elements.accountTenantMode.value = 'common';
    elements.accountCustomTenant.value = '';
  }

  syncTenantVisibility();
  if (elements.accountServiceHint) {
    elements.accountServiceHint.textContent = profile.hint;
  }
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
  if (!values.username || values.username.length > 128) {
    return 'El identificador principal es obligatorio y no puede superar 128 caracteres.';
  }
  if (values.scopes.length > 160) {
    return 'Los scopes o permisos no pueden superar 160 caracteres.';
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
  if (values.service === 'website' && values.username.length < 2) {
    return 'El sitio web necesita un usuario o correo valido.';
  }
  if (values.service === 'spotify' && values.username.length < 2) {
    return 'Spotify necesita un usuario o correo valido.';
  }

  return '';
}

function updateUSBButtons(connected) {
  const serialAvailable = 'serial' in navigator;
  const reconnectReady = state.authorizedPortsCount > 0;
  if (state.autoConnectInProgress) {
    elements.connectUsbBtn.textContent = 'Reconectando...';
  } else if (connected) {
    elements.connectUsbBtn.textContent = 'ESP conectado';
  } else if (reconnectReady) {
    elements.connectUsbBtn.textContent = 'Reconectar ESP';
  } else {
    elements.connectUsbBtn.textContent = 'Conectar ESP';
  }

  elements.connectUsbBtn.disabled = connected || !serialAvailable || state.autoConnectInProgress;
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
    await loadOAuthProviders();
    await loadBindings();

    if (!state.port) {
      await tryAutoConnectAuthorizedPort();
    } else {
      await refreshDeviceSnapshot();
    }
  } catch (error) {
    await handleLogout(false);
    showAlert('No fue posible cargar tu sesion.', 'error');
  }
}

async function loadOAuthProviders() {
  try {
    const { response, data } = await apiFetch('/oauth/providers', {
      authenticated: true
    });

    if (!response.ok) {
      state.oauthProviders = {};
      renderOAuthProviderSetup();
      return;
    }

    state.oauthProviders = data || {};
    renderOAuthProviderSetup();
    renderDeviceAccounts();
  } catch (error) {
    state.oauthProviders = {};
    renderOAuthProviderSetup();
  }
}

function renderOAuthProviderSetup() {
  if (!elements.oauthProvidersGrid || !elements.oauthSetupState) {
    return;
  }

  elements.oauthProvidersGrid.replaceChildren();

  const providers = Object.entries(OAUTH_PROVIDER_SETUP);
  const configuredCount = providers.reduce((count, [service]) => (
    count + (state.oauthProviders?.[service]?.configured ? 1 : 0)
  ), 0);

  if (configuredCount === 0) {
    setOAuthSetupState('Ningun proveedor OAuth esta listo todavia. Configura al menos uno para habilitar el boton Conectar cuenta.', 'warning');
  } else if (configuredCount === providers.length) {
    setOAuthSetupState('Todos los proveedores OAuth disponibles ya quedaron listos.', 'success');
  } else {
    setOAuthSetupState(`Hay ${configuredCount} de ${providers.length} proveedores listos. Los botones solo se habilitan cuando cada servicio tenga sus credenciales.`, 'info');
  }

  providers.forEach(([service, setup]) => {
    const provider = state.oauthProviders?.[service] || {};
    const card = document.createElement('article');
    card.className = 'oauth-provider-card';

    const head = document.createElement('div');
    head.className = 'oauth-provider-head';

    const titleWrap = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = setup.title;
    titleWrap.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'oauth-provider-meta';
    meta.textContent = provider.configured
      ? 'Proveedor listo para habilitar el login desde las cards.'
      : 'Todavia faltan credenciales para habilitar el login.';
    titleWrap.appendChild(meta);
    head.appendChild(titleWrap);

    const pill = document.createElement('span');
    pill.className = `device-pill ${provider.configured ? 'success' : 'warning'}`;
    pill.textContent = provider.configured ? 'Listo' : 'Pendiente';
    head.appendChild(pill);
    card.appendChild(head);

    const note = document.createElement('div');
    note.className = 'note-block';
    note.textContent = setup.note;
    card.appendChild(note);

    const form = document.createElement('form');
    form.className = 'oauth-provider-form';
    form.dataset.service = service;

    setup.fields.forEach((field) => {
      const group = document.createElement('label');
      group.className = 'input-group';
      group.htmlFor = `oauth-${service}-${field.key}`;

      const label = document.createElement('span');
      label.textContent = field.label;

      const source = provider?.field_sources?.[field.key];
      if (source === 'env') {
        const sourcePill = document.createElement('small');
        sourcePill.className = 'oauth-source-pill';
        sourcePill.textContent = 'desde entorno';
        label.appendChild(sourcePill);
      } else if (source === 'file') {
        const sourcePill = document.createElement('small');
        sourcePill.className = 'oauth-source-pill';
        sourcePill.textContent = 'guardado en la app';
        label.appendChild(sourcePill);
      }

      group.appendChild(label);

      const input = document.createElement('input');
      input.type = field.type;
      input.id = `oauth-${service}-${field.key}`;
      input.name = field.key;
      input.autocomplete = 'off';
      input.placeholder = field.placeholder;

      if (field.key === 'client_id') {
        input.value = provider.client_id || '';
      } else if (field.key === 'client_secret' && provider.has_client_secret) {
        input.placeholder = 'Ya hay un secret guardado. Escribe uno nuevo solo si quieres reemplazarlo.';
      }

      if (source === 'env') {
        input.readOnly = true;
      }

      group.appendChild(input);
      form.appendChild(group);
    });

    if (provider.callback_url) {
      const callback = document.createElement('p');
      callback.className = 'oauth-provider-meta';
      callback.textContent = `Callback: ${provider.callback_url}`;
      form.appendChild(callback);
    }

    const missing = document.createElement('div');
    missing.className = `status-inline ${provider.configured ? 'success' : 'warning'}`;
    missing.textContent = provider.configured
      ? 'Configuracion valida. Ya puedes usar el boton Conectar cuenta para este servicio.'
      : `Faltan: ${(provider.missing_fields || []).join(', ') || 'credenciales'}`;
    form.appendChild(missing);

    const actions = document.createElement('div');
    actions.className = 'oauth-provider-actions';
    const canEditAnyField = setup.fields.some((field) => provider?.field_sources?.[field.key] !== 'env');

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'btn btn-primary';
    saveButton.textContent = 'Guardar configuracion';
    saveButton.disabled = !canEditAnyField;
    actions.appendChild(saveButton);

    if (saveButton.disabled) {
      const lockedMeta = document.createElement('span');
      lockedMeta.className = 'oauth-provider-meta';
      lockedMeta.textContent = 'Este proveedor se controla desde variables de entorno.';
      actions.appendChild(lockedMeta);
    }

    form.appendChild(actions);
    form.addEventListener('submit', handleOAuthProviderSave);

    card.appendChild(form);
    elements.oauthProvidersGrid.appendChild(card);
  });
}

function setOAuthSetupState(message, tone = 'info') {
  elements.oauthSetupState.textContent = message;
  elements.oauthSetupState.className = `status-box status-inline ${tone}`;
}

async function handleOAuthProviderSave(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const service = form.dataset.service;
  const setup = OAUTH_PROVIDER_SETUP[service];
  if (!setup) {
    return;
  }

  const payload = {};
  setup.fields.forEach((field) => {
    const input = form.querySelector(`[name="${field.key}"]`);
    if (!input || input.readOnly) {
      return;
    }

    if (field.key === 'client_secret' && !input.value.trim()) {
      return;
    }

    payload[field.key] = input.value.trim();
  });

  try {
    setOAuthSetupState(`Guardando configuracion OAuth de ${setup.title}...`, 'info');
    const { response, data } = await apiFetch(`/oauth/providers/${service}`, {
      method: 'PUT',
      authenticated: true,
      body: payload
    });

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo guardar la configuracion OAuth.');
    }

    showAlert(`Configuracion OAuth de ${setup.title} guardada.`, 'success');
    await loadOAuthProviders();
  } catch (error) {
    setOAuthSetupState(error.message || 'No se pudo guardar la configuracion OAuth.', 'error');
    showAlert(error.message || 'No se pudo guardar la configuracion OAuth.', 'error');
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
    if (elements.detectedKeyHint) {
      elements.detectedKeyHint.textContent = 'No se pudo validar la key.';
    }
    setUSBStatus('La key se detecto, pero fallo la validacion con el servidor.', 'error');
    syncDevicePanels();
  }
}

async function openUSBPort(port, options = {}) {
  const { source = 'manual', showFailureAlert = true } = options;

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
    setUSBStatus(
      source === 'auto'
        ? 'ESP autorizado detectado. Reconectando automaticamente...'
        : 'Puerto conectado. Consultando el estado del ESP...',
      'info'
    );
    syncDevicePanels();

    void startSerialReader();

    await wait(250);
    await refreshDeviceSnapshot();
    return true;
  } catch (error) {
    state.port = null;
    renderSerialCapabilityState();

    const message = source === 'auto'
      ? 'Se detecto un ESP autorizado, pero el puerto no se pudo abrir. Cierra otras apps que usen el serial y vuelve a intentarlo.'
      : 'No fue posible abrir el puerto USB.';

    setUSBStatus(message, 'error');
    if (showFailureAlert) {
      showAlert(message, 'error');
    }
    return false;
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
    return ambiguous ? 'ambiguous' : 'none';
  }

  state.autoConnectInProgress = true;
  renderSerialCapabilityState();

  try {
    const opened = await openUSBPort(port, {
      source: 'auto',
      showFailureAlert: false
    });
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

  const autoConnectStatus = await tryAutoConnectAuthorizedPort();
  if (autoConnectStatus === 'connected' || autoConnectStatus === 'failed') {
    return;
  }
  if (autoConnectStatus === 'ambiguous') {
    setUSBStatus('Hay varios puertos autorizados. Elige manualmente el ESP correcto.', 'info');
  }

  try {
    const port = await navigator.serial.requestPort();
    await refreshAuthorizedPortsState();
    await openUSBPort(port, {
      source: 'manual',
      showFailureAlert: true
    });
  } catch (error) {
    if (error && error.name === 'NotFoundError') {
      return;
    }
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
    case 'missing_token_action':
      return 'El ESP recibio un comando OAuth incompleto.';
    case 'invalid_token_payload':
      return 'El token OAuth no pudo guardarse en el ESP. Repite el login o vuelve a autorizar la cuenta.';
    case 'invalid_delay':
      return 'El retardo de autofill no es valido.';
    case 'oauth_session_not_found':
      return 'Esa cuenta todavia no tiene una sesion OAuth guardada en el ESP.';
    case 'rate_limited':
      return 'El ESP activo la proteccion por intentos fallidos.';
    case 'invalid_param':
      return 'Los datos enviados al ESP no son validos.';
    case 'not_initialized':
      return 'Autofill no esta listo. Empareja KLAUS como teclado BLE antes de usarlo.';
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
  if (elements.detectedKeyHint) {
    elements.detectedKeyHint.textContent = 'Validando key...';
  }
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
    if (elements.detectedKeyHint) {
      elements.detectedKeyHint.textContent = 'Esperando key...';
    }
  } else if (state.detectedKeyState && elements.detectedKeyHint) {
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
    setVaultNotice('Conecta un ESP.', 'info');
    setDeviceGuardState('Conecta un ESP.', 'info');
    setDeviceAccountsState('Conecta un ESP.', 'info');
    return;
  }

  if (!isValidDeviceKey(state.detectedKey)) {
    setVaultNotice('Lee la key del ESP.', 'info');
    setDeviceGuardState('Lee la key del ESP.', 'info');
    setDeviceAccountsState('Lee la key del ESP.', 'info');
    return;
  }

  if (!state.detectedKeyState) {
    setVaultNotice('Validando key...', 'info');
    setDeviceGuardState('Validando key...', 'info');
    setDeviceAccountsState('Validando key...', 'info');
    return;
  }

  if (!authorized) {
    if (state.detectedKeyState.available) {
      setVaultNotice('Vincula esta key a tu cuenta.', 'warning');
      setDeviceGuardState('Vincula esta key a tu cuenta.', 'warning');
      setDeviceAccountsState('Vincula esta key a tu cuenta.', 'warning');
    } else {
      setVaultNotice('Esta key pertenece a otra cuenta.', 'error');
      setDeviceGuardState('Esta key pertenece a otra cuenta.', 'error');
      setDeviceAccountsState('Esta key pertenece a otra cuenta.', 'error');
    }
    return;
  }

  if (!state.deviceInfo) {
    setVaultNotice('Actualiza el ESP.', 'info');
    setDeviceGuardState('Actualiza el ESP.', 'info');
    setDeviceAccountsState('Actualiza el ESP.', 'info');
    return;
  }

  if (!state.deviceInfo.vault_exists) {
    elements.vaultCreateForm.hidden = false;
    setVaultNotice('Crea el vault.', 'warning');
    setDeviceGuardState('Crea el vault.', 'warning');
    setDeviceAccountsState('Aun no hay vault.', 'warning');
    return;
  }

  if (!state.deviceInfo.vault_unlocked) {
    elements.vaultUnlockForm.hidden = false;
    setVaultNotice('Desbloquea el vault.', 'info');
    setDeviceGuardState('Desbloquea el vault.', 'info');
    setDeviceAccountsState('Desbloquea el vault.', 'info');
    return;
  }

  elements.vaultUnlockedPanel.hidden = false;
  setVaultNotice('Vault desbloqueado.', 'success');
  setDeviceGuardState(
    state.deviceInfo.autofill_ready
      ? 'ESP listo. Autofill BLE activo.'
      : 'ESP listo. Empareja KLAUS por BLE para autofill.',
    state.deviceInfo.autofill_ready ? 'success' : 'info'
  );
  setDeviceAccountsState(
    state.deviceAccounts.length > 0
      ? 'Cuentas listas.'
      : 'Aun no hay cuentas.',
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
    setVaultNotice('Creando vault...', 'info');
    setDeviceAccountsState('Creando vault...', 'info');
    await sendProtocolRequest(`SESSION|CREATE|${encodeToken(name)}|${encodeToken(pin)}|${encodeToken(phrase)}`, {
      timeoutMs: VAULT_OPERATION_TIMEOUT_MS
    });
    elements.vaultCreateForm.reset();
    showAlert('Vault creado correctamente en el ESP.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    if (String(error.message || '') === 'TIMEOUT') {
      showAlert('El ESP tardo demasiado en crear el vault. Espera unos segundos y vuelve a consultar el estado del dispositivo.', 'error');
      setVaultNotice('Timeout al crear el vault.', 'error');
      setDeviceAccountsState('Timeout al crear el vault.', 'error');
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
    setVaultNotice('Desbloqueando vault...', 'info');
    setDeviceAccountsState('Desbloqueando vault...', 'info');
    await sendProtocolRequest(`SESSION|UNLOCK|${encodeToken(pin)}|${encodeToken(phrase)}`, {
      timeoutMs: VAULT_OPERATION_TIMEOUT_MS
    });
    elements.vaultUnlockForm.reset();
    showAlert('Vault desbloqueado correctamente.', 'success');
    await refreshDeviceSnapshot();
  } catch (error) {
    if (String(error.message || '') === 'TIMEOUT') {
      showAlert('El ESP tardo demasiado en desbloquear el vault. Espera unos segundos y vuelve a actualizar el estado del dispositivo.', 'error');
      setVaultNotice('Timeout al desbloquear.', 'error');
      setDeviceAccountsState('Timeout al desbloquear.', 'error');
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

function encodeOptionalToken(value) {
  const normalized = String(value || '').trim();
  return encodeToken(normalized || OAUTH_EMPTY_FIELD);
}

async function loadDeviceAccounts(showFeedback = true) {
  if (!canManageDeviceAccounts()) {
    state.deviceAccounts = [];
    renderDeviceAccounts();
    syncDevicePanels();
    return;
  }

  try {
    setDeviceAccountsState('Leyendo cuentas...', 'info');
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
        ? `${state.deviceAccounts.length} cuenta(s).`
        : 'Aun no hay cuentas.',
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
        ? 'Timeout al leer cuentas.'
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
  const hasOAuthShape = frame.params.length >= 16;
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
    avoidAmbiguous,
    oauthReady,
    oauthExpiresAt,
    oauthHasRefresh
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
        frame.params[8],
        '0',
        '0',
        '0'
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
    oauth: {
      authorized: hasOAuthShape ? (oauthReady === '1') : false,
      expires_at: hasOAuthShape ? parseInteger(oauthExpiresAt, 0) : 0,
      has_refresh: hasOAuthShape ? (oauthHasRefresh === '1') : false
    },
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

function decodeOptionalToken(value) {
  const decoded = decodeToken(value);
  return decoded === OAUTH_EMPTY_FIELD ? '' : decoded;
}

function getOAuthProviderState(service) {
  return state.oauthProviders[normalizeServiceKey(service)] || null;
}

function accountSupportsOAuth(account) {
  const profile = getServiceProfile(account?.service);
  return Boolean(profile?.oauthCapable);
}

function accountSupportsAutofill(account) {
  return String(account?.auth_flow || '').trim().toLowerCase() === 'local_autofill';
}

function isOAuthSessionActive(account) {
  if (!account?.oauth?.authorized) {
    return false;
  }

  if (!account.oauth.expires_at) {
    return true;
  }

  return account.oauth.expires_at > Math.floor(Date.now() / 1000);
}

function formatOAuthExpiry(epochSeconds) {
  if (!epochSeconds) {
    return 'sin fecha';
  }

  return new Date(epochSeconds * 1000).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function describeOAuthAccountState(account) {
  if (!accountSupportsOAuth(account)) {
    return {
      tone: 'info',
      text: 'Cuenta local lista para autofill.'
    };
  }

  const provider = getOAuthProviderState(account.service);
  if (!provider?.configured) {
    return {
      tone: 'warning',
      text: 'OAuth no configurado en este servidor.'
    };
  }

  if (!account.oauth?.authorized) {
    return {
      tone: 'info',
      text: 'Sin sesion OAuth guardada en el ESP.'
    };
  }

  if (isOAuthSessionActive(account)) {
    return {
      tone: 'success',
      text: account.oauth.expires_at
        ? `Sesion OAuth lista hasta ${formatOAuthExpiry(account.oauth.expires_at)}.`
        : 'Sesion OAuth lista en el ESP.'
    };
  }

  return {
    tone: 'warning',
    text: `La sesion OAuth expiró el ${formatOAuthExpiry(account.oauth.expires_at)}.`
  };
}

async function startOAuthSession(account) {
  const { response, data } = await apiFetch('/oauth/start', {
    method: 'POST',
    authenticated: true,
    body: {
      service: account.service,
      account_id: account.account_id,
      scopes: account.scopes,
      tenant: account.tenant,
      login_hint: account.username
    }
  });

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo iniciar el flujo OAuth.');
  }

  return data;
}

async function pollOAuthSession(sessionId, intervalSeconds, serviceName) {
  let waitSeconds = Math.max(2, Number.parseInt(intervalSeconds, 10) || DEFAULT_OAUTH_POLL_INTERVAL_SECONDS);

  while (true) {
    await wait(waitSeconds * 1000);

    const { response, data } = await apiFetch('/oauth/poll', {
      method: 'POST',
      authenticated: true,
      body: {
        session_id: sessionId
      }
    });

    if (!response.ok) {
      throw new Error(data.error || `No se pudo completar el login OAuth de ${serviceName}.`);
    }

    if (data.status === 'authorized' && data.token) {
      return data.token;
    }

    if (data.status === 'slow_down') {
      waitSeconds = Math.max(waitSeconds + 5, Number.parseInt(data.interval, 10) || waitSeconds + 5);
      continue;
    }

    waitSeconds = Math.max(2, Number.parseInt(data.interval, 10) || waitSeconds);
  }
}

function openOAuthPopup(url, title) {
  return window.open(
    url,
    `klaus-${normalizeServiceKey(title)}`,
    'popup=yes,width=540,height=760,resizable=yes,scrollbars=yes'
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOAuthDevicePopupHtml({
  serviceLabel,
  accountLabel,
  userCode,
  verificationUrl,
  message,
  stateMessage,
  tone = 'info'
}) {
  const palette = {
    info: {
      badgeBg: 'rgba(124, 228, 255, 0.14)',
      badgeColor: '#dbf8ff'
    },
    success: {
      badgeBg: 'rgba(61, 208, 166, 0.16)',
      badgeColor: '#dffff3'
    },
    error: {
      badgeBg: 'rgba(255, 125, 125, 0.16)',
      badgeColor: '#ffe8e8'
    }
  };

  const colors = palette[tone] || palette.info;
  const safeServiceLabel = escapeHtml(serviceLabel || 'Proveedor');
  const safeAccountLabel = escapeHtml(accountLabel || 'cuenta');
  const safeUserCode = escapeHtml(userCode || '------');
  const safeMessage = escapeHtml(message || `Copia este codigo para conectar ${safeAccountLabel}.`);
  const safeStateMessage = escapeHtml(stateMessage || 'Esperando autorizacion...');
  const hasUrl = Boolean(verificationUrl);
  const serializedUrl = JSON.stringify(String(verificationUrl || ''));
  const serializedCode = JSON.stringify(String(userCode || ''));

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>KLAUS ${safeServiceLabel}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #08121e;
      --panel: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.09);
      --muted: #9fb5ca;
      --text: #f4f7fb;
      --accent: #ff7f32;
      --accent-strong: #ffb347;
      --shadow: 0 24px 60px rgba(0, 0, 0, 0.34);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1rem;
      font-family: "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top, rgba(255,127,50,0.18), transparent 34%),
        linear-gradient(180deg, #0c1726 0%, var(--bg) 62%);
      color: var(--text);
    }
    .card {
      width: min(32rem, calc(100vw - 2rem));
      padding: 1.4rem;
      border-radius: 26px;
      background: rgba(8, 18, 30, 0.92);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
    }
    .eyebrow {
      margin: 0 0 0.4rem;
      color: #ffd5b4;
      font-size: 0.82rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 1.55rem;
      line-height: 1.2;
    }
    p {
      margin: 0;
      line-height: 1.6;
      color: var(--muted);
    }
    .code-wrap {
      display: grid;
      gap: 0.6rem;
      margin: 1rem 0;
    }
    .code {
      display: grid;
      place-items: center;
      min-height: 4.5rem;
      padding: 1rem;
      border-radius: 18px;
      background: rgba(3,10,18,0.84);
      border: 1px solid rgba(124,228,255,0.18);
      color: #fff3de;
      font-family: "Consolas", "Courier New", monospace;
      font-size: clamp(1.25rem, 5vw, 1.9rem);
      letter-spacing: 0.22em;
      text-align: center;
      word-break: break-word;
    }
    .state {
      margin-top: 0.9rem;
      padding: 0.9rem 1rem;
      border-radius: 16px;
      background: ${colors.badgeBg};
      color: ${colors.badgeColor};
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1rem;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.88rem 1.15rem;
      font: inherit;
      cursor: pointer;
    }
    .primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #111722;
      font-weight: 700;
    }
    .secondary {
      background: rgba(255,255,255,0.08);
      color: var(--text);
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="card">
    <p class="eyebrow">KLAUS / ${safeServiceLabel}</p>
    <h1>Conecta ${safeAccountLabel}</h1>
    <p>${safeMessage}</p>
    <div class="code-wrap">
      <span>Codigo para el dispositivo</span>
      <div id="deviceCode" class="code">${safeUserCode}</div>
    </div>
    <div id="stateBox" class="state">${safeStateMessage}</div>
    <div class="actions">
      <button id="copyBtn" class="primary" type="button">Copiar codigo</button>
      <button id="openBtn" class="secondary" type="button" ${hasUrl ? '' : 'disabled'}>Abrir pagina oficial</button>
    </div>
  </div>
  <script>
    (function () {
      const verificationUrl = ${serializedUrl};
      const userCode = ${serializedCode};
      const copyBtn = document.getElementById('copyBtn');
      const openBtn = document.getElementById('openBtn');

      async function copyCode() {
        if (!userCode) {
          return;
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(userCode);
          } else {
            const range = document.createRange();
            range.selectNodeContents(document.getElementById('deviceCode'));
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
          }
          copyBtn.textContent = 'Codigo copiado';
        } catch (error) {
          copyBtn.textContent = 'Copia manual';
        }
      }

      copyBtn.addEventListener('click', function () {
        void copyCode();
      });

      openBtn.addEventListener('click', function () {
        if (!verificationUrl) {
          return;
        }
        window.open(verificationUrl, '_blank', 'noopener');
      });
    }());
  </script>
</body>
</html>`;
}

function renderOAuthDevicePopup(popupWindow, payload) {
  if (!popupWindow || popupWindow.closed) {
    return false;
  }

  popupWindow.document.open();
  popupWindow.document.write(buildOAuthDevicePopupHtml(payload));
  popupWindow.document.close();
  try {
    popupWindow.focus();
  } catch (error) {
    // ignore
  }
  return true;
}

function waitForOAuthPopupResult(sessionId, popupWindow, timeoutMs = 4 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function cleanup() {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closeCheckId);
      window.clearTimeout(timeoutId);
    }

    function onMessage(event) {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data || {};
      if (payload.type !== 'klaus-oauth-result' || payload.session_id !== sessionId) {
        return;
      }

      cleanup();

      if (!payload.ok || !payload.token) {
        reject(new Error(payload.error || 'La ventana OAuth no devolvio un token valido.'));
        return;
      }

      resolve(payload.token);
    }

    const closeCheckId = window.setInterval(() => {
      if (popupWindow && popupWindow.closed && Date.now() - startedAt > 1500) {
        cleanup();
        reject(new Error('La ventana de autorizacion se cerro antes de terminar el login.'));
      }
    }, 500);

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('La autorizacion OAuth tardo demasiado.'));
    }, timeoutMs);

    window.addEventListener('message', onMessage);
  });
}

async function storeOAuthTokenOnDevice(accountId, token) {
  const tokenType = String(token.token_type || 'Bearer').trim();
  const accessToken = String(token.access_token || '').trim();
  const refreshToken = String(token.refresh_token || '').trim();
  const scope = String(token.scope || '').trim();
  const expiresAt = Number.parseInt(token.expires_at, 10) || 0;

  if (!accessToken) {
    throw new Error('El proveedor no devolvio un access token.');
  }

  await sendProtocolRequest([
    'ACCOUNT',
    'TOKEN',
    'SET',
    accountId,
    encodeOptionalToken(tokenType),
    encodeOptionalToken(accessToken),
    encodeOptionalToken(refreshToken),
    String(expiresAt),
    encodeOptionalToken(scope)
  ].join('|'), {
    timeoutMs: 20000
  });
}

async function runDeviceOAuthScript(account, serviceLabel) {
  const helperPopup = openOAuthPopup('', `${serviceLabel}-device-code`);
  if (!helperPopup) {
    throw new Error('El navegador bloqueo la ventana emergente del codigo. Permite pop-ups para KLAUS.');
  }

  renderOAuthDevicePopup(helperPopup, {
    serviceLabel,
    accountLabel: account.label || account.username,
    userCode: '',
    verificationUrl: '',
    message: `Preparando el codigo de ${serviceLabel} para ${account.label || account.username}...`,
    stateMessage: 'Espera un momento mientras KLAUS solicita el codigo al proveedor.',
    tone: 'info'
  });

  try {
    const authSession = await startOAuthSession(account);
    const verificationUrl = authSession.verification_uri_complete || authSession.verification_uri || '';
    const instructions = authSession.message
      || `${serviceLabel}: abre la pagina oficial, pega este codigo y termina el login.`;

    showDeviceOAuthPanel({
      serviceLabel,
      account,
      verificationUrl,
      userCode: authSession.user_code || '',
      message: instructions
    });

    renderOAuthDevicePopup(helperPopup, {
      serviceLabel,
      accountLabel: account.label || account.username,
      userCode: authSession.user_code || '',
      verificationUrl,
      message: instructions,
      stateMessage: 'Copia el codigo y abre la pagina oficial.',
      tone: 'info'
    });

    setDeviceAccountsState(`Autorizando ${serviceLabel}...`, 'info');
    setDeviceOAuthState(`Esperando autorizacion de ${serviceLabel}...`, 'info');
    const token = await pollOAuthSession(authSession.session_id, authSession.interval, serviceLabel);
    setDeviceOAuthState(`Guardando sesion de ${serviceLabel}...`, 'success');
    renderOAuthDevicePopup(helperPopup, {
      serviceLabel,
      accountLabel: account.label || account.username,
      userCode: authSession.user_code || '',
      verificationUrl,
      message: instructions,
      stateMessage: `Guardando sesion de ${serviceLabel}...`,
      tone: 'success'
    });
    await storeOAuthTokenOnDevice(account.account_id, token);
    hideDeviceOAuthPanel(true);
    if (helperPopup && !helperPopup.closed) {
      helperPopup.close();
    }
  } catch (error) {
    setDeviceOAuthState(error.message || `No se pudo completar la autorizacion de ${serviceLabel}.`, 'error');
    renderOAuthDevicePopup(helperPopup, {
      serviceLabel,
      accountLabel: account.label || account.username,
      userCode: state.activeDeviceOAuth?.userCode || '',
      verificationUrl: state.activeDeviceOAuth?.verificationUrl || '',
      message: `No se pudo completar la autorizacion de ${serviceLabel}.`,
      stateMessage: error.message || 'La autorizacion fallo. Revisa el codigo e intenta otra vez.',
      tone: 'error'
    });
    throw error;
  }
}

async function runSpotifyOAuthScript(account) {
  await runPopupOAuthScript(account, 'Spotify');
}

async function runPopupOAuthScript(account, serviceLabel) {
  const authSession = await startOAuthSession(account);
  const popupWindow = openOAuthPopup(authSession.authorization_url, serviceLabel);

  if (!popupWindow) {
    throw new Error(`El navegador bloqueo la ventana emergente de ${serviceLabel}.`);
  }

  setDeviceAccountsState(`Autorizando ${serviceLabel}...`, 'info');
  const token = await waitForOAuthPopupResult(authSession.session_id, popupWindow);
  setDeviceAccountsState(`Guardando sesion de ${serviceLabel}...`, 'success');
  await storeOAuthTokenOnDevice(account.account_id, token);
  hideDeviceOAuthPanel(true);
}

async function runGoogleOAuthScript(account) {
  await runPopupOAuthScript(account, 'Google');
}

async function runGitHubOAuthScript(account) {
  await runDeviceOAuthScript(account, 'GitHub');
}

async function runMicrosoftOAuthScript(account) {
  await runDeviceOAuthScript(account, 'Microsoft');
}

const OAUTH_SERVICE_SCRIPTS = {
  google: runGoogleOAuthScript,
  github: runGitHubOAuthScript,
  microsoft: runMicrosoftOAuthScript,
  spotify: runSpotifyOAuthScript
};

async function startAccountOAuthLogin(account) {
  if (!canManageDeviceAccounts()) {
    showAlert('El ESP debe estar conectado, autorizado y desbloqueado para iniciar el login.', 'error');
    return;
  }

  const provider = getOAuthProviderState(account.service);
  if (!provider?.configured) {
    showAlert(`El proveedor ${account.service_name || account.service} no esta configurado en el servidor.`, 'error');
    return;
  }

  const runner = OAUTH_SERVICE_SCRIPTS[normalizeServiceKey(account.service)];
  if (!runner) {
    showAlert(`No existe un script OAuth configurado para ${account.service_name || account.service}.`, 'error');
    return;
  }

  try {
    hideDeviceOAuthPanel(true);
    setDeviceAccountsState(`Iniciando el script OAuth de ${account.service_name || account.service} para ${account.label || account.username}...`, 'info');
    await runner(account);
    showAlert(`La cuenta ${account.label || account.username} ya quedo conectada con ${account.service_name || account.service}.`, 'success');
    await refreshDeviceSnapshot();
    setDeviceAccountsState('Sesion OAuth guardada correctamente en el ESP.', 'success');
  } catch (error) {
    setDeviceAccountsState(error.message || 'No se pudo completar el login OAuth.', 'error');
    showAlert(error.message || 'No se pudo completar el login OAuth.', 'error');
  }
}

async function handleDeviceAccountSubmit(event) {
  event.preventDefault();

  if (!canManageDeviceAccounts()) {
    showAlert('El ESP debe estar autorizado y con el vault desbloqueado.', 'error');
    return;
  }

  syncAccountServiceProfile();

  const serviceKey = normalizeServiceKey(elements.accountService.value);
  const profile = getServiceProfile(serviceKey) || SERVICE_PROFILES.website;
  const values = {
    service: serviceKey,
    label: elements.accountLabel.value.trim(),
    username: elements.accountUsername.value.trim(),
    authFlow: profile.authFlow,
    scopes: elements.accountScopes.value.trim() || profile.defaultScopes,
    tenant: profile.usesTenant ? getSelectedTenantValue() : ''
  };

  const validationError = validateDeviceAccountValues(values);
  if (validationError) {
    showAlert(validationError, 'error');
    return;
  }

  const hiddenPolicy = getHiddenAccountPolicy(values.service);
  const command = [
    'ACCOUNT',
    'ADD',
    encodeToken(values.service),
    encodeToken(values.label),
    encodeToken(values.username),
    encodeToken(values.authFlow),
    encodeToken(values.scopes),
    encodeToken(values.service === 'microsoft' ? values.tenant : ''),
    hiddenPolicy.rotateHours,
    hiddenPolicy.baseLength,
    hiddenPolicy.level,
    hiddenPolicy.symbols,
    hiddenPolicy.avoidAmbiguous
  ].join('|');

  try {
    await sendProtocolRequest(command, { timeoutMs: 7000 });
    elements.deviceAccountForm.reset();
    syncAccountServiceProfile(true);
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
      empty.textContent = 'Aun no hay vault.';
    } else if (!state.deviceInfo?.vault_unlocked) {
      empty.textContent = 'Desbloquea el vault.';
    } else {
      empty.textContent = 'Aun no hay cuentas.';
    }
    elements.deviceAccountsList.appendChild(empty);
    return;
  }

  state.deviceAccounts.forEach((account) => {
    const provider = getOAuthProviderState(account.service);
    const oauthState = describeOAuthAccountState(account);
    const oauthActive = isOAuthSessionActive(account);
    const supportsOAuth = accountSupportsOAuth(account);
    const supportsAutofill = accountSupportsAutofill(account);
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

    if (account.auth_flow) {
      const flowPill = document.createElement('span');
      flowPill.className = 'device-pill success';
      flowPill.textContent = account.auth_flow;
      header.appendChild(flowPill);
    }

    const oauthPill = document.createElement('span');
    oauthPill.className = `device-pill ${oauthState.tone}`;
    oauthPill.textContent = supportsOAuth
      ? (account.oauth?.authorized
        ? (oauthActive ? 'OAuth listo' : 'OAuth expirado')
        : 'Sin login OAuth')
      : 'Autofill local';
    header.appendChild(oauthPill);

    left.appendChild(header);

    if (account.label) {
      const label = document.createElement('p');
      label.className = 'device-account-meta';
      label.textContent = `Alias: ${account.label}`;
      left.appendChild(label);
    }

    const meta = document.createElement('p');
    meta.className = 'device-account-meta';
    meta.textContent = `Identificador: ${account.username}`;
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

    const oauthMeta = document.createElement('p');
    oauthMeta.className = 'device-account-meta';
    oauthMeta.textContent = oauthState.text;
    left.appendChild(oauthMeta);

    const actions = document.createElement('div');
    actions.className = 'device-account-actions';

    if (supportsOAuth) {
      const loginButton = document.createElement('button');
      loginButton.type = 'button';
      loginButton.className = 'btn account-login-btn';
      loginButton.textContent = account.oauth?.authorized ? 'Reautenticar' : 'Conectar cuenta';
      loginButton.disabled = !provider?.configured;
      loginButton.title = provider?.configured
        ? `Ejecuta el script OAuth de ${account.service_name || account.service}.`
        : `Configura ${account.service_name || account.service} en el servidor para habilitar este login.`;
      loginButton.addEventListener('click', () => {
        void startAccountOAuthLogin(account);
      });
      actions.appendChild(loginButton);
    }

    if (supportsAutofill) {
      const autofillButton = document.createElement('button');
      autofillButton.type = 'button';
      autofillButton.className = 'btn account-autofill-btn';
      autofillButton.textContent = 'Autofill';
      autofillButton.disabled = !state.deviceInfo?.autofill_ready;
      autofillButton.title = state.deviceInfo?.autofill_ready
        ? 'Envia usuario y password por BLE tras una breve espera.'
        : 'Empareja KLAUS como teclado BLE para habilitar autofill.';
      autofillButton.addEventListener('click', () => {
        void autofillDeviceAccount(account, false);
      });
      actions.appendChild(autofillButton);
    }

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

async function autofillDeviceAccount(account, sendEnter = false) {
  if (!canManageDeviceAccounts()) {
    showAlert('El ESP debe estar listo y desbloqueado para usar autofill.', 'error');
    return;
  }

  if (!accountSupportsAutofill(account)) {
    showAlert('Esta cuenta no usa autofill local.', 'error');
    return;
  }

  if (!state.deviceInfo?.ble) {
    showAlert('Este firmware no tiene teclado BLE disponible.', 'error');
    return;
  }

  if (!state.deviceInfo?.autofill_ready) {
    showAlert('Empareja KLAUS como teclado BLE antes de usar autofill.', 'error');
    return;
  }

  const delayMs = DEFAULT_AUTOFILL_DELAY_MS;
  setDeviceGuardState(`Autofill en ${Math.ceil(delayMs / 1000)} s. Cambia al formulario destino.`, 'info');

  try {
    await sendProtocolRequest(`ACCOUNT|AUTOFILL|${account.account_id}|${sendEnter ? 1 : 0}|${delayMs}`, {
      timeoutMs: delayMs + 8000
    });
    showAlert(`Autofill enviado para ${account.label || account.username}.`, 'success');
    setDeviceGuardState('Autofill enviado por BLE.', 'success');
  } catch (error) {
    setDeviceGuardState(error.message || 'No se pudo ejecutar autofill.', 'error');
    showAlert(error.message || 'No se pudo ejecutar autofill.', 'error');
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
  await refreshAuthorizedPortsState();
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

async function handlePortConnected() {
  await refreshAuthorizedPortsState();

  if (!state.token || state.port) {
    return;
  }

  setUSBStatus('ESP detectado por el navegador. Intentando reconectar automaticamente...', 'info');
  const status = await tryAutoConnectAuthorizedPort();
  if (status === 'ambiguous') {
    setUSBStatus('Se detectaron varios puertos autorizados. Pulsa Conectar ESP para elegir el correcto.', 'info');
  }
}

async function handlePortDisconnected() {
  if (!state.port) {
    await refreshAuthorizedPortsState();
    return;
  }

  await disconnectUSB(false);
  setUSBStatus('El puerto USB se desconecto. Si vuelves a conectar el ESP, intentaremos recuperarlo automaticamente.', 'error');
}

async function handleLogout(showMessage = true) {
  await disconnectUSB(false);

  state.token = null;
  state.currentUser = null;
  state.bindings = [];
  state.oauthProviders = {};
  state.activeDeviceOAuth = null;
  localStorage.removeItem('token');
  localStorage.removeItem('userId');

  elements.loginForm.reset();
  elements.registerForm.reset();
  elements.manualBindForm?.reset();
  elements.vaultCreateForm.reset();
  elements.vaultUnlockForm.reset();
  elements.deviceAccountForm.reset();
  syncAccountServiceProfile(true);

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
