const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

let localStream = null;

// CONFIGURACIÓN ICE: Ayuda a conectar a través de firewalls y routers
const peer = new Peer({
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' }
        ]
    }
});

// Ver errores globales de Peer
peer.on('error', (err) => {
    console.error('Error en PeerJS:', err.type);
    alert('Error de conexión: ' + err.type);
});

peer.on('open', (id) => {
    myIdDisplay.innerText = id;
    generarQR(id);
    revisarUrlParaConexion();
});

// --- EMISOR ---
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
        alert("Error al abrir cámara: " + err);
    }
});

// Respuesta del emisor
peer.on('call', (call) => {
    console.log("Recibiendo llamada... respondiendo con stream:", !!localStream);
    
    // Si el emisor no ha activado la cámara, enviamos null o nada
    call.answer(localStream); 

    call.on('stream', (remoteStream) => {
        mostrarVideo(remoteStream);
    });
});

// --- RECEPTOR ---
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Introduce el ID del emisor");

    console.log("Iniciando llamada a:", remoteId);
    
    // IMPORTANTE: Si no tenemos cámara propia, no pasamos segundo argumento
    const call = localStream ? peer.call(remoteId, localStream) : peer.call(remoteId);

    if (!call) {
        console.error("No se pudo crear la llamada");
        return;
    }

    call.on('stream', (remoteStream) => {
        console.log("¡STREAM RECIBIDO!");
        mostrarVideo(remoteStream);
    });

    // Detectar si la conexión falló
    setTimeout(() => {
        if (!videoElement.srcObject) {
            console.warn("La conexión tarda demasiado... posible bloqueo de Firewall.");
        }
    }, 5000);
});

function mostrarVideo(stream) {
    videoElement.srcObject = stream;
    videoElement.style.transform = "scaleX(1)";
    videoElement.onloadedmetadata = () => {
        videoElement.play().catch(e => {
            console.log("Play bloqueado, intentando mute...");
            videoElement.muted = true;
            videoElement.play();
        });
    };
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