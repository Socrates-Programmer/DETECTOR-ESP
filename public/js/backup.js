// Funciones de backup y exportación de datos

console.log('✓ backup.js cargado correctamente');

// Exportar todos los datos a JSON
function exportDataAsJSON() {
    try {
        console.log('📥 Iniciando exportación de datos...');
        
        const data = {
            user: LocalStorage.getUser(),
            esps: LocalStorage.getESPs(),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `esp-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('✓ Datos exportados correctamente');
        if (typeof showAlert === 'function') {
            showAlert('✓ Datos exportados correctamente', 'success');
        }
    } catch (error) {
        console.error('Error al exportar:', error);
        if (typeof showAlert === 'function') {
            showAlert('Error al exportar datos', 'error');
        }
    }
}

// Importar datos desde JSON
function importDataFromJSON(file) {
    if (!file) return;

    try {
        console.log('📤 Iniciando importación de datos desde:', file.name);
        
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Validar estructura
                if (!data.user || !data.esps) {
                    console.error('Archivo inválido o corrupto');
                    if (typeof showAlert === 'function') {
                        showAlert('Archivo inválido o corrupto', 'error');
                    }
                    return;
                }

                // Guardar datos importados
                LocalStorage.saveUser(data.user);
                LocalStorage.saveESPs(data.esps);

                console.log('✓ Datos importados correctamente');
                if (typeof showAlert === 'function') {
                    showAlert('✓ Datos importados correctamente', 'success');
                    setTimeout(() => location.reload(), 1000);
                }
            } catch (error) {
                console.error('Error al importar:', error);
                if (typeof showAlert === 'function') {
                    showAlert('Error al importar datos', 'error');
                }
            }
        };

        reader.onerror = () => {
            console.error('Error al leer el archivo');
            if (typeof showAlert === 'function') {
                showAlert('Error al leer el archivo', 'error');
            }
        };

        reader.readAsText(file);
    } catch (error) {
        console.error('Error general en importación:', error);
        if (typeof showAlert === 'function') {
            showAlert('Error al procesar el archivo', 'error');
        }
    }
}

// Mostrar información de almacenamiento
function showStorageInfo() {
    try {
        const user = LocalStorage ? LocalStorage.getUser() : null;
        const esps = LocalStorage ? LocalStorage.getESPs() : [];

        let info = '📊 Información de Almacenamiento:\n\n';
        info += `Usuario: ${user ? user.username : 'No disponible'}\n`;
        info += `ESPs guardados: ${esps ? esps.length : 0}\n`;
        info += `Última actualización: ${new Date().toLocaleString('es-ES')}\n`;
        info += `Navegador: ${navigator.onLine ? '🟢 Online' : '🔴 Offline'}`;

        console.log(info);
        if (typeof showAlert === 'function') {
            showAlert(info, 'info');
        }
    } catch (error) {
        console.error('Error al mostrar información:', error);
    }
}

// Limpiar cache completo
function clearAllCache() {
    if (confirm('¿Estás seguro? Esto eliminará todos los datos en caché.')) {
        try {
            if (typeof LocalStorage !== 'undefined') {
                LocalStorage.clearSession();
            }
            console.log('✓ Caché limpiado');
            if (typeof showAlert === 'function') {
                showAlert('✓ Caché limpiado', 'success');
                setTimeout(() => location.reload(), 1000);
            }
        } catch (error) {
            console.error('Error al limpiar caché:', error);
        }
    }
}

// Auto-save periódico (cada 5 minutos)
setInterval(() => {
    try {
        if (typeof currentUser !== 'undefined' && currentUser && typeof LocalStorage !== 'undefined') {
            const userData = {
                ...currentUser,
                lastSync: new Date().toISOString()
            };
            LocalStorage.saveUser(userData);
            console.log('💾 Auto-save realizado');
        }
    } catch (error) {
        console.error('Error en auto-save:', error);
    }
}, 5 * 60 * 1000);

// Sincronizar cuando vuelve la conexión
document.addEventListener('online', () => {
    console.log('🔄 Sincronizando datos...');
    if (typeof loadDashboard === 'function') {
        loadDashboard();
    }
});

console.log('✓ Todas las funciones de backup cargadas correctamente');
