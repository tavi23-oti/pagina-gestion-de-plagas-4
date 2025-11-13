// ====================================================================
// CONFIGURACIÓN DE FIREBASE
// ====================================================================
const firebaseConfig = {
    // Asegúrate de que estas credenciales coincidan con tu proyecto de Firebase
    apiKey: "AIzaSyDh_WYvaQhctfIbKgYseH4TIE1ZjRwKTic",
    authDomain: "registro-enfermedades.firebaseapp.com",
    projectId: "registro-enfermedades",
    storageBucket: "registro-enfermedades.firebasestorage.app",
    messagingSenderId: "813798124663",
    appId: "1:813798124663:web:b373e57b9a53bb30a8ea72",
    measurementId: "G-56191R72N5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const USERS_COLLECTION = 'usuarios';
const REPORTS_COLLECTION = 'enfermedades';

// Variables globales de la instancia del mapa
let mapaReporte = null;
let mapaGeneral = null;
let markerReporte = null; // Variable global para el marcador de reportes

// Función para inicializar el administrador si no existe en Firestore
const inicializarAdmin = async (uid, email) => {
    const adminUserRef = db.collection(USERS_COLLECTION).doc(uid);
    const adminDoc = await adminUserRef.get();

    if (!adminDoc.exists) {
        const adminData = {
            uid: uid,
            email: email,
            rol: 'admin',
            nombre: 'Administrador',
            foto: null,
            mensajes: []
        };
        await adminUserRef.set(adminData);
        return adminData;
    }
    return adminDoc.data();
};

// =========================================================
// FUNCIÓN DE CAMBIO DE SECCIÓN (CLAVE DEL MAPA)
// =========================================================
window.mostrarSeccion = (id) => {
    // VERIFICACIÓN DE ROL: Si el rol no es admin, no puede acceder a 'admin'.
    if (id === 'admin' && (!usuarioLogueado || usuarioLogueado.rol !== 'admin')) {
        mostrarToast('Acceso denegado. Solo administradores.', 'error');
        return;
    }

    const secciones = ['panelPrincipal', 'perfil', 'enfermedades', 'mapa', 'admin'];
    secciones.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) {
            el.classList.add('hidden');
        }
    });
    
    document.getElementById(id).classList.remove('hidden');
    const navElement = document.querySelector(`#sidebar a[onclick="mostrarSeccion('${id}')"]`);
    if (navElement) {
        document.getElementById('tituloSeccion').textContent = navElement.textContent.trim();
    } else {
         document.getElementById('tituloSeccion').textContent = id.charAt(0).toUpperCase() + id.slice(1);
    }
    
    // LÓGICA CLAVE DE MAPA: Inicializar o forzar redibujado
    if (id === 'enfermedades') {
        setTimeout(() => {
            if (mapaReporte) {
                // Si el mapa ya existe, forzamos el redibujado para que se vea completo.
                mapaReporte.invalidateSize(); 
            } else {
                // Si es la primera vez, lo inicializamos.
                cargarMapaReporte();
            }
            cargarEnfermedadesUsuario();
        }, 10);
    } else if (id === 'mapa') {
        setTimeout(() => {
            if (mapaGeneral) {
                // Forzamos el redibujado del mapa general si ya existe.
                mapaGeneral.invalidateSize(); 
            }
            // Cargamos o reinicializamos el mapa general.
            cargarMapaGeneral();
        }, 10);
    } else if (id === 'admin') {
        cargarUsuarios();
        cargarReportesAdmin();
    }
    
    window.toggleSidebar(); // Cerrar sidebar en móvil
};

// =========================================================
// FUNCIÓN CORREGIDA DE CARGA DE MAPA DE REPORTE
// =========================================================
const cargarMapaReporte = () => {
    // 1. Destruir mapa existente para evitar errores
    if (mapaReporte !== null) {
        mapaReporte.remove();
        mapaReporte = null; 
    }
    
    // 2. Crear el mapa
    // CORRECCIÓN CLAVE: Usar el ID string 'mapaContainer'
    mapaReporte = L.map('mapaContainer').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapaReporte);

    mapaReporte.invalidateSize(); // Forzar el dibujado inmediatamente
    let markerReporteLocal = null;
    
    // 3. Intentar geolocalización
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                mapaReporte.setView([latitude, longitude], 13);
                mapaReporte.invalidateSize();
                
                if (markerReporteLocal) {
                    mapaReporte.removeLayer(markerReporteLocal);
                }
                markerReporteLocal = L.marker([latitude, longitude]).addTo(mapaReporte)
                    .bindPopup("Tu ubicación actual").openPopup();
                document.getElementById('latitud').value = latitude;
                document.getElementById('longitud').value = longitude;
            },
            (error) => {
                if (error.code === error.PERMISSION_DENIED) {
                    mostrarToast("Permiso de ubicación denegado. Haz clic en el mapa para reportar.", "error");
                } else {
                    mostrarToast("No se pudo obtener tu ubicación. Haz clic en el mapa.", "error");
                }
                mapaReporte.setView([19.4326, -99.1332], 10);
                mapaReporte.invalidateSize();
            }
        );
    } else {
        mostrarToast("Geolocalización no es compatible. Haz clic en el mapa para reportar una ubicación.", "error");
        mapaReporte.setView([19.4326, -99.1332], 10);
        mapaReporte.invalidateSize();
    }

    mapaReporte.on('click', (e) => {
        const { lat, lng } = e.latlng;
        if (markerReporteLocal) {
            mapaReporte.removeLayer(markerReporteLocal);
        }
        markerReporteLocal = L.marker([lat, lng]).addTo(mapaReporte);
        document.getElementById('latitud').value = lat;
        document.getElementById('longitud').value = lng;
    });
};

// =========================================================
// FUNCIÓN CORREGIDA DE CARGA DE MAPA GENERAL
// =========================================================
const cargarMapaGeneral = async () => {
    if (mapaGeneral) {
        mapaGeneral.remove();
        mapaGeneral = null;
    }
    // CORRECCIÓN CLAVE: Usar el ID string 'mapaGeneral'
    mapaGeneral = L.map('mapaGeneral').setView([19.4326, -99.1332], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapaGeneral);

    mapaGeneral.invalidateSize(); // Forzar redibujado
    
    try {
        const snapshot = await db.collection(REPORTS_COLLECTION).get();
        const enfermedades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        enfermedades.forEach(enfermedad => {
            if (enfermedad.latitud && enfermedad.longitud) {
                const marker = L.marker([enfermedad.latitud, enfermedad.longitud]).addTo(mapaGeneral);
                
                const popupContent = `
                    <h3 class="font-bold">${enfermedad.nombre}</h3>
                    <p>Gravedad: ${enfermedad.gravedad}</p>
                    <p>Fecha: ${enfermedad.fecha && enfermedad.fecha.toDate ? enfermedad.fecha.toDate().toLocaleDateString() : 'N/A'}</p>
                    ${enfermedad.foto ? `<img src="${enfermedad.foto}" class="w-24 h-24 object-cover mt-2 rounded-md">` : ''}
                `;
                marker.bindPopup(popupContent);
            }
        });
    } catch (error) {
        mostrarToast('Error al cargar datos del mapa: ' + error.message, 'error');
    }
};

// ... RESTO DEL CÓDIGO JS ...

document.addEventListener('DOMContentLoaded', () => {
    // Definición de variables globales y elementos del DOM
    const seccionAuth = document.getElementById('seccionAuth');
    const seccionPrincipal = document.getElementById('seccionPrincipal');
    const mainHeader = document.getElementById('mainHeader');
    const sidebar = document.getElementById('sidebar');
    const formLogin = document.getElementById('formLogin');
    const formRegistro = document.getElementById('formRegistro');
    const btnLogin = document.getElementById('btnLogin');
    const btnRegistro = document.getElementById('btnRegistro');
    const loginBtn = document.getElementById('loginBtn');
    const registroBtn = document.getElementById('registroBtn');
    const mensajeAuth = document.getElementById('mensajeAuth');
    const saludoUsuario = document.getElementById('saludoUsuario');
    const linkAdmin = document.getElementById('linkAdmin');
    const statsAdmin = document.getElementById('statsAdmin');
    const listaEnfermedades = document.getElementById('listaEnfermedades');
    const formEnfermedad = document.getElementById('formEnfermedad');
    const formEditarEnfermedad = document.getElementById('formEditarEnfermedad');
    const modalEditar = document.getElementById('modalEditar');
    const modalMensaje = document.getElementById('modalMensaje');
    const formMensaje = document.getElementById('formMensaje');
    const statsMisEnfermedades = document.getElementById('statsMisEnfermedades');
    const statsTotalUsuarios = document.getElementById('statsTotalUsuarios');
    const statsTotalEnfermedades = document.getElementById('statsTotalEnfermedades');
    const listaUsuarios = document.getElementById('listaUsuarios');
    const listaReportesAdmin = document.getElementById('listaReportesAdmin');
    const toastContainer = document.getElementById('toastContainer');
    const inputLatitud = document.getElementById('latitud');
    const inputLongitud = document.getElementById('longitud');
    const filtroBusqueda = document.getElementById('filtroBusqueda');
    const filtroGravedad = document.getElementById('filtroGravedad');
    const gravedadChartCanvas = document.getElementById('gravedadChart').getContext('2d');
    let gravedadChart;

    // Estado de la aplicación
    let usuarioLogueado = null;

    // =======================================================
    // LÓGICA DE CAMBIO DE FORMULARIO
    // =======================================================
    btnLogin.addEventListener('click', () => {
        formLogin.classList.remove('hidden');
        formRegistro.classList.add('hidden');
        btnLogin.classList.add('bg-green-600', 'text-white');
        btnLogin.classList.remove('bg-gray-300', 'text-gray-700');
        btnRegistro.classList.add('bg-gray-300', 'text-gray-700');
        btnRegistro.classList.remove('bg-green-600', 'text-white');
        mensajeAuth.classList.add('hidden');
    });

    btnRegistro.addEventListener('click', () => {
        formRegistro.classList.remove('hidden');
        formLogin.classList.add('hidden');
        btnRegistro.classList.add('bg-green-600', 'text-white');
        btnRegistro.classList.remove('bg-gray-300', 'text-gray-700');
        btnLogin.classList.add('bg-gray-300', 'text-gray-700');
        btnLogin.classList.remove('bg-green-600', 'text-white');
        mensajeAuth.classList.add('hidden');
    });
    // =======================================================
    // 1. INICIALIZACIÓN Y AUTHENTICATION (FIREBASE)
    // =======================================================

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            let userProfile;
            if (user.email === 'admin@example.com' && user.uid) {
                userProfile = await inicializarAdmin(user.uid, user.email);
            } else {
                const userDoc = await db.collection(USERS_COLLECTION).doc(user.uid).get();
                
                if (userDoc.exists) {
                    userProfile = userDoc.data();
                } else {
                    // Crear perfil inicial si solo se registraron con Auth
                    userProfile = {
                        uid: user.uid,
                        email: user.email,
                        rol: 'usuario',
                        nombre: user.displayName || 'Usuario',
                        foto: null,
                        mensajes: []
                    };
                    await db.collection(USERS_COLLECTION).doc(user.uid).set(userProfile);
                }
            }
            usuarioLogueado = { uid: user.uid, ...userProfile };
            mostrarContenidoPrincipal();

        } else {
            seccionAuth.classList.remove('hidden');
            seccionPrincipal.classList.add('hidden');
            mainHeader.classList.add('hidden');
            sidebar.classList.add('hidden');
            document.body.style.display = 'flex';
            document.body.classList.add('auth-container');
            usuarioLogueado = null;
        }
    });

    // Función de Login (Usando Firebase Auth)
    loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('emailLogin').value;
        const password = document.getElementById('passwordLogin').value;

        try {
            await auth.signInWithEmailAndPassword(email, password);
            mostrarToast('¡Inicio de sesión exitoso!', 'success');
        } catch (error) {
            mostrarMensajeAuth('Error de Login: Credenciales incorrectas o usuario no existe.', 'error');
        }
    });

    // Función de Registro (Usando Firebase Auth y Firestore)
    registroBtn.addEventListener('click', async () => {
        const email = document.getElementById('emailRegistro').value;
        const password = document.getElementById('passwordRegistro').value;

        if (password.length < 6) {
            mostrarMensajeAuth('La contraseña debe tener al menos 6 caracteres.', 'error');
            return;
        }

        try {
            await auth.createUserWithEmailAndPassword(email, password);
            // No necesitamos el set manual aquí, ya que el onAuthStateChanged lo manejará
            // y creará el perfil inicial si es la primera vez.
            mostrarMensajeAuth('Registro exitoso. ¡Iniciando sesión!', 'success');
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                mostrarMensajeAuth('Este email ya está registrado.', 'error');
            } else {
                mostrarMensajeAuth(`Error de Registro: ${error.message}`, 'error');
            }
        }
    });

    // Función para iniciar la interfaz después de la autenticación
    const mostrarContenidoPrincipal = () => {
        seccionAuth.classList.add('hidden');
        seccionPrincipal.classList.remove('hidden');
        mainHeader.classList.remove('hidden');
        sidebar.classList.remove('hidden');
        document.body.classList.remove('auth-container');
        document.body.style.display = '';
        
        saludoUsuario.textContent = `${usuarioLogueado.nombre}`;
        
        actualizarEstadisticas();
        cargarDatosPerfil();
        
        if (usuarioLogueado.rol === 'admin') {
            linkAdmin.classList.remove('hidden');
            statsAdmin.classList.remove('hidden');
        } else {
            linkAdmin.classList.add('hidden');
            statsAdmin.classList.add('hidden');
        }
        
        window.mostrarSeccion('panelPrincipal'); 
        window.toggleModoOscuroInicial();
    };
    
    // Función para cerrar sesión
    window.logout = () => {
        auth.signOut();
    };

    // Función para alternar la visibilidad de la barra lateral en móviles
    window.toggleSidebar = () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');
        // Solo se ejecuta en móvil
        if (window.innerWidth < 768) { 
            sidebar.classList.toggle('-translate-x-full');
            overlay.classList.toggle('hidden');
        }
    };

    // =======================================================
    // 2. FUNCIONALIDADES DEL PERFIL Y DATOS DE USUARIO
    // =======================================================
    
    const cargarDatosPerfil = () => {
        const nombrePerfil = document.getElementById('nombrePerfil');
        const emailPerfil = document.getElementById('emailPerfil');
        const rolPerfil = document.getElementById('rolPerfil');
        const fotoPerfil = document.getElementById('fotoPerfil');

        nombrePerfil.value = usuarioLogueado.nombre || '';
        emailPerfil.value = usuarioLogueado.email;
        rolPerfil.value = usuarioLogueado.rol;
        if (usuarioLogueado.foto) {
            fotoPerfil.src = usuarioLogueado.foto;
        } else {
            fotoPerfil.src = 'https://via.placeholder.com/150';
        }
    };

    window.guardarPerfil = async () => {
        const nombrePerfil = document.getElementById('nombrePerfil').value;
        usuarioLogueado.nombre = nombrePerfil;
        
        try {
            await db.collection(USERS_COLLECTION).doc(usuarioLogueado.uid).update({
                nombre: nombrePerfil,
                foto: usuarioLogueado.foto
            });
            saludoUsuario.textContent = `${usuarioLogueado.nombre}`;
            mostrarToast('Perfil actualizado con éxito.', 'success');
        } catch (error) {
            mostrarToast(`Error al guardar perfil: ${error.message}`, 'error');
        }
    };

    window.cambiarFotoPerfil = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('fotoPerfil').src = e.target.result;
                usuarioLogueado.foto = e.target.result;
                guardarPerfil();
            };
            reader.readAsDataURL(file);
        }
    };

    // =======================================================
    // 3. REPORTES (CRUD con Firestore)
    // =======================================================

    formEnfermedad.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombreEnfermedad').value;
        const sintomas = document.getElementById('sintomas').value.split(',').map(s => s.trim());
        const gravedad = document.getElementById('gravedad').value;
        const latitud = parseFloat(document.getElementById('latitud').value);
        const longitud = parseFloat(document.getElementById('longitud').value);
        const fotoInput = document.getElementById('fotoEnfermedad');
        const file = fotoInput.files[0];
        
        if (isNaN(latitud) || isNaN(longitud)) {
            mostrarToast('Por favor, selecciona una ubicación en el mapa.', 'error');
            return;
        }
        
        const guardarReporte = async (fotoUrl = null) => {
            const nuevaEnfermedad = {
                usuarioUid: usuarioLogueado.uid,
                nombre,
                sintomas,
                gravedad,
                latitud,
                longitud,
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                foto: fotoUrl || ''
            };

            try {
                await db.collection(REPORTS_COLLECTION).add(nuevaEnfermedad);
                mostrarToast('Reporte de enfermedad guardado con éxito.', 'success');
                formEnfermedad.reset();
                
                // Si el marcador existía del último reporte, lo eliminamos
                if (markerReporte) {
                    mapaReporte.removeLayer(markerReporte);
                    markerReporte = null;
                }
                document.getElementById('latitud').value = '';
                document.getElementById('longitud').value = '';

                cargarEnfermedadesUsuario();
                actualizarEstadisticas();
            } catch (error) {
                mostrarToast('Error al guardar el reporte: ' + error.message, 'error');
            }
        };

        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                guardarReporte(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            guardarReporte();
        }
    });

    const cargarEnfermedadesUsuario = async () => {
        if (!usuarioLogueado) return;
        
        try {
            const snapshot = await db.collection(REPORTS_COLLECTION)
                                        .where('usuarioUid', '==', usuarioLogueado.uid)
                                        .get();
            
            const misEnfermedades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const searchTerm = filtroBusqueda.value.toLowerCase();
            const gravedadFilter = filtroGravedad.value.toLowerCase();

            const filteredEnfermedades = misEnfermedades.filter(e => {
                const matchesSearch = e.nombre.toLowerCase().includes(searchTerm) || e.sintomas.some(s => s.toLowerCase().includes(searchTerm));
                const matchesGravedad = gravedadFilter === '' || e.gravedad.toLowerCase() === gravedadFilter;
                return matchesSearch && matchesGravedad;
            });
            
            listaEnfermedades.innerHTML = '';
            if (filteredEnfermedades.length === 0) {
                listaEnfermedades.innerHTML = '<p class="text-gray-500 text-center dark:text-gray-400">No se encontraron reportes que coincidan con los filtros.</p>';
                return;
            }

            filteredEnfermedades.forEach(enfermedad => {
                const card = crearCardEnfermedad(enfermedad, true);
                listaEnfermedades.appendChild(card);
            });

        } catch (error) {
            mostrarToast('Error al cargar reportes: ' + error.message, 'error');
        }
    };

    document.getElementById('filtroBusqueda').addEventListener('input', cargarEnfermedadesUsuario);
    document.getElementById('filtroGravedad').addEventListener('change', cargarEnfermedadesUsuario);

    const crearCardEnfermedad = (enfermedad, conBotones) => {
        const card = document.createElement('div');
        card.className = 'enfermedad-card';
        const fechaDisplay = enfermedad.fecha && enfermedad.fecha.toDate ? enfermedad.fecha.toDate().toLocaleDateString() : 'Fecha no disponible';
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="text-xl font-bold text-gray-800 dark:text-white">${enfermedad.nombre}</h3>
                ${conBotones ? `
                    <div>
                        <button onclick="abrirModalEditar('${enfermedad.id}')" class="btn-editar"><i class="fas fa-edit"></i></button>
                        <button onclick="confirmarEliminar('${enfermedad.id}')" class="btn-eliminar"><i class="fas fa-trash"></i></button>
                    </div>` : ''}
            </div>
            <p class="text-gray-600 mb-2 dark:text-gray-400"><strong>Fecha:</strong> ${fechaDisplay}</p>
            <p class="text-gray-600 mb-2 dark:text-gray-400"><strong>Gravedad:</strong> <span class="font-semibold text-capitalize">${enfermedad.gravedad}</span></p>
            <p class="text-gray-600 mb-2 dark:text-gray-400"><strong>Localización:</strong> ${enfermedad.latitud.toFixed(4)}, ${enfermedad.longitud.toFixed(4)}</p>
            ${enfermedad.foto ? `<img src="${enfermedad.foto}" class="w-full mt-4 rounded-md">` : ''}
            <div class="mt-4">
                <h4 class="font-semibold text-gray-700 mb-2 dark:text-gray-300">Síntomas:</h4>
                ${enfermedad.sintomas.map(sintoma => `<span class="sintoma-tag">${sintoma}</span>`).join('')}
            </div>
        `;
        return card;
    };

    window.confirmarEliminar = (id) => {
        if (confirm("¿Estás seguro de que quieres eliminar este reporte?")) {
            eliminarEnfermedad(id);
        }
    };

    const eliminarEnfermedad = async (id) => {
        try {
            await db.collection(REPORTS_COLLECTION).doc(id).delete();
            mostrarToast('Reporte eliminado con éxito.', 'success');
            cargarEnfermedadesUsuario();
            actualizarEstadisticas();
        } catch (error) {
            mostrarToast('Error al eliminar el reporte: ' + error.message, 'error');
        }
    };
    
    // Funciones del Modal de Edición
    window.abrirModalEditar = async (id) => {
        try {
            const doc = await db.collection(REPORTS_COLLECTION).doc(id).get();
            if (!doc.exists) {
                mostrarToast('Reporte no encontrado.', 'error');
                return;
            }
            const enfermedad = { id: doc.id, ...doc.data() };
            
            document.getElementById('editId').value = enfermedad.id;
            document.getElementById('editNombre').value = enfermedad.nombre;
            document.getElementById('editSintomas').value = enfermedad.sintomas.join(', ');
            document.getElementById('editGravedad').value = enfermedad.gravedad;
            modalEditar.style.display = 'block';

        } catch (error) {
            mostrarToast('Error al cargar datos para edición: ' + error.message, 'error');
        }
    };

    document.getElementById('formEditarEnfermedad').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        const nombre = document.getElementById('editNombre').value;
        const sintomas = document.getElementById('editSintomas').value.split(',').map(s => s.trim());
        const gravedad = document.getElementById('editGravedad').value;

        try {
            await db.collection(REPORTS_COLLECTION).doc(id).update({
                nombre,
                sintomas,
                gravedad
            });
            
            mostrarToast('Reporte actualizado con éxito.', 'success');
            cerrarModal();
            cargarEnfermedadesUsuario();
            actualizarEstadisticas();
        } catch (error) {
            mostrarToast('Error al actualizar el reporte: ' + error.message, 'error');
        }
    });

    window.cerrarModal = () => {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => modal.style.display = 'none');
    };

    // =======================================================
    // 4. MAPAS Y ESTADÍSTICAS GLOBALES
    // =======================================================

    // Funcionalidades del Panel de Administración
    const cargarUsuarios = async () => {
        try {
            const snapshot = await db.collection(USERS_COLLECTION).get();
            const usuarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            document.getElementById('listaUsuarios').innerHTML = '';
            usuarios.forEach(usuario => {
                const li = document.createElement('li');
                li.className = 'bg-gray-200 p-3 rounded-lg flex justify-between items-center dark:bg-gray-700';
                
                const botonesGestion = document.createElement('div');
                
                if (usuario.rol === 'usuario') {
                    const botonAscender = document.createElement('button');
                    botonAscender.textContent = 'Ascender a Fumigador';
                    botonAscender.className = 'bg-green-500 text-white px-2 py-1 rounded-md text-xs hover:bg-green-600 mr-2';
                    botonAscender.onclick = () => cambiarRol(usuario.uid, 'fumigador');
                    botonesGestion.appendChild(botonAscender);
                } else if (usuario.rol === 'fumigador') {
                    const botonDegradar = document.createElement('button');
                    botonDegradar.textContent = 'Degradar a Usuario';
                    botonDegradar.className = 'bg-red-500 text-white px-2 py-1 rounded-md text-xs hover:bg-red-600';
                    botonDegradar.onclick = () => cambiarRol(usuario.uid, 'usuario');
                    botonesGestion.appendChild(botonDegradar);
                }
                
                if (usuario.rol !== 'admin') {
                    const botonMensaje = document.createElement('button');
                    botonMensaje.textContent = 'Enviar Mensaje';
                    botonMensaje.className = 'bg-blue-500 text-white px-2 py-1 rounded-md text-xs hover:bg-blue-600 ml-2';
                    botonMensaje.onclick = () => abrirModalMensaje(usuario.uid, usuario.email);
                    botonesGestion.appendChild(botonMensaje);

                    const botonEliminar = document.createElement('button');
                    botonEliminar.textContent = 'Eliminar';
                    botonEliminar.className = 'bg-gray-500 text-white px-2 py-1 rounded-md text-xs hover:bg-gray-600 ml-2';
                    botonEliminar.onclick = () => confirmarEliminarUsuario(usuario.uid, usuario.email);
                    botonesGestion.appendChild(botonEliminar);
                }
                
                li.innerHTML = `
                    <span class="font-semibold">${usuario.email}</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">Rol: ${usuario.rol}</span>
                `;
                li.appendChild(botonesGestion);
                document.getElementById('listaUsuarios').appendChild(li);
            });
        } catch (error) {
            mostrarToast('Error al cargar usuarios: ' + error.message, 'error');
        }
    };

    window.confirmarEliminarUsuario = async (uid, email) => {
        if (email === auth.currentUser.email) {
            mostrarToast('No puedes eliminar tu propia cuenta de administrador.', 'error');
            return;
        }
        if (confirm(`¿Estás seguro de que quieres eliminar al usuario ${email}? Esto eliminará su registro en Firestore y todos sus reportes.`)) {
            await eliminarUsuario(uid);
        }
    };

    const eliminarUsuario = async (uid) => {
        try {
            await db.collection(USERS_COLLECTION).doc(uid).delete();

            const reportesSnapshot = await db.collection(REPORTS_COLLECTION).where('usuarioUid', '==', uid).get();
            const batch = db.batch();
            reportesSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            mostrarToast('Usuario y sus datos eliminados con éxito. (Nota: La eliminación de la cuenta de Auth debe hacerse manualmente en la consola).', 'success');
            cargarUsuarios();
            actualizarEstadisticas();
        } catch (error) {
            mostrarToast('Error al eliminar el usuario: ' + error.message, 'error');
        }
    };

    const cambiarRol = async (uid, nuevoRol) => {
        try {
            await db.collection(USERS_COLLECTION).doc(uid).update({ rol: nuevoRol });
            mostrarToast(`Rol cambiado a ${nuevoRol}.`, 'success');
            cargarUsuarios();
            if (uid === usuarioLogueado.uid) {
                const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
                usuarioLogueado = { uid: uid, ...userDoc.data() };
                mostrarContenidoPrincipal();
            }
        } catch (error) {
            mostrarToast('Error al cambiar el rol: ' + error.message, 'error');
        }
    };

    window.abrirModalMensaje = (uid, email) => {
        document.getElementById('mensajeUsuarioId').value = uid;
        document.getElementById('mensajeDestinatario').textContent = `Enviando mensaje a: ${email}`;
        document.getElementById('modalMensaje').style.display = 'block';
    };

    document.getElementById('formMensaje').addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('mensajeUsuarioId').value;
        const mensaje = document.getElementById('mensajeTexto').value;
        const mensajeTextoArea = document.getElementById('mensajeTexto');

        try {
            const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const nuevosMensajes = userData.mensajes || [];
                nuevosMensajes.push(mensaje);
                
                await db.collection(USERS_COLLECTION).doc(userId).update({ mensajes: nuevosMensajes });
                
                mostrarToast('Mensaje enviado con éxito.', 'success');
                cerrarModal();
                mensajeTextoArea.value = '';
            }
        } catch (error) {
            mostrarToast('Error al enviar el mensaje: ' + error.message, 'error');
        }
    });

    const cargarReportesAdmin = async () => {
        try {
            const snapshot = await db.collection(REPORTS_COLLECTION).get();
            const enfermedades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            document.getElementById('listaReportesAdmin').innerHTML = '';
            enfermedades.forEach(enfermedad => {
                const card = crearCardEnfermedad(enfermedad, false);
                card.innerHTML += `
                    <div class="mt-4 text-right">
                        <button onclick="confirmarEliminarAdmin('${enfermedad.id}')" class="btn-eliminar"><i class="fas fa-trash"></i> Eliminar</button>
                    </div>
                `;
                document.getElementById('listaReportesAdmin').appendChild(card);
            });
        } catch (error) {
            mostrarToast('Error al cargar reportes de administración: ' + error.message, 'error');
        }
    };

    window.confirmarEliminarAdmin = (id) => {
        if (confirm("¿Estás seguro de que quieres eliminar este reporte global?")) {
            eliminarEnfermedadAdmin(id);
        }
    };

    const eliminarEnfermedadAdmin = async (id) => {
        try {
            await db.collection(REPORTS_COLLECTION).doc(id).delete();
            mostrarToast('Reporte global eliminado con éxito.', 'success');
            cargarReportesAdmin();
            actualizarEstadisticas();
        } catch (error) {
            mostrarToast('Error al eliminar el reporte: ' + error.message, 'error');
        }
    };

    // Funcionalidades del Panel Principal
    const actualizarEstadisticas = async () => {
        try {
            const reportesSnapshot = await db.collection(REPORTS_COLLECTION).get();
            const enfermedades = reportesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const usuariosSnapshot = await db.collection(USERS_COLLECTION).get();
            const usuarios = usuariosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const misEnfermedades = enfermedades.filter(e => e.usuarioUid === usuarioLogueado.uid);
            
            document.getElementById('statsMisEnfermedades').textContent = misEnfermedades.length;
            document.getElementById('statsTotalUsuarios').textContent = usuarios.length;
            document.getElementById('statsTotalEnfermedades').textContent = enfermedades.length;
            
            // Cargar gráfico de gravedad
            actualizarGraficoGravedad(enfermedades);
            
            // Mostrar mensajes del administrador al usuario
            const notificacionesDiv = document.getElementById('notificaciones');
            notificacionesDiv.innerHTML = '';
            
            const usuarioActualizado = usuarios.find(u => u.uid === usuarioLogueado.uid);
            if (usuarioActualizado && usuarioActualizado.mensajes && usuarioActualizado.mensajes.length > 0) {
                usuarioActualizado.mensajes.forEach(mensaje => {
                    const li = document.createElement('li');
                    li.className = 'bg-blue-100 p-3 rounded-lg dark:bg-blue-900 dark:text-blue-100 cursor-pointer';
                    li.innerHTML = `<p class="font-semibold">Mensaje del administrador:</p><p class="text-sm">${mensaje}</p>`;
                    notificacionesDiv.appendChild(li);
                });
            }
        } catch (error) {
            mostrarToast('Error al cargar estadísticas: ' + error.message, 'error');
        }
    };
    
    const actualizarGraficoGravedad = (enfermedades) => {
        const gravedadCounts = { 'bajo': 0, 'moderado': 0, 'alto': 0 };
        enfermedades.forEach(e => {
            if (e.gravedad && gravedadCounts[e.gravedad]) {
                gravedadCounts[e.gravedad]++;
            }
        });

        const data = {
            labels: ['Bajo', 'Moderado', 'Alto'],
            datasets: [{
                label: 'Número de Reportes',
                data: [gravedadCounts['bajo'], gravedadCounts['moderado'], gravedadCounts['alto']],
                backgroundColor: [
                    '#10B981',
                    '#F59E0B',
                    '#EF4444'
                ],
                hoverOffset: 4
            }]
        };

        const config = {
            type: 'pie',
            data: data,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: document.body.classList.contains('dark') ? '#d1d5db' : '#111827'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Distribución de Gravedad de Reportes',
                        color: document.body.classList.contains('dark') ? '#d1d5db' : '#111827'
                    }
                }
            }
        };

        if (gravedadChart) {
            gravedadChart.destroy();
        }
        gravedadChart = new Chart(gravedadChartCanvas, config);
    };

    // Funcionalidad para exportar datos
    window.exportarDatos = async () => {
        try {
            const reportesSnapshot = await db.collection(REPORTS_COLLECTION).get();
            // Conversión de timestamp a string para el JSON exportado
            const enfermedades = reportesSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                fecha: doc.data().fecha && doc.data().fecha.toDate ? doc.data().fecha.toDate().toISOString() : 'N/A'
            }));
            
            const usuariosSnapshot = await db.collection(USERS_COLLECTION).get();
            const usuarios = usuariosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const data = { usuarios, enfermedades };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "datos_monitoreo_firebase.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            mostrarToast('Datos exportados con éxito.', 'success');

        } catch (error) {
            mostrarToast('Error al exportar datos: ' + error.message, 'error');
        }
    };

    // --- Utilidades Generales ---

    // Mensajes de notificación (Toasts)
    const mostrarToast = (message, type) => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.getElementById('toastContainer').appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    };

    // Mensajes de autenticación
    const mostrarMensajeAuth = (message, type) => {
        document.getElementById('mensajeAuth').textContent = message;
        document.getElementById('mensajeAuth').classList.remove('hidden');
        document.getElementById('mensajeAuth').className = `text-center text-sm mt-4 ${type === 'success' ? 'text-green-600' : 'text-red-600'}`;
    };

    // Dark mode
    window.toggleModoOscuro = () => {
        const body = document.body;
        body.classList.toggle('dark');
        const isDark = body.classList.contains('dark');
        localStorage.setItem('darkMode', isDark);
        if (gravedadChart) {
            gravedadChart.options.plugins.legend.labels.color = isDark ? '#d1d5db' : '#111827';
            gravedadChart.options.plugins.title.color = isDark ? '#d1d5db' : '#111827';
            gravedadChart.update();
        }
    };

    const toggleModoOscuroInicial = () => {
        const isDark = localStorage.getItem('darkMode') === 'true';
        if (isDark) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
    };
});