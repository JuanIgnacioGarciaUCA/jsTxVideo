/**
 * jsTxVideo - VERSIÓN INTEGRADA 2026
 * Funcionalidades: PeerJS (P2P), QR Code, Stealth Mode, AprilTag (tag16h5)
 */

const detectorWorker = new Worker('worker.js');
let detectorReady = false; // El worker nos avisará cuando esté listo

// 2. Escuchar mensajes del Worker
detectorWorker.onmessage = (e) => {
    const msg = e.data;

    switch (msg.type) {
        case 'ready':
            log("✅ Detector AprilTag listo en el Worker");
            detectorReady = true;
            break;
        case 'result':
            // Recibimos las detecciones del worker
            dibujarDetecciones(msg.detections);
            break;
        case 'debug':
            console.log("[Worker Debug]", msg.message);
            break;
        case 'error':
            log("❌ Error en Worker: " + msg.message);
            console.error("❌ Error en Worker: " + msg.message,"msg=", msg);
            break;
        case 'result':
            // Recibimos las detecciones del worker
            dibujarDetecciones(msg.detections);
            break;
        default:
            console.log("[Worker Message] Tipo desconocido: " + msg.type, msg);
            break;
    }
};
/*detectorWorker.onmessage = (e) => {
    const tags = e.data;
    dibujarDetecciones(tags);
};*/


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
const btnConnect    = document.getElementById('btnConnect');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer   = document.getElementById('qrcode');

// ────────────────────────────────────────────────
// 3. VARIABLES GLOBALES
// ────────────────────────────────────────────────
let localStream = null;
let detectorInstance = null;

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
    //myIdDisplay.textContent = id;
    //generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', err => log(`Error PeerJS: ${err.type}`));

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
        //videoElement.srcObject = remoteStream;
        //videoElement.play();
    });

    call.on('error', err => log("Error en conexión: " + err));
});

// ────────────────────────────────────────────────
// 8. PROCESAMIENTO Y DIBUJO (APRILTAG)
// ────────────────────────────────────────────────
function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.muted = true;
    //videoElement.play();
    
    videoElement.onloadedmetadata = () => {
        videoElement.play();
        log("Iniciando análisis de frames...");
        bucleProcesamiento(); // <-- ACTIVAR EL BUCLE AQUÍ
    };
    
}

// 2. BUCLE DE PROCESAMIENTO (RECEPTOR)
function bucleProcesamiento() {
    // Si el video no está listo o el worker no ha cargado el WASM, esperamos
    if (videoElement.paused || videoElement.ended || !detectorReady) {
        requestAnimationFrame(bucleProcesamiento);
        return;
    }

    // Dibujamos el video en el canvas
    overlayCtx.drawImage(videoElement, 0, 0, overlayCanvas.width, overlayCanvas.height);

    // Extraemos los píxeles
    const imageData = overlayCtx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // El worker espera una imagen en escala de grises (8 bits por píxel)
    // Vamos a convertir RGBA a Gris antes de enviar para que el worker vuele
    const grayData = new Uint8Array(overlayCanvas.width * overlayCanvas.height);
    for (let i = 0, j = 0; i < imageData.data.length; i += 4, j++) {
        // Fórmula básica de luminosidad: 0.299R + 0.587G + 0.114B
        grayData[j] = (imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114);
    }

    // ENVIAR AL WORKER
    detectorWorker.postMessage({
        type: 'detect',
        width: overlayCanvas.width,
        height: overlayCanvas.height,
        buffer: grayData.buffer
    }, [grayData.buffer]); // Enviamos el buffer como Transferable para máxima velocidad

    // No llamamos a requestAnimationFrame aquí, 
    // lo ideal es esperar el mensaje de vuelta o limitar los FPS.
    // Para simplificar, lo llamamos con un pequeño delay o directamente:
    setTimeout(bucleProcesamiento, 30); // ~30 FPS
}

function dibujarDetecciones(detections) {
    console.log("Dibujando detecciones:", detections);
    /*
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
    });*/
}


// ────────────────────────────────────────────────
// 9. FUNCIONES AUXILIARES
// ────────────────────────────────────────────────
function revisarUrlParaConexion() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('connect');
    if (id) {
        remoteIdInput.value = id;
        log("ID detectado de URL.");
    }
}

log("app.js cargado ✓");