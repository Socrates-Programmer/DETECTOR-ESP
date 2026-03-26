// Funciones de backup y exportación de datos

// Exportar todos los datos a JSON
function exportDataAsJSON() {
    try {
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

        showAlert('✓ Datos exportados correctamente', 'success');
    } catch (error) {
        console.error('Error al exportar:', error);
        showAlert('Error al exportar datos', 'error');
    }
}

// Importar datos desde JSON
function importDataFromJSON(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // Validar estructura
            if (!data.user || !data.esps) {
                showAlert('Archivo inválido o corrupto', 'error');
                return;
            }

            // Guardar datos importados
            LocalStorage.saveUser(data.user);
            LocalStorage.saveESPs(data.esps);

            showAlert('✓ Datos importados correctamente', 'success');
            setTimeout(() => location.reload(), 1000);
        } catch (error) {
            console.error('Error al importar:', error);
            showAlert('Error al importar datos', 'error');
        }
    };

    reader.readAsText(file);
}

// Mostrar información de almacenamiento
function showStorageInfo() {
    const user = LocalStorage.getUser();
    const esps = LocalStorage.getESPs();

    let info = '📊 Información de Almacenamiento:\n\n';
    info += `Usuario: ${user ? user.username : 'No disponible'}\n`;
    info += `ESPs guardados: ${esps.length}\n`;
    info += `Última actualización: ${new Date().toLocaleString('es-ES')}\n`;
    info += `Navegador: ${navigator.onLine ? '🟢 Online' : '🔴 Offline'}`;

    console.log(info);
    showAlert(info, 'info');
}

// Limpiar cache completo
function clearAllCache() {
    if (confirm('¿Estás seguro? Esto eliminará todos los datos en caché.')) {
        LocalStorage.clearSession();
        showAlert('✓ Caché limpiado', 'success');
        setTimeout(() => location.reload(), 1000);
    }
}

// Auto-save periódico (cada 5 minutos)
setInterval(() => {
    if (currentUser) {
        const userData = {
            ...currentUser,
            lastSync: new Date().toISOString()
        };
        LocalStorage.saveUser(userData);
        console.log('💾 Auto-save realizado');
    }
}, 5 * 60 * 1000);

// Sincronizar cuando vuelve la conexión
document.addEventListener('online', () => {
    console.log('🔄 Sincronizando datos...');
    loadDashboard();
});
