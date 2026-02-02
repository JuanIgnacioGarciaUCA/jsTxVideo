/**
 * jsTxVideo - VERSIÓN FINAL (FIX RECEPTOR)
 */

// Log en pantalla
const logArea = document.createElement('div');
logArea.style = "background: #000; color: #0f0; font-family: monospace; font-size: 10px; padding: 10px; height: 80px; overflow-y: scroll; width: 100%; text-align: left;";
document.body.appendChild(logArea);

function log(msg) {
    logArea.innerHTML += `> ${msg}<br>`;
    logArea.scrollTop = logArea.scrollHeight;
    console.log(msg);
}

const overlayCanvas = document.getElementById('overlay');
const overlayCtx = overlayCanvas.getContext('2d', { willReadFrequently: true });
let apriltagDetector = null;

// 1. Inicializar el detector cuando la librería esté lista
// La librería 'apriltag.js' crea una función global llamada 'AprilTag'
/*
async function cargarDetector() {
    log("Iniciando carga de WASM para AprilTag...");
    // Esperamos a que el módulo WASM se cargue (es automático con esta lib)
    AprilTag({
        locateFile: (file) => `https://cdn.jsdelivr.net/gh/mabel-sz/apriltag-js@master/${file}`
    }).then((Module) => {
        apriltagDetector = Module;
        log("Detector AprilTag (WASM) listo ✅");
    });
}*/
// 1. Inicializar el Detector
async function cargarDetector() {
    log("Cargando motor WASM de AprilTag...");
    
    detectorInstance = new Apriltag(() => {
        // --- LÍNEA CLAVE PARA CAMBIAR LA FAMILIA ---
        // Cambiamos de la predeterminada (tag36h11) a tag16h5
        try {
            detectorInstance.set_family("tag16h5"); 
            log("Configurado para familia: tag16h5 ✅");
        } catch(e) {
            log("Error al cambiar de familia, usando predeterminada.");
        }
    });
}


cargarDetector();

const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');



let localStream = null;

// Configuración con varios servidores STUN para saltar Firewalls

const peer = new Peer(undefined, {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.stunprotocol.org' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    }
});

//const peer = new Peer(); 

