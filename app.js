/**
 * jsTxVideo - VERSIÓN DE DIAGNÓSTICO
 */

const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

// Creamos un área de log en pantalla para ver qué pasa en el móvil
const logArea = document.createElement('div');
logArea.style = "background: #000; color: #0f0; font-family: monospace; font-size: 10px; padding: 10px; height: 100px; overflow-y: scroll; width: 100%; text-align: left;";
document.body.appendChild(logArea);

function log(msg) {
    logArea.innerHTML += `> ${msg}<br>`;
    logArea.scrollTop = logArea.scrollHeight;
    console.log(msg);
}

let localStream = null;

// Configuración con servidores STUN
const peer = new Peer(undefined, {
    debug: 2,
    config: { 'iceServers': [{ url: 'stun:stun.l.google.com:19302' }] }
});

peer.on('open', (id) => {
    log("Mi ID: " + id);
    myIdDisplay.innerText = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', (err) => log("ERROR PEER: " + err.type));

// --- EMISOR ---
btnStart.addEventListener('click', async () => {
    try {
        log("Solicitando cámara...");
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        videoElement.srcObject = localStream;
        videoElement.play();
        log("Cámara activa ✅");
        btnStart.style.background = "#2e7d32";
    } catch (err) {
        log("Error cámara: " + err);
    }
});

// El EMISOR recibe la llamada
peer.on('call', (call) => {
    log("📞 Llamada entrante de: " + call.peer);
    
    if (localStream) {
        log("Respondiendo con video...");
        call.answer(localStream);
    } else {
        log("¡OJO! No has activado cámara. Respondiendo vacío.");
        call.answer();
    }

    call.on('stream', (remoteStream) => {
        log("Recibiendo stream (bidireccional)...");
        mostrarVideo(remoteStream);
    });
});

// --- RECEPTOR ---
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Falta ID");
    
    log("Llamando a: " + remoteId);
    
    // El receptor llama. IMPORTANTE: Enviamos un stream vacío pero con track para forzar la conexión
    const call = peer.call(remoteId, new MediaStream());

    if (!call) {
        log("Error: No se pudo crear la llamada");
        return;
    }

    call.on('stream', (remoteStream) => {
        log("¡STREAM RECIBIDO DEL EMISOR! 🎥");
        mostrarVideo(remoteStream);
    });

    call.on('error', (err) => log("Error en llamada: " + err));
});

function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.style.transform = "scaleX(1)";
    videoElement.play().catch(e => {
        log("Error autoplay, activando mute...");
        videoElement.muted = true;
        videoElement.play();
    });
}

// --- AUXILIARES ---
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