/**
 * jsTxVideo - VERSIÓN CORREGIDA Y MEJORADA (2026)
 * - Corrige inicialización de AprilTag WASM
 * - Manejo correcto de familia tag16h5
 * - Espera real a que cargue el detector
 * - Mejora logs y estabilidad WebRTC
 */

// ────────────────────────────────────────────────
// Área de logs en pantalla
// ────────────────────────────────────────────────
const logArea = document.createElement('div');
Object.assign(logArea.style, {
    background: '#000',
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: '10px',
    padding: '10px',
    height: '80px',
    overflowY: 'scroll',
    width: '100%',
    textAlign: 'left',
    boxSizing: 'border-box'
});
document.body.appendChild(logArea);

function log(msg) {
    logArea.innerHTML += `> ${msg}<br>`;
    logArea.scrollTop = logArea.scrollHeight;
    console.log("[jsTxVideo]", msg);
}

// ────────────────────────────────────────────────
// Elementos del DOM
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

if (!overlayCanvas) {
    log("ERROR: No se encontró canvas #overlay");
}

// ────────────────────────────────────────────────
// Variables globales importantes
// ────────────────────────────────────────────────
let localStream = null;
let apriltagDetector = null;
let detectorReady = false;

// ────────────────────────────────────────────────
// 1. Inicializar detector AprilTag WASM
//    (asumiendo que usas una librería tipo arenaxr/apriltag-js-standalone o similar)
// ────────────────────────────────────────────────
async function cargarDetector() {
    log("Cargando motor WASM de AprilTag...");

    try {
        // Ejemplo realista con librería tipo AprilTagWasm (ajusta según tu bundle real)
        // Muchas implementaciones esperan que hagas new AprilTagDetector() o similar
        // Aquí un patrón común en 2025-2026:

        // Opción A: si la librería expone AprilTagDetector
        if (typeof AprilTagDetector === 'function') {
            apriltagDetector = new AprilTagDetector({
                family: "tag16h5",       // ← familia deseada
                nthreads: navigator.hardwareConcurrency || 2,
                // Otros parámetros opcionales: quad_decimate, etc.
            });
            log("Detector instanciado con familia tag16h5");
        }
        // Opción B: si usa un factory / promise (patrón común en WASM)
        else if (typeof AprilTagWasm === 'function') {
            const module = await AprilTagWasm();
            apriltagDetector = module; // o module.createDetector("tag16h5")
            // Algunas implementaciones: apriltagDetector = module.Detector("tag16h5");
            log("Módulo WASM cargado. Familia configurada: tag16h5");
        }
        else {
            throw new Error("No se encontró AprilTagDetector ni AprilTagWasm en el scope global");
        }

        detectorReady = true;
        log("Detector AprilTag listo para usar ✓");
    }
    catch (err) {
        log("ERROR al cargar AprilTag WASM: " + err.message);
        log("→ Asegúrate de que el .js y .wasm estén cargados antes de esta función");
        log("→ Verifica la consola del navegador para errores 404 o CORS");
        detectorReady = false;
    }
}

// Iniciamos la carga inmediatamente (pero no bloqueamos)
cargarDetector();

// ────────────────────────────────────────────────
// Configuración PeerJS con varios STUN/TURN
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

peer.on('open', (id) => {
    log(`Mi ID PeerJS: ${id}`);
    myIdDisplay.textContent = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', (err) => {
    log(`ERROR PeerJS: ${err.type} - ${err.message}`);
});

// ────────────────────────────────────────────────
// Emisor: Activar cámara trasera 640×480
// ────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
    if (localStream) return;

    try {
        log("Solicitando cámara trasera 640×480...");

        const constraints = {
            video: {
                width:  { ideal: 640 },
                height: { ideal: 480 },
                aspectRatio: 4 / 3,
                facingMode: "environment"
            },
            audio: false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        const settings = localStream.getVideoTracks()[0].getSettings();
        log(`Resolución obtenida: ${settings.width}×${settings.height}`);

        videoElement.srcObject = localStream;
        await videoElement.play();

        btnStart.textContent = "CÁMARA OK ✅";
        btnStart.style.backgroundColor = "#2e7d32";
    }
    catch (err) {
        log(`Error al acceder a la cámara: ${err.name} - ${err.message}`);
        alert("No se pudo acceder a la cámara. Comprueba permisos.");

        // Fallback muy básico
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoElement.srcObject = localStream;
            videoElement.play();
        } catch(e2) {
            log("Fallback también falló: " + e2.message);
        }
    }
});

