// CONFIGURACIÓN DEL ESTUDIANTE - Cambia tu nombre aquí
const STUDENT_NAME = 'David Muvdi'; // Reemplaza con tu nombre (ej: 'Juan Pérez', 'María García')

// Mostrar timestamp actual y nombre del estudiante
document.addEventListener('DOMContentLoaded', () => {
    // Actualizar nombre del estudiante
    const studentNameElement = document.getElementById('studentName');
    if (studentNameElement) {
        studentNameElement.textContent = STUDENT_NAME;
    }
    
    // Mostrar timestamp
    const timestampElement = document.getElementById('timestamp');
    const now = new Date();
    timestampElement.textContent = `Último despliegue: ${now.toLocaleString('es-ES')}`;
    
    // Agregar interactividad
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            card.style.transform = 'scale(1.02)';
            setTimeout(() => {
                card.style.transform = '';
            }, 200);
        });
    });
});

// Función simple que los estudiantes pueden modificar
function actualizarVersion(nuevaVersion) {
    const versionElement = document.getElementById('version');
    versionElement.textContent = nuevaVersion;
}

// Ejemplo: actualizarVersion('2.0.0');
