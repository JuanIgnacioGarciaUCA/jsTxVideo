/**
 * jsTxVideo - VERSIÓN ULTRA-ESTABLE
 */

const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

let localStream = null;

// 1. Configuración de Peer con servidores STUN públicos
const peer = new Peer(undefined, {
    debug: 2,
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' }
        ]
    }
});

// Manejo de errores
peer.on('error', (err) => {
    console.error('Error de PeerJS:', err.type);
    alert("Error: " + err.type);
});

peer.on('open', (id) => {
    console.log('Mi ID es:', id);
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
        btnStart.innerText = "CÁMARA OK ✅";
        btnStart.style.background = "#2e7d32";
    } catch (err) {
        alert("Permiso de cámara denegado o no encontrada.");
    }
});

// Responder a llamadas
peer.on('call', (call) => {
    console.log("Recibiendo llamada de:", call.peer);
    // Si no hay stream local, respondemos con un stream vacío pero válido
    call.answer(localStream || new MediaStream());
    
    call.on('stream', (remoteStream) => {
        if (remoteStream.getVideoTracks().length > 0) {
            videoElement.srcObject = remoteStream;
            videoElement.play();
        }
    });
});

// --- RECEPTOR ---
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    
    if (!remoteId) return alert("Introduce el ID del emisor");
    if (remoteId === peer.id) return alert("No puedes llamarte a ti mismo. Usa otro dispositivo.");

    console.log("Iniciando llamada a:", remoteId);

    /**
     * SOLUCIÓN AL ERROR:
     * PeerJS a veces falla si el segundo parámetro es un MediaStream totalmente vacío.
     * Si no tenemos cámara, creamos un "Dummy Stream" con un audio silencioso 
     * para que la conexión WebRTC tenga algo que negociar.
     */
    if (!localStream) {
        // Creamos un audio context para generar un track de silencio
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dst = oscillator.connect(ctx.createMediaStreamDestination());
        oscillator.start();
        const dummyStream = dst.stream;
        
        realizarLlamada(remoteId, dummyStream);
    } else {
        realizarLlamada(remoteId, localStream);
    }
});

function realizarLlamada(id, stream) {
    const call = peer.call(id, stream);
    
    if (!call) {
        console.error("La función peer.call devolvió undefined");
        alert("Error al crear la llamada. Reintenta en 2 segundos.");
        return;
    }

    call.on('stream', (remoteStream) => {
        console.log("¡Stream recibido!");
        videoElement.srcObject = remoteStream;
        videoElement.style.transform = "scaleX(1)";
        videoElement.play();
    });

    call.on('error', (err) => {
        console.error("Error en la comunicación:", err);
    });
}

// --- AUXILIARES ---
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