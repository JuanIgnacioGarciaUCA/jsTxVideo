/**
 * jsTxVideo - VERSIÓN CORREGIDA para arenaxr/apriltag-js-standalone
 * Familia: tag36h11 (no se puede cambiar sin recompilar WASM)
 */

// ────────────────────────────────────────────────
// Logs
// ────────────────────────────────────────────────
const logArea = document.createElement('div');
Object.assign(logArea.style, {
    background: '#000',
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '8px',
    height: '90px',
    overflowY: 'scroll',
    width: '100%',
    position: 'fixed',
    bottom: '0',
    left: '0',
    zIndex: '9999',
    boxSizing: 'border-box'
});
document.body.appendChild(logArea);

function log(msg) {
    logArea.innerHTML += `> ${msg}<br>`;
    logArea.scrollTop = logArea.scrollHeight;
    console.log("[jsTxVideo]", msg);
}

// ────────────────────────────────────────────────
// Elementos DOM
// ────────────────────────────────────────────────
const videoElement  = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const overlayCtx    = overlayCanvas?.getContext('2d', { willReadFrequently: true });
const btnStart      = document.getElementById('btnStart');
const btnConnect    = document.getElementById('btnConnect');
const myIdDisplay   = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer   = document.getElementById('qrcode');
const btnStealth    = document.getElementById('btnStealth');
const blackOverlay  = document.getElementById('blackOverlay');

// ────────────────────────────────────────────────
// Variables globales
// ────────────────────────────────────────────────
let localStream = null;
let apriltag = null;
let detectorReady = false;

// ────────────────────────────────────────────────
// 1. Cargar detector AprilTag
// ────────────────────────────────────────────────
function cargarDetector() {
    if (typeof Apriltag !== 'function') {
        log("ERROR: No se encontró la función global 'Apriltag'");
        log("→ Verifica que apriltag_wasm.js y apriltag.js se cargaron correctamente");
        log("→ Revisa pestaña Network (F12) por errores 404 o CORS en .wasm");
        return;
    }

    log("Inicializando detector AprilTag (familia tag36h11)...");

    apriltag = Apriltag(() => {
        log("¡Detector AprilTag listo! ✓ (familia: tag36h11)");
        detectorReady = true;

        // Opcional: configurar algunos parámetros
        // apriltag.set_max_detections(10);
        // apriltag.set_return_pose(1);
    });
}

cargarDetector();  // Lanzar inmediatamente

// ────────────────────────────────────────────────
// PeerJS
// ────────────────────────────────────────────────
const peer = new Peer(undefined, {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.stunprotocol.org' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    }
});

peer.on('open', id => {
    log(`Mi ID: ${id}`);
    myIdDisplay.textContent = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', err => log(`PeerJS error: ${err.type} — ${err.message}`));

// ────────────────────────────────────────────────
// Emisor: Activar cámara
// ────────────────────────────────────────────────
btnStart?.addEventListener('click', async () => {
    try {
        log("Solicitando cámara trasera...");
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });

        localStream = stream;
        videoElement.srcObject = stream;
        await videoElement.play();

        const settings = stream.getVideoTracks()[0].getSettings();
        log(`Resolución: ${settings.width}×${settings.height}`);

        btnStart.textContent = "CÁMARA ACTIVADA";
        btnStart.style.backgroundColor = "#4CAF50";
    } catch (err) {
        log("Error al obtener cámara: " + err.message);
    }
});

