// Global variables
let token = null;
let userId = null;
let currentUser = null;
let isOnline = navigator.onLine;

// API Base URL - Detecta automáticamente el servidor
const API_URL = window.location.origin + '/api';

// Sistema de almacenamiento local
const LocalStorage = {
  // Guardar datos de usuario
  saveUser: (user) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
  },

  // Obtener datos de usuario
  getUser: () => {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
  },

  // Guardar ESPs
  saveESPs: (esps) => {
    localStorage.setItem('userESPs', JSON.stringify(esps));
  },

  // Obtener ESPs
  getESPs: () => {
    const esps = localStorage.getItem('userESPs');
    return esps ? JSON.parse(esps) : [];
  },

  // Limpiar datos de sesión
  clearSession: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userESPs');
  }
};

// Detectar cambios de conexión
window.addEventListener('online', () => {
  isOnline = true;
  showAlert('✓ Conexión recuperada', 'success');
  console.log('🟢 Online');
});

window.addEventListener('offline', () => {
  isOnline = false;
  showAlert('⚠️ Sin conexión (modo offline)', 'info');
  console.log('🔴 Offline');
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    token = localStorage.getItem('token');
    userId = localStorage.getItem('userId');

    if (token && userId) {
        loadDashboard();
    } else {
        showAuthSection();
    }

    // Event listeners
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('registerFormElement').addEventListener('submit', handleRegister);
    document.getElementById('registerESPForm').addEventListener('submit', handleRegisterESP);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Backup button
    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) {
        backupBtn.addEventListener('click', exportDataAsJSON);
    }
});

// Show Auth Section
function showAuthSection() {
    document.getElementById('authSection').style.display = 'flex';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('backupBtn').style.display = 'none';
}

// Show Dashboard
function showDashboard() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('backupBtn').style.display = 'inline-block';
    
    if (!isOnline) {
        showAlert('⚠️ Modo offline activo - datos en caché', 'info');
    }
}

// Toggle between login and register forms
function toggleForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    loginForm.classList.toggle('active');
    registerForm.classList.toggle('active');

    // Clear forms
    document.getElementById('loginFormElement').reset();
    document.getElementById('registerFormElement').reset();
}

// Handle Login
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || 'Error en el login', 'error');
            return;
        }

        // Save token and user info
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        token = data.token;
        userId = data.userId;

        showAlert('¡Login exitoso!', 'success');
        setTimeout(loadDashboard, 500);
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión', 'error');
    }
}

// Handle Register
async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    if (password.length < 6) {
        showAlert('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || 'Error en el registro', 'error');
            return;
        }

        // Save token and user info
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        token = data.token;
        userId = data.userId;

        showAlert('¡Registro exitoso!', 'success');
        setTimeout(loadDashboard, 500);
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión', 'error');
    }
}

// Load Dashboard
async function loadDashboard() {
    try {
        // Intentar obtener datos del servidor
        const response = await fetch(`${API_URL}/auth/user`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const user = await response.json();

        if (!response.ok) {
            throw new Error(user.error);
        }

        currentUser = user;
        LocalStorage.saveUser(user);
        
        document.getElementById('usernameDisplay').textContent = user.username;
        document.getElementById('userEmailDisplay').textContent = user.email;

        showDashboard();
        loadESPs();
        
    } catch (error) {
        console.error('Error al cargar dashboard:', error);
        
        // Intentar cargar desde localStorage (offline)
        const cachedUser = LocalStorage.getUser();
        
        if (cachedUser) {
            console.log('📱 Usando datos en caché (offline)');
            currentUser = cachedUser;
            document.getElementById('usernameDisplay').textContent = cachedUser.username;
            document.getElementById('userEmailDisplay').textContent = cachedUser.email + ' (sin conexión)';
            
            showDashboard();
            loadESPs(); // Cargará desde localStorage
            showAlert('⚠️ Modo sin conexión - datos en caché', 'info');
        } else {
            // No hay datos en caché, logout
            handleLogout();
        }
    }
}

// Handle Register ESP
async function handleRegisterESP(e) {
    e.preventDefault();

    const esp_key = document.getElementById('espKey').value;
    const name = document.getElementById('espName').value;

    try {
        const response = await fetch(`${API_URL}/esp/register`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ esp_key, name: name || 'Mi ESP' })
        });

        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || 'Error al registrar ESP', 'error');
            return;
        }

        showAlert('¡ESP registrado exitosamente!', 'success');
        document.getElementById('registerESPForm').reset();
        loadESPs();
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión', 'error');
    }
}

// Load ESPs
// Load ESPs
async function loadESPs() {
    try {
        const response = await fetch(`${API_URL}/esp/my-esps`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const esps = await response.json();

        if (!response.ok) {
            throw new Error('Error al cargar ESPs');
        }

        // Guardar en localStorage
        LocalStorage.saveESPs(esps);
        renderESPs(esps);
        
    } catch (error) {
        console.error('Error al cargar ESPs:', error);
        
        // Intentar cargar desde localStorage
        const cachedESPs = LocalStorage.getESPs();
        if (cachedESPs.length > 0) {
            console.log('📱 Usando ESPs en caché (offline)');
            renderESPs(cachedESPs);
            showAlert('⚠️ ESPs en caché (sin conexión)', 'info');
        } else {
            const espsList = document.getElementById('espsList');
            espsList.innerHTML = '<p class="empty-message">No tienes ESPs registrados</p>';
        }
    }
}

// Renderizar lista de ESPs
function renderESPs(esps) {
    const espsList = document.getElementById('espsList');

    if (esps.length === 0) {
        espsList.innerHTML = '<p class="empty-message">No tienes ESPs registrados</p>';
        return;
    }

    espsList.innerHTML = esps.map(esp => `
        <div class="esp-item">
            <div class="esp-info">
                <h4>${esp.name}</h4>
                <p>Clave: <span class="esp-key">${esp.esp_key}</span></p>
                <p>Registrado: ${new Date(esp.registered_at).toLocaleDateString('es-ES')}</p>
            </div>
            <div class="esp-actions">
                <button class="btn btn-secondary" onclick="editESP(${esp.id}, '${esp.name}')">Editar</button>
                <button class="btn btn-danger" onclick="deleteESP(${esp.id})">Eliminar</button>
            </div>
        </div>
    `).join('');
}

// Edit ESP
function editESP(espId, currentName) {
    const newName = prompt('Nuevo nombre para el ESP:', currentName);
    if (!newName || newName.trim() === '') return;

    updateESP(espId, newName);
}

// Update ESP
async function updateESP(espId, newName) {
    try {
        const response = await fetch(`${API_URL}/esp/${espId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName })
        });

        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || 'Error al actualizar ESP', 'error');
            return;
        }

        showAlert('¡ESP actualizado exitosamente!', 'success');
        loadESPs();
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión', 'error');
    }
}

// Delete ESP
async function deleteESP(espId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este ESP?')) return;

    try {
        const response = await fetch(`${API_URL}/esp/${espId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            showAlert(data.error || 'Error al eliminar ESP', 'error');
            return;
        }

        showAlert('¡ESP eliminado exitosamente!', 'success');
        loadESPs();
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión', 'error');
    }
}

// Handle Logout
function handleLogout() {
    // Limpiar session storage
    LocalStorage.clearSession();
    
    token = null;
    userId = null;
    currentUser = null;

    // Reset forms
    document.getElementById('loginFormElement').reset();
    document.getElementById('registerFormElement').reset();
    document.getElementById('registerESPForm').reset();

    // Reset form display
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('registerForm').classList.remove('active');

    showAuthSection();
    showAlert('¡Sesión cerrada!', 'success');
}

    showAuthSection();
    showAlert('¡Sesión cerrada!', 'success');
}

// Show Alert Message
function showAlert(message, type = 'info') {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert ${type}`;
    alert.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
        alert.style.display = 'none';
    }, 3000);
}
