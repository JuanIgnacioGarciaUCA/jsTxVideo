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
            if (msg.detections.length > 0) {
                // 1. Calculamos distancia y ángulo del primer tag detectado
                const tag = msg.detections[0];
                const dist = calcularDistancia(tag); // Tu función de antes
                const ang  = calcularAngulo(tag);    // Tu función de antes
                // 2. Lógica de control
                decidirMovimiento(dist, ang);
            } else {
                // Si no hay tags, podemos decidir parar los motores
                enviarAlRobot(90, 0, 0, 0, 0);
            }
            break;
        case 'debug':
            console.log("[Worker Debug]", msg.message);
            break;
        case 'error':
            log("❌ Error en Worker: " + msg.message);
            console.error("❌ Error en Worker: " + msg.message,"msg=", msg);
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
    //height: '100px',
    overflowY: 'scroll',
    width: '100%',
    //position: 'fixed',
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
const overlayCanvas1 = document.getElementById('overlay1');
const overlayCtx1    = overlayCanvas1.getContext('2d', { willReadFrequently: true });
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
    log("Asignando stream al elemento de video...");
    videoElement.srcObject = stream;
    videoElement.muted = true; // Evitar feedback de audio
    // Esperamos a que el video tenga dimensiones reales
    videoElement.onloadedmetadata = () => {
        log(`Video recibido: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
        videoElement.play();
        // Ajustamos el tamaño del canvas al tamaño real del video recibido
        overlayCanvas.width = videoElement.videoWidth;
        overlayCanvas.height = videoElement.videoHeight;
        log("Iniciando bucle de procesamiento...");
        bucleProcesamiento();
    };
}

// 2. BUCLE DE PROCESAMIENTO (RECEPTOR)
/**
 * 8. PROCESAMIENTO Y DIBUJO (RECEPTOR)
 */

// Esta función se llama cuando la llamada de PeerJS entrega el stream
function mostrarVideo(stream) {
    log("Asignando stream al elemento de video...");
    videoElement.srcObject = stream;
    videoElement.muted = true; // Evitar feedback de audio
    
    // Esperamos a que el video tenga dimensiones reales
    videoElement.onloadedmetadata = () => {
        log(`Video recibido: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
        videoElement.play();
        
        // Ajustamos el tamaño del canvas al tamaño real del video recibido
        overlayCanvas.width = videoElement.videoWidth;
        overlayCanvas.height = videoElement.videoHeight;
        
        log("Iniciando bucle de procesamiento...");
        bucleProcesamiento();
    };
}