// ────────────────────────────────────────────────
// Receptor: recibir llamada
// ────────────────────────────────────────────────
peer.on('call', call => {
    log(`Llamada entrante de ${call.peer}`);
    call.answer(localStream);  // puede ser null si no hay cámara local

    call.on('stream', remoteStream => {
        log("Stream remoto recibido → mostrando + procesando");
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log("Error en call: " + err));
});

// ────────────────────────────────────────────────
// Conectar como receptor → llamar al emisor
// ────────────────────────────────────────────────
btnConnect?.addEventListener('click', async () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Introduce ID del emisor");

    log(`Llamando a ${remoteId}...`);

    let localVideoStream;
    try {
        localVideoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {
        // Fallback: canvas negro
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 640, 480);
        localVideoStream = canvas.captureStream(1);
    }

    const call = peer.call(remoteId, localVideoStream);

    call.on('stream', remoteStream => {
        log("¡Stream del emisor recibido!");
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log("Error en llamada: " + err));
    call.on('close', () => localVideoStream?.getTracks().forEach(t => t.stop()));
});

// ────────────────────────────────────────────────
// Procesamiento de video + AprilTag
// ────────────────────────────────────────────────
function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.play()
        .then(() => {
            log("Video reproduciéndose → iniciando bucle de detección");
            requestAnimationFrame(bucleProcesamiento);
        })
        .catch(e => log("Error al reproducir: " + e.message));
}

function bucleProcesamiento() {
    if (videoElement.paused || videoElement.ended || !detectorReady || !overlayCtx) {
        requestAnimationFrame(bucleProcesamiento);
        return;
    }

    // Ajustar canvas al tamaño real del video
    const w = videoElement.videoWidth;
    const h = videoElement.videoHeight;
    if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
        overlayCanvas.width = w;
        overlayCanvas.height = h;
    }

    overlayCtx.drawImage(videoElement, 0, 0, w, h);

    try {
        const imageData = overlayCtx.getImageData(0, 0, w, h);
        const rgba = imageData.data;

        // Convertir RGBA → Grayscale (promedio simple)
        const gray = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
            const r = rgba[i], g = rgba[i+1], b = rgba[i+2];
            gray[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b); // luminancia
        }

        // ¡Detectar! (espera promise si es async en algunas versiones)
        const detections = apriltag.detect(gray, w, h);

        overlayCtx.strokeStyle = "#0f0";
        overlayCtx.lineWidth = 3;

        detections.forEach(det => {
            const corners = det.corners;
            overlayCtx.beginPath();
            overlayCtx.moveTo(corners[0].x, corners[0].y);
            overlayCtx.lineTo(corners[1].x, corners[1].y);
            overlayCtx.lineTo(corners[2].x, corners[2].y);
            overlayCtx.lineTo(corners[3].x, corners[3].y);
            overlayCtx.closePath();
            overlayCtx.stroke();

            const cx = det.center?.x ?? (corners.reduce((s,c)=>s+c.x,0)/4);
            const cy = det.center?.y ?? (corners.reduce((s,c)=>s+c.y,0)/4);

            overlayCtx.fillStyle = "#f00";
            overlayCtx.font = "bold 20px Arial";
            overlayCtx.textAlign = "center";
            overlayCtx.fillText(`ID: ${det.id}`, cx, cy - 10);
        });
    } catch (e) {
        log("Error en detección: " + (e.message || e));
    }

    requestAnimationFrame(bucleProcesamiento);
}

// ────────────────────────────────────────────────
// QR y auto-carga desde URL
// ────────────────────────────────────────────────
function generarQR(id) {
    qrContainer.innerHTML = '';
    const url = `${location.origin}${location.pathname}?connect=${id}`;
    new QRCode(qrContainer, {
        text: url,
        width: 140,
        height: 140
    });
}

function revisarUrlParaConexion() {
    const params = new URLSearchParams(location.search);
    const connectId = params.get('connect');
    if (connectId) {
        remoteIdInput.value = connectId;
        log(`ID cargado desde URL: ${connectId}`);
        // btnConnect.click(); // descomenta para auto-conectar
    }
}

// ────────────────────────────────────────────────
// Modo ahorro (pantalla negra)
// ────────────────────────────────────────────────
btnStealth?.addEventListener('click', () => {
    if (!localStream) return alert("Activa la cámara primero");
    document.documentElement.requestFullscreen?.();
    blackOverlay.style.display = 'block';
    log("Modo ahorro activado");
});

blackOverlay?.addEventListener('dblclick', () => {
    blackOverlay.style.display = 'none';
    document.exitFullscreen?.();
    log("Modo ahorro desactivado");
});

log("app.js cargado → esperando inicialización del detector WASM...");