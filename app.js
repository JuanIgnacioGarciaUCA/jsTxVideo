/**
 * jsTxVideo - VERSIÓN INTEGRADA 2026
 * Funcionalidades: PeerJS (P2P), QR Code, Stealth Mode, AprilTag (tag16h5)
 */

// ────────────────────────────────────────────────
// 1. SISTEMA DE LOGS EN PANTALLA
// ────────────────────────────────────────────────
const logArea = document.createElement('div');
Object.assign(logArea.style, {
    background: 'rgba(0, 0, 0, 0.8)',
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '10px',
    height: '100px',
    overflowY: 'scroll',
    width: '100%',
    position: 'fixed',
    bottom: '0',
    left: '0',
    zIndex: '10001',
    boxSizing: 'border-box',
    pointerEvents: 'none' // Para que no bloquee clics
});

document.body.appendChild(logArea);

function log(msg) {
    const now = new Date().toLocaleTimeString();
    logArea.innerHTML += `[${now}] ${msg}<br>`;
    logArea.scrollTop = logArea.scrollHeight;
    console.log("[jsTxVideo]", msg);
}

// ────────────────────────────────────────────────
// 2. REFERENCIAS DOM
// ────────────────────────────────────────────────
const videoElement  = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const overlayCtx    = overlayCanvas.getContext('2d', { willReadFrequently: true });
const btnStart      = document.getElementById('btnStart');
const btnConnect    = document.getElementById('btnConnect');
const myIdDisplay   = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer   = document.getElementById('qrcode');
const btnStealth    = document.getElementById('btnStealth');
const blackOverlay  = document.getElementById('blackOverlay');

// ────────────────────────────────────────────────
// 3. VARIABLES GLOBALES
// ────────────────────────────────────────────────
let localStream = null;
let detectorInstance = null;
let detectorReady = false;

// ────────────────────────────────────────────────
// 4. INICIALIZACIÓN DEL DETECTOR APRILTAG
// ────────────────────────────────────────────────

/**
 * jsTxVideo - Detección 36h11 Optimizada
 */


// 1. CARGA DEL DETECTOR
async function cargarDetector() {
    log("Iniciando motor WASM de AprilTag...");

    // Esta librería define 'window.AprilTag'
    //const Constructor = window.AprilTag;
    const apriltagModule = await AprilTagWasm();
    const Constructor = new apriltagModule.AprilTagDetector();
    Constructor.addFamily("tag16h5");


    if (!Constructor) {
        log("Esperando script de red... (Reintentando)");
        setTimeout(cargarDetector, 1000);
        return;
    }

    try {
        // Inicializamos. Esta versión busca el .wasm automáticamente 
        // en la misma ruta de donde bajó el .js
        detectorInstance = new Constructor(() => {
            log("¡Motor AprilTag 36h11 Cargado! ✅");
            detectorReady = true;
            
            // Configuraciones de rendimiento
            // detectorInstance.set_decimate(2.0); // Aumenta si el PC es lento
        });
    } catch (err) {
        log("Error al instanciar detector: " + err);
    }
}

cargarDetector();



// ────────────────────────────────────────────────
// 5. CONFIGURACIÓN PEERJS (P2P)
// ────────────────────────────────────────────────
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

peer.on('open', id => {
    log(`Mi ID: ${id}`);
    myIdDisplay.textContent = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', err => log(`Error PeerJS: ${err.type}`));

// ────────────────────────────────────────────────
// 6. LÓGICA EMISOR (EL MÓVIL)
// ────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
    try {
        log("Abriendo cámara trasera (640x480)...");
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        localStream = stream;
        videoElement.srcObject = stream;
        videoElement.play();

        // Wake Lock para evitar que se apague la pantalla
        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
            log("WakeLock activo 💡");
        }

        btnStart.textContent = "CÁMARA ACTIVADA ✅";
        btnStart.style.backgroundColor = "#2e7d32";
    } catch (err) {
        log("Error cámara: " + err.message);
    }
});