let frameCount = 0;
// Esta función corre continuamente capturando frames
function bucleProcesamiento() {
    // 1. Validaciones previas
    // No procesamos si el video está pausado o si el worker aún no ha dicho "ready"
    if (videoElement.paused || videoElement.ended || !detectorReady) {
        requestAnimationFrame(bucleProcesamiento);
        return;
    }

    // 2. Dibujar el frame actual en el canvas visual
    overlayCtx1.drawImage(videoElement, 0, 0, overlayCanvas1.width, overlayCanvas1.height);

    // 3. Extraer los píxeles (RGBA)
    const imageData = overlayCtx1.getImageData(0, 0, overlayCanvas1.width, overlayCanvas1.height);
    const data = imageData.data;
    const w = overlayCanvas1.width;
    const h = overlayCanvas1.height;

    // 4. CONVERSIÓN A BLANCO Y NEGRO (Grayscale)
    // Creamos un buffer de 1 byte por píxel (Uint8Array)
    const grayData = new Uint8Array(w * h);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        // Fórmula de luminosidad: Y = 0.299R + 0.587G + 0.114B
        const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        grayData[j] = gray;
        imageData.data[i] = gray;
        imageData.data[i + 1] = gray;
        imageData.data[i + 2] = gray;
        imageData.data[i + 3] = 255;
    }
    overlayCtx.putImageData(imageData, 0, 0);

    // 5. ENVÍO AL WORKER
    // Enviamos el mensaje 'detect' con el buffer de grises
    // El segundo parámetro [grayData.buffer] es vital: transfiere la memoria en lugar de copiarla
    detectorWorker.postMessage({
        type: 'detect',
        width: w,
        height: h,
        buffer: grayData.buffer
    }, [grayData.buffer]);

    // --- NUEVO: INDICADOR DE ACTIVIDAD ---
    frameCount++;
    // Dibujamos un pequeño recuadro de fondo para que se vea bien el texto
    overlayCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
    overlayCtx.fillRect(10, 10, 110, 30);
    // Dibujamos el punto parpadeante (parpadea cada 15 frames)
    if (Math.floor(frameCount / 15) % 2 === 0) {
        overlayCtx.fillStyle = "#ff0000"; // Rojo
    } else {
        overlayCtx.fillStyle = "#550000"; // Rojo oscuro
    }
    overlayCtx.beginPath();
    overlayCtx.arc(25, 25, 7, 0, Math.PI * 2);
    overlayCtx.fill();
    // Dibujamos el texto de status
    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.font = "bold 14px monospace";
    overlayCtx.fillText("PROC: " + frameCount, 40, 30);
    // ---------------------------------------

    // 6. CONTROL DE FPS
    // En lugar de requestAnimationFrame puro (60fps), usamos un pequeño delay
    // para no saturar el procesador del móvil/PC, apuntando a unos 20-25 FPS.
    setTimeout(() => {
        requestAnimationFrame(bucleProcesamiento);
    }, 40); 
}
function dibujarDetecciones(detections) {
    //console.log("Dibujando detecciones:", detections);
    const TAG_SIZE_METERS = 0.05; // Tamaño real del tag36h11 en metros (5 cm)
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;  
    const focalLength = w * 0.875; // Aproximación común para cámaras de smartphones  
    detections.forEach(det => {
        // 1. Calcular el lado del tag en píxeles (promedio de los 4 lados para precisión)
        const ladoTop = Math.hypot(det.corners[0].x - det.corners[1].x, det.corners[0].y - det.corners[1].y);
        const ladoRight = Math.hypot(det.corners[1].x - det.corners[2].x, det.corners[1].y - det.corners[2].y);
        const ladoPixeles = (ladoTop + ladoRight) / 2;

        // 2. Calcular Distancia y Ángulo
        const distancia = calcularDistancia(TAG_SIZE_METERS, ladoPixeles, focalLength);
        const angulo = calcularAngulo(det.center.x, w, focalLength);

        // 3. Dibujar resultados en pantalla
        overlayCtx.fillStyle = "yellow";
        overlayCtx.font = "16px Arial";
        overlayCtx.fillText(`ID: ${det.id}`, det.center.x, det.center.y - 40);
        overlayCtx.fillText(`Dist: ${distancia.toFixed(2)} m`, det.center.x, det.center.y - 20);
        overlayCtx.fillText(`Ang: ${angulo.toFixed(1)}°`, det.center.x, det.center.y);

        // Dibujar borde verde (corners es un array de 4 puntos {x,y})
        console.log("Dibujando detección ID:", det.id, "con esquinas:", det.corners);
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
function revisarUrlParaConexion() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('connect');
    if (id) {
        remoteIdInput.value = id;
        log("ID detectado de URL.");
    }
}

function calcularAngulo(centerX, imageWidth, focalLength) {
    // Distancia en píxeles desde el centro de la imagen
    const dx = centerX - (imageWidth / 2);
    
    // Ángulo en radianes usando arcotangente
    const anguloRadianes = Math.atan2(dx, focalLength);
    
    // Convertir a grados
    return anguloRadianes * (180 / Math.PI);
}

function calcularDistancia(ladoRealMeters, ladoPixeles, focalLength) {
    if (ladoPixeles === 0) return 0;
    // Fórmula: Distancia = (Lado Real * Distancia Focal) / Lado en Píxeles
    return (ladoRealMeters * focalLength) / ladoPixeles;
}


//////////////////////////////////////
// Conexión con el robot (WebSocket)
//////////////////////////////////////

//const socket = new WebSocket('ws://192.168.1.37:81');
const socket = new WebSocket('ws://robot.local:81');


socket.onopen = (event) => {
    log("✅ Conectado al Robot con éxito");
    // Aquí puedes cambiar el color de un botón o activar el control
};

// 2. ERROR: Se disparará si la IP es incorrecta o el puerto está cerrado
socket.onerror = (error) => {
    log("❌ Error de conexión: Asegúrate de que la IP sea correcta.");
};

// 3. CIERRE: Se disparará si el robot se apaga o te alejas del WiFi
socket.onclose = (event) => {
    log("⚠️ Conexión cerrada con el robot.");
};


// Escuchar al Worker
/*
detectorWorker.onmessage = (e) => {
    if (e.data.type === 'result') {
        const detections = e.data.detections;
        
        if (detections.length > 0) {
            // 1. Calculamos distancia y ángulo del primer tag detectado
            const tag = detections[0];
            const dist = calcularDistancia(tag); // Tu función de antes
            const ang  = calcularAngulo(tag);    // Tu función de antes
            
            // 2. Lógica de control
            decidirMovimiento(dist, ang);
        } else {
            // Si no hay tags, podemos decidir parar los motores
            enviarAlRobot(90, 0, 0, 0, 0);
        }
    }
};*/

function decidirMovimiento(distancia, angulo) {
    let s = 90, m1f = 0, m1b = 0, m2f = 0, m2b = 0;

    // Lógica simple: si está a más de 0.6m, avanzar
    if (distancia > 0.6) {
        m1f = 150; m2f = 150;
        
        // Corregir dirección según ángulo
        if (angulo < -10) { m1f = 100; m2f = 180; } // Girar izquierda
        if (angulo > 10)  { m1f = 180; m2f = 100; } // Girar derecha
    }

    enviarAlRobot(s, m1f, m1b, m2f, m2b);
}

function enviarAlRobot(s, m1f, m1b, m2f, m2b) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(`${s},${m1f},${m1b},${m2f},${m2b}\n`);
    }
}

////////


log("app.js cargado ✓");