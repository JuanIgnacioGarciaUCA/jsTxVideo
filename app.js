/**
 * jsTxVideo - VERSIÓN FINAL CORREGIDA 2026
 * - Usa arenaxr/apriltag-js-standalone (familia tag16h5)
 * - WebRTC con PeerJS + stream fallback negro
 * - Modo stealth (pantalla negra)
 */

// ────────────────────────────────────────────────
// Logs en pantalla
// ────────────────────────────────────────────────
const logArea = document.createElement('div');
Object.assign(logArea.style, {
    background: '#000',
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: '10px',
    padding: '10px',
    height: '100px',
    overflowY: 'scroll',
    width: '100%',
    textAlign: 'left',
    boxSizing: 'border-box',
    position: 'fixed',
    bottom: '0',
    left: '0',
    zIndex: '9999'
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
const overlayCanvas = document.getElementById('overlay');
const videoElement  = document.getElementById('webcam');
const btnStart      = document.getElementById('btnStart');
const btnConnect    = document.getElementById('btnConnect');
const myIdDisplay   = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer   = document.getElementById('qrcode');
const btnStealth    = document.getElementById('btnStealth');
const blackOverlay  = document.getElementById('blackOverlay');

const overlayCtx = overlayCanvas?.getContext('2d', { willReadFrequently: true });

// ────────────────────────────────────────────────
// Variables globales
// ────────────────────────────────────────────────
let localStream = null;
let apriltagDetector = null;
let detectorReady = false;

// ────────────────────────────────────────────────
// 1. Cargar detector AprilTag (arenaxr/apriltag-js-standalone)
// ────────────────────────────────────────────────
async function cargarDetector() {
    log("Esperando inicialización de apriltag_wasm.js...");

    // Pequeña espera para que el módulo WASM se cargue
    await new Promise(r => setTimeout(r, 500));

    if (typeof apriltag === 'undefined' || !apriltag?.Detector) {
        log("ERROR CRÍTICO: No se encontró 'apriltag' o 'apriltag.Detector'");
        log("→ Asegúrate de haber incluido:");
        log("→ <script src='https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@latest/dist/apriltag_wasm.js'></script>");
        log("→ <script src='https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@latest/dist/apriltag.js'></script>");
        return;
    }

    try {
        log("Instanciando detector con tag16h5...");
        apriltagDetector = new apriltag.Detector({
            family: "tag16h5",
            nthreads: navigator.hardwareConcurrency || 2,
            // Puedes ajustar estos si quieres más precisión / velocidad
            // quad_decimate: 1.0,
            // refine_decode: true,
        });

        detectorReady = true;
        log("Detector AprilTag cargado correctamente ✓ familia: tag16h5");
    } catch (err) {
        log("Error al crear Detector: " + (err.message || err));
        log("→ Revisa la pestaña Network (F12) → busca .wasm");
    }
}

cargarDetector();  // Iniciamos carga ASAP

// ────────────────────────────────────────────────
// PeerJS configuración (STUN + TURN)
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

peer.on('open', (id) => {
    log(`ID PeerJS: ${id}`);
    myIdDisplay.textContent = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', err => log(`PeerJS error: ${err.type} – ${err.message}`));

// ────────────────────────────────────────────────
// Emisor: Activar cámara
// ────────────────────────────────────────────────
btnStart?.addEventListener('click', async () => {
    if (localStream) return;

    try {
        log("Solicitando cámara trasera 640×480...");
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                aspectRatio: 4 / 3,
                facingMode: "environment"
            },
            audio: false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        const settings = localStream.getVideoTracks()[0].getSettings();
        log(`Resolución real: ${settings.width}×${settings.height}`);

        videoElement.srcObject = localStream;
        await videoElement.play();

        btnStart.textContent = "CÁMARA OK ✅";
        btnStart.style.backgroundColor = "#2e7d32";
    } catch (err) {
        log(`Error cámara: ${err.name} – ${err.message}`);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoElement.srcObject = localStream;
            videoElement.play();
        } catch (e2) {
            log("Fallback falló: " + e2.message);
        }
    }
});

// Receptor: recibe llamada
peer.on('call', (call) => {
    log(`Llamada entrante de ${call.peer}`);
    call.answer(localStream || null);  // Si no hay cámara, envía null o stream vacío

    call.on('stream', (remoteStream) => {
        log("Stream recibido del emisor → procesando");
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log(`Call error: ${err}`));
    call.on('close', () => log("Llamada cerrada"));
});

// ────────────────────────────────────────────────
// Conectar como emisor
// ────────────────────────────────────────────────
btnConnect?.addEventListener('click', async () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Falta ID del receptor");

    log(`Conectando a ${remoteId}...`);

    let emisorStream;

    try {
        emisorStream = await navigator.mediaDevices.getUserMedia({ video: true });
        log("Usando cámara local como stream");
    } catch {
        log("Sin cámara → creando stream negro virtual");
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 640, 480);
        emisorStream = canvas.captureStream(1);

        // Audio silencioso opcional
        try {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            const dest = ac.createMediaStreamDestination();
            emisorStream.addTrack(dest.stream.getAudioTracks()[0]);
        } catch {}
    }

    const call = peer.call(remoteId, emisorStream);

    call.on('stream', (remoteStream) => {
        log("¡¡ STREAM DEL EMISOR RECIBIDO !!");
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log(`Error llamada: ${err}`));
    call.on('close', () => {
        log("Conexión cerrada");
        emisorStream?.getTracks().forEach(t => t.stop());
    });
});

// ────────────────────────────────────────────────
// Mostrar y procesar video
// ────────────────────────────────────────────────
function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.muted = true;

    videoElement.play()
        .then(() => {
            log("Video en reproducción → iniciando detección AprilTag");
            requestAnimationFrame(bucleProcesamiento);
        })
        .catch(e => log("Error play: " + e.message));
}

function bucleProcesamiento() {
    if (videoElement.paused || videoElement.ended || !detectorReady || !overlayCtx) {
        requestAnimationFrame(bucleProcesamiento);
        return;
    }

    // Ajustar tamaño canvas al video real
    if (overlayCanvas.width !== videoElement.videoWidth) {
        overlayCanvas.width = videoElement.videoWidth;
        overlayCanvas.height = videoElement.videoHeight;
        log(`Canvas ajustado: ${overlayCanvas.width}×${overlayCanvas.height}`);
    }

    overlayCtx.drawImage(videoElement, 0, 0, overlayCanvas.width, overlayCanvas.height);

    try {
        const imageData = overlayCtx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
        const detections = apriltagDetector.detect(imageData);  // ← API correcta de arenaxr

        dibujarDetecciones(detections);
    } catch (e) {
        log("Error detección: " + e.message);
    }

    requestAnimationFrame(bucleProcesamiento);
}

function dibujarDetecciones(detections) {
    detections.forEach(det => {
        overlayCtx.strokeStyle = "#00ff00";
        overlayCtx.lineWidth = 4;
        overlayCtx.beginPath();
        overlayCtx.moveTo(det.corners[0].x, det.corners[0].y);
        overlayCtx.lineTo(det.corners[1].x, det.corners[1].y);
        overlayCtx.lineTo(det.corners[2].x, det.corners[2].y);
        overlayCtx.lineTo(det.corners[3].x, det.corners[3].y);
        overlayCtx.closePath();
        overlayCtx.stroke();

        const cx = (det.corners.reduce((s, c) => s + c.x, 0) / 4);
        const cy = (det.corners.reduce((s, c) => s + c.y, 0) / 4);
        overlayCtx.fillStyle = "#ff0000";
        overlayCtx.font = "bold 24px Arial";
        overlayCtx.textAlign = "center";
        overlayCtx.fillText(`ID: ${det.id}`, cx, cy - 15);
    });
}

// ────────────────────────────────────────────────
// QR y auto-conexión por URL
// ────────────────────────────────────────────────
function generarQR(id) {
    qrContainer.innerHTML = "";
    const url = `${location.origin}${location.pathname}?connect=${id}`;
    new QRCode(qrContainer, { text: url, width: 140, height: 140 });
}

function revisarUrlParaConexion() {
    const params = new URLSearchParams(location.search);
    const id = params.get('connect');
    if (id) {
        remoteIdInput.value = id;
        log(`Auto-carga ID desde URL: ${id}`);
        // btnConnect.click();  // descomenta si quieres conectar automáticamente
    }
}

// ────────────────────────────────────────────────
// Modo stealth (pantalla negra)
// ────────────────────────────────────────────────
btnStealth?.addEventListener('click', () => {
    if (!localStream) return alert("Activa la cámara primero");

    document.documentElement.requestFullscreen?.().catch(e => log("Fullscreen error: " + e));
    blackOverlay.style.display = 'block';
    log("Modo stealth ON – pantalla negra");
});

blackOverlay?.addEventListener('dblclick', () => {
    blackOverlay.style.display = 'none';
    document.exitFullscreen?.();
    log("Modo stealth OFF");
});

log("jsTxVideo cargado – espera a que el detector WASM termine de inicializarse...");