// El emisor recibe la llamada
peer.on('call', call => {
    log("📞 Llamada entrante...");
    call.answer(localStream); // Responde con el video (si existe)

    call.on('stream', remoteStream => {
        // En caso de que el receptor también envíe video
        mostrarVideo(remoteStream);
    });
});

// ────────────────────────────────────────────────
// 7. LÓGICA RECEPTOR (EL PC)
// ────────────────────────────────────────────────
btnConnect.addEventListener('click', async () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Introduce el ID del móvil");

    log(`Llamando a ${remoteId}...`);

    let receptorStream;
    try {
        // Intentamos usar cámara propia, si no, creamos un stream negro
        receptorStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
        log("PC sin cámara. Creando stream virtual...");
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "black";
        ctx.fillRect(0,0,640,480);
        receptorStream = canvas.captureStream(1);
    }

    const call = peer.call(remoteId, receptorStream);

    call.on('stream', remoteStream => {
        log("¡Video recibido del emisor!");
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log("Error en conexión: " + err));
});

// ────────────────────────────────────────────────
// 8. PROCESAMIENTO Y DIBUJO (APRILTAG)
// ────────────────────────────────────────────────
function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.muted = true;
    
    videoElement.onloadedmetadata = () => {
        videoElement.play();
        log("Iniciando análisis de frames...");
        requestAnimationFrame(bucleProcesamiento);
    };
}
// 2. BUCLE DE PROCESAMIENTO (RECEPTOR)
function bucleProcesamiento() {
    if (videoElement.paused || videoElement.ended || !detectorReady) {
        requestAnimationFrame(bucleProcesamiento);
        return;
    }

    // Dibujamos el video en el canvas para obtener los píxeles
    overlayCtx.drawImage(videoElement, 0, 0, overlayCanvas.width, overlayCanvas.height);

    if (detectorInstance) {
        const imageData = overlayCtx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // Esta librería espera los datos RGBA y las dimensiones
        const detections = detectorInstance.detect(
            imageData.data, 
            overlayCanvas.width, 
            overlayCanvas.height
        );

        if (detections && detections.length > 0) {
            dibujarDetecciones(detections);
        }
    }

    requestAnimationFrame(bucleProcesamiento);
}

function dibujarDetecciones(detections) {
    detections.forEach(det => {
        // Dibujar borde verde (corners es un array de 4 puntos {x,y})
        overlayCtx.strokeStyle = "#00ff00";
        overlayCtx.lineWidth = 4;
        overlayCtx.beginPath();
        overlayCtx.moveTo(det.corners[0].x, det.corners[0].y);
        overlayCtx.lineTo(det.corners[1].x, det.corners[1].y);
        overlayCtx.lineTo(det.corners[2].x, det.corners[2].y);
        overlayCtx.lineTo(det.corners[3].x, det.corners[3].y);
        overlayCtx.closePath();
        overlayCtx.stroke();

        // Dibujar ID
        overlayCtx.fillStyle = "#ff0000";
        overlayCtx.font = "bold 20px Arial";
        // det.center tiene {x,y}
        overlayCtx.fillText("ID: " + det.id, det.center.x - 20, det.center.y);
    });
}


// ────────────────────────────────────────────────
// 9. FUNCIONES AUXILIARES
// ────────────────────────────────────────────────
function generarQR(id) {
    qrContainer.innerHTML = "";
    const url = `${window.location.origin}${window.location.pathname}?connect=${id}`;
    new QRCode(qrContainer, { text: url, width: 150, height: 150 });
}

function revisarUrlParaConexion() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('connect');
    if (id) {
        remoteIdInput.value = id;
        log("ID detectado de URL.");
    }
}

// ────────────────────────────────────────────────
// 10. MODO AHORRO (PANTALLA NEGRA)
// ────────────────────────────────────────────────
btnStealth.addEventListener('click', () => {
    if (!localStream) return alert("Activa la cámara primero");
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
    blackOverlay.style.display = 'block';
    log("Modo ahorro: ON");
});

blackOverlay.addEventListener('click', () => {
    blackOverlay.style.display = 'none';
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
    log("Modo ahorro: OFF");
});

log("app.js cargado ✓");