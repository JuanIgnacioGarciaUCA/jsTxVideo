/**
 * jsTxVideo - Versión Estable
 */

const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

let localStream = null;

// 1. Inicializar PeerJS con servidores STUN de Google
const peer = new Peer({
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' }
        ],
        'sdpSemantics': 'unified-plan'
    }
});

// Manejo de errores de conexión
peer.on('error', (err) => {
    console.error('Error tipo:', err.type);
    if (err.type === 'peer-unavailable') {
        alert('El ID del emisor no existe o se ha desconectado.');
    } else if (err.type === 'network') {
        alert('Error de red. Revisa tu conexión.');
    } else {
        alert('Error: ' + err.type);
    }
});

// Cuando mi ID está listo
peer.on('open', (id) => {
    console.log('Mi ID es:', id);
    myIdDisplay.innerText = id;
    generarQR(id);
    revisarUrlParaConexion();
});

// --- EMISOR (El que tiene la cámara) ---
btnStart.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        videoElement.srcObject = localStream;
        videoElement.play();
        btnStart.innerText = "CÁMARA TRANSMITIENDO ✅";
        btnStart.style.background = "#2e7d32";
    } catch (err) {
        alert("Error de cámara: " + err);
    }
});

// El emisor recibe la llamada y responde
peer.on('call', (call) => {
    console.log("Recibiendo llamada de:", call.peer);
    
    // Si no hemos activado la cámara, avisamos pero contestamos igual 
    // para establecer el canal de datos.
    if (!localStream) {
        console.warn("Respondiendo sin video local...");
    }
    
    call.answer(localStream); // Enviamos el stream (sea null o video)

    call.on('stream', (remoteStream) => {
        mostrarVideo(remoteStream);
    });
});

// --- RECEPTOR (El que ve) ---
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    
    if (!remoteId) return alert("Introduce el ID");
    if (!peer.id) return alert("Aún no tienes un ID asignado. Espera un segundo.");

    console.log("Intentando llamar a:", remoteId);
    
    /**
     * IMPORTANTE: Para evitar el error "No se pudo crear la llamada",
     * pasamos un stream vacío si no tenemos cámara.
     */
    const dummyStream = localStream || new MediaStream();
    const call = peer.call(remoteId, dummyStream);

    if (!call) {
        alert("Error crítico: No se pudo crear el objeto de llamada.");
        return;
    }

    call.on('stream', (remoteStream) => {
        console.log("¡STREAM RECIBIDO!");
        mostrarVideo(remoteStream);
    });

    // Si a los 10 segundos no hay video, avisar
    setTimeout(() => {
        if (!videoElement.srcObject) {
            console.log("No se recibe video. ¿Ha pulsado el emisor el botón verde?");
        }
    }, 10000);
});

function mostrarVideo(stream) {
    // Solo asignamos si el stream tiene tracks de video
    if (stream.getVideoTracks().length > 0) {
        videoElement.srcObject = stream;
        videoElement.style.transform = "scaleX(1)";
        videoElement.play().catch(e => {
            videoElement.muted = true;
            videoElement.play();
        });
    }
}

function generarQR(id) {
    qrContainer.innerHTML = "";
    const urlConexion = `${window.location.origin}${window.location.pathname}?connect=${id}`;
    new QRCode(qrContainer, { text: urlConexion, width: 150, height: 150 });
}

function revisarUrlParaConexion() {
    const params = new URLSearchParams(window.location.search);
    const idParaConectar = params.get('connect');
    if (idParaConectar) remoteIdInput.value = idParaConectar;
}