peer.on('open', (id) => {
    log("Mi ID: " + id);
    myIdDisplay.innerText = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', (err) => log("ERROR: " + err.type));

// --- LÓGICA EMISOR ---
// --- LÓGICA EMISOR ---
btnStart.addEventListener('click', async () => {
    try {
        log("Solicitando cámara a 640x480...");
        
        const constraints = {
            video: {
                // Forzamos la resolución
                width: { ideal: 640 },
                height: { ideal: 480 },
                // Aseguramos que mantenga la proporción 4:3
                aspectRatio: 1.33333,
                facingMode: "environment" 
            },
            audio: false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Verificamos qué resolución nos ha dado el móvil realmente
        const settings = localStream.getVideoTracks()[0].getSettings();
        log(`Resolución real: ${settings.width}x${settings.height}`);

        videoElement.srcObject = localStream;
        videoElement.play();
        
        btnStart.innerText = "CÁMARA OK ✅";
        btnStart.style.background = "#2e7d32";
    } catch (err) {
        log("Error cámara: " + err);
        alert("No se pudo forzar 640x480. Probando modo automático...");
        // Fallback por si la cámara no soporta esa resolución exacta
        localStream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
});

peer.on('call', (call) => {
    log("📞 Llamada entrante de " + call.peer);
    call.answer(localStream);  // tu stream con vídeo

    call.on('stream', (remoteStream) => {
        log("Recibí stream del receptor (puede ser solo audio o vacío)");
        // Si quieres ver también el del receptor (aunque sea negro o audio)
        // mostrarVideo(remoteStream); 
    });

    call.on('error', err => log("Error en call: " + err));
});

btnConnect.addEventListener('click', async () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Falta ID");

    log("Conectando a: " + remoteId + "...");

    let receptorStream;

    try {
        // Intentamos pedir cámara (esto ayuda a la estabilidad si existe)
        receptorStream = await navigator.mediaDevices.getUserMedia({
            video: true
        });
        log("Cámara del receptor detectada y usada.");
    } catch (err) {
        log("PC sin cámara o permiso denegado. Creando stream virtual negro...");
        
        // --- TRUCO: Crear un Stream de video "falso" usando un Canvas ---
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Capturamos el dibujo del canvas como un stream de video a 1 frame por segundo
        receptorStream = canvas.captureStream(1); 
        
        // También añadimos un track de audio silencioso por si el receptor lo espera
        try {
            const audioCtx = new AudioContext();
            const destination = audioCtx.createMediaStreamDestination();
            const silentTrack = destination.stream.getAudioTracks()[0];
            if (silentTrack) receptorStream.addTrack(silentTrack);
        } catch(e) { console.log("No se pudo crear audio silencioso"); }
    }

    // Iniciamos la llamada con nuestro stream (sea real o virtual)
    const call = peer.call(remoteId, receptorStream);

    if (!call) {
        log("Error: No se pudo crear el objeto de llamada.");
        return;
    }

    call.on('stream', (remoteStream) => {
        log("¡¡STREAM RECIBIDO DEL EMISOR!! 🎥");
        const settings = remoteStream.getVideoTracks()[0].getSettings();
        log(`Video recibido a: ${settings.width}x${settings.height}`);
        log(settings);
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log("Error en conexión: " + err));
    
    // Limpieza al cerrar
    call.on('close', () => {
        if (receptorStream) {
            receptorStream.getTracks().forEach(t => t.stop());
        }
    });
});

/*
function mostrarVideo(stream) {
    log("Configurando elemento de video...");
    videoElement.srcObject = stream;
    videoElement.style.transform = "scaleX(1)";
    
    // Obligatorio para navegadores modernos
    videoElement.muted = true; 
    videoElement.setAttribute('autoplay', '');
    videoElement.setAttribute('playsinline', '');
    
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            log("Reproducción iniciada con éxito 🍿");
        }).catch(error => {
            log("Autoplay bloqueado. Haz clic en el video.");
            // Si falla, añadimos un evento para que al tocar la pantalla arranque
            document.body.addEventListener('click', () => videoElement.play(), {once: true});
        });
    }
}*/

// 2. Modifica la función mostrarVideo para que inicie el dibujo
function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.play().then(() => {
        log("Procesando video...");
        requestAnimationFrame(bucleProcesamiento);
    });
}

// 3. Bucle principal de análisis
function bucleProcesamiento() {
    if (videoElement.paused || videoElement.ended) return;

    // Dibujar el video en el canvas
    overlayCtx.drawImage(videoElement, 0, 0, overlayCanvas.width, overlayCanvas.height);

    // Si el detector ya cargó, analizamos el frame
    if (apriltagDetector) {
        const imageData = overlayCtx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // La detección requiere una imagen en escala de grises
        // Algunas versiones de la lib lo hacen interno, otras no. 
        // Esta versión suele aceptar el buffer RGBA directamente:
        const detections = apriltagDetector.detect(imageData.data, overlayCanvas.width, overlayCanvas.height);
        
        dibujarDetecciones(detections);
    }

    requestAnimationFrame(bucleProcesamiento);
}

// 4. Dibujar los recuadros sobre el canvas
function dibujarDetecciones(detections) {
    detections.forEach(det => {
        overlayCtx.strokeStyle = "#00ff00";
        overlayCtx.lineWidth = 4;
        overlayCtx.beginPath();
        
        // Dibujar las 4 esquinas
        overlayCtx.moveTo(det.corners[0].x, det.corners[0].y);
        overlayCtx.lineTo(det.corners[1].x, det.corners[1].y);
        overlayCtx.lineTo(det.corners[2].x, det.corners[2].y);
        overlayCtx.lineTo(det.corners[3].x, det.corners[3].y);
        overlayCtx.closePath();
        overlayCtx.stroke();

        // Dibujar el ID del tag
        overlayCtx.fillStyle = "#ff0000";
        overlayCtx.font = "bold 20px Arial";
        overlayCtx.fillText("ID: " + det.id, det.center.x - 20, det.center.y);
        
        // Log opcional para consola
        // console.log(`Tag detectado: ${det.id}`);
    });
}



function generarQR(id) {
    qrContainer.innerHTML = "";
    const url = `${window.location.origin}${window.location.pathname}?connect=${id}`;
    new QRCode(qrContainer, { text: url, width: 120, height: 120 });
}

function revisarUrlParaConexion() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('connect');
    if (id) remoteIdInput.value = id;
}


//////////////

const btnStealth = document.getElementById('btnStealth');
const blackOverlay = document.getElementById('blackOverlay');

// Función para activar el modo pantalla negra
btnStealth.addEventListener('click', () => {
    if (!localStream) return alert("Primero activa la cámara");
    
    // Entrar en pantalla completa (opcional, pero recomendado)
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
    
    // Mostrar la capa negra
    blackOverlay.style.display = 'block';
    log("Modo ahorro activado. Píxeles apagados.");
});

// Salir del modo pantalla negra con doble clic
blackOverlay.addEventListener('dblclick', () => {
    blackOverlay.style.display = 'none';
    if (document.exitFullscreen) document.exitFullscreen();
    log("Modo ahorro desactivado.");
});