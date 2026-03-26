// Global variables
let token = null;
let userId = null;
let currentUser = null;

// API Base URL
const API_URL = 'http://localhost:3000/api';

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
});

// Show Auth Section
function showAuthSection() {
    document.getElementById('authSection').style.display = 'flex';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
}

// Show Dashboard
function showDashboard() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
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
        // Get user info
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
        document.getElementById('usernameDisplay').textContent = user.username;
        document.getElementById('userEmailDisplay').textContent = user.email;

        showDashboard();
        loadESPs();
    } catch (error) {
        console.error('Error:', error);
        handleLogout();
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
            console.error('Error al cargar ESPs');
            return;
        }

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
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error al cargar ESPs', 'error');
    }
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
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
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