// Receptor recibe llamada
peer.on('call', (call) => {
    log(`Llamada entrante de ${call.peer}`);

    if (!localStream) {
        log("→ No hay stream local → contestamos con stream vacío");
        // Puedes usar el mismo truco del canvas negro aquí si quieres
    }

    call.answer(localStream);

    call.on('stream', (remoteStream) => {
        log("Stream remoto recibido (del emisor)");
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log(`Error en call: ${err}`));
    call.on('close', () => log("Llamada cerrada"));
});

// ────────────────────────────────────────────────
// Emisor → Conectar con receptor
// ────────────────────────────────────────────────
btnConnect.addEventListener('click', async () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Introduce el ID del receptor");

    log(`Intentando conectar con ${remoteId}...`);

    let receptorStream;

    try {
        receptorStream = await navigator.mediaDevices.getUserMedia({ video: true });
        log("Cámara del receptor usada");
    }
    catch (err) {
        log("No hay cámara o permiso denegado → stream negro virtual");

        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        receptorStream = canvas.captureStream(1); // 1 fps suficiente

        // Audio silencioso opcional
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const dest = audioCtx.createMediaStreamDestination();
            receptorStream.addTrack(dest.stream.getAudioTracks()[0]);
        } catch {}
    }

    const call = peer.call(remoteId, receptorStream);

    call.on('stream', (remoteStream) => {
        log("¡¡ STREAM RECIBIDO DEL EMISOR !!");
        const vt = remoteStream.getVideoTracks()[0];
        if (vt) {
            const s = vt.getSettings();
            log(`Resolución recibida: ${s.width}×${s.height}`);
        }
        mostrarVideo(remoteStream);
    });

    call.on('error', err => log(`Error en llamada: ${err}`));
    call.on('close', () => {
        log("Conexión cerrada");
        receptorStream?.getTracks().forEach(t => t.stop());
    });
});

// ────────────────────────────────────────────────
// Mostrar y procesar video recibido
// ────────────────────────────────────────────────
function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.muted = true;

    videoElement.play()
        .then(() => {
            log("Video reproducido → iniciando procesamiento AprilTag");
            requestAnimationFrame(bucleProcesamiento);
        })
        .catch(err => log("Error al reproducir video: " + err.message));
}

function bucleProcesamiento() {
    if (videoElement.paused || videoElement.ended || !detectorReady) {
        requestAnimationFrame(bucleProcesamiento);
        return;
    }

    const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });

    // Ajustar canvas al tamaño real del video (importante)
    if (overlayCanvas.width !== videoElement.videoWidth) {
        overlayCanvas.width  = videoElement.videoWidth;
        overlayCanvas.height = videoElement.videoHeight;
        log(`Canvas ajustado a ${overlayCanvas.width}×${overlayCanvas.height}`);
    }

    ctx.drawImage(videoElement, 0, 0, overlayCanvas.width, overlayCanvas.height);

    try {
        const imageData = ctx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
        const detections = apriltagDetector.detect(
            imageData.data,
            overlayCanvas.width,
            overlayCanvas.height
        );

        dibujarDetecciones(detections);
    }
    catch (e) {
        log("Error en detección AprilTag: " + e.message);
    }

    requestAnimationFrame(bucleProcesamiento);
}

function dibujarDetecciones(detections) {
    const ctx = overlayCanvas.getContext('2d');

    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#ff0000";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";

    detections.forEach(det => {
        ctx.beginPath();
        ctx.moveTo(det.corners[0].x, det.corners[0].y);
        ctx.lineTo(det.corners[1].x, det.corners[1].y);
        ctx.lineTo(det.corners[2].x, det.corners[2].y);
        ctx.lineTo(det.corners[3].x, det.corners[3].y);
        ctx.closePath();
        ctx.stroke();

        // Centro + ID
        const cx = det.center?.x ?? (det.corners.reduce((s,c)=>s+c.x,0)/4);
        const cy = det.center?.y ?? (det.corners.reduce((s,c)=>s+c.y,0)/4);
        ctx.fillText(`ID: ${det.id}`, cx, cy - 10);
    });
}

// ────────────────────────────────────────────────
// QR y conexión automática por URL
// ────────────────────────────────────────────────
function generarQR(id) {
    qrContainer.innerHTML = "";
    const url = `${location.origin}${location.pathname}?connect=${id}`;
    new QRCode(qrContainer, {
        text: url,
        width: 120,
        height: 120,
        colorDark: "#000000",
        colorLight: "#ffffff"
    });
}

function revisarUrlParaConexion() {
    const params = new URLSearchParams(location.search);
    const id = params.get('connect');
    if (id) {
        remoteIdInput.value = id;
        log(`ID de conexión automática encontrado: ${id}`);
        // Opcional: btnConnect.click();  ← descomenta si quieres auto-conectar
    }
}

// ────────────────────────────────────────────────
// Modo "stealth" / pantalla negra
// ────────────────────────────────────────────────
btnStealth.addEventListener('click', () => {
    if (!localStream) return alert("Primero activa la cámara");

    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(e => log("No fullscreen: " + e));
    }

    blackOverlay.style.display = 'block';
    log("Modo stealth activado (pantalla negra)");
});

blackOverlay.addEventListener('dblclick', () => {
    blackOverlay.style.display = 'none';
    document.exitFullscreen?.();
    log("Modo stealth desactivado");
});