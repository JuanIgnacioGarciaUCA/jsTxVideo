/**
 * jsTxVideo - Lógica de flujo:
 * 1. Móvil (Emisor): Pulsa "Activar Cámara" (prepara el video).
 * 2. PC (Receptor): Pulsa "Ver Video Remoto" (solicita el video).
 */

const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

let localStream = null; // Aquí guardaremos el video del emisor
const peer = new Peer(); 

// --- GESTIÓN DE ID Y QR ---
peer.on('open', (id) => {
    myIdDisplay.innerText = id;
    generarQR(id);
    revisarUrlParaConexion();
});

// --- LÓGICA DEL EMISOR (El que tiene la cámara) ---
btnStart.addEventListener('click', async () => {
    try {
        // Capturamos el video del móvil
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        
        // Mostramos nuestro propio video localmente
        videoElement.srcObject = localStream;
        btnStart.innerText = "CÁMARA TRANSMITIENDO ✅";
        btnStart.style.background = "#2e7d32";

        // Bloqueamos el apagado de pantalla
        if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
        
    } catch (err) {
        alert("Error al abrir cámara: " + err);
    }
});

/**
 * El Emisor se queda "escuchando". 
 * Cuando el Receptor le llame, el Emisor responderá enviando su 'localStream'.
 */
peer.on('call', (call) => {
    console.log("Alguien quiere ver mi video...");
    
    // Respondemos a la llamada enviando nuestro video
    // Si localStream es null, el receptor no verá nada hasta que el emisor active la cámara
    call.answer(localStream); 
});


// --- LÓGICA DEL RECEPTOR (El que ve el video) ---
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Introduce el ID del emisor");

    console.log("Llamando al emisor...");
    
    /**
     * El Receptor llama al Emisor.
     * No envía video (enviamos un stream vacío o null).
     */
    const call = peer.call(remoteId, new MediaStream());

    // Cuando el Emisor nos responda con su video, lo mostramos
    call.on('stream', (remoteStream) => {
        console.log("Recibiendo video del emisor...");
        videoElement.srcObject = remoteStream;
        
        // Ajuste visual: quitamos el espejo porque estamos viendo otra cámara
        videoElement.style.transform = "scaleX(1)";
    });
});


// --- FUNCIONES DE APOYO ---
function generarQR(id) {
    qrContainer.innerHTML = "";
    const urlConexion = `${window.location.origin}${window.location.pathname}?connect=${id}`;
    new QRCode(qrContainer, { text: urlConexion, width: 150, height: 150 });
}

function revisarUrlParaConexion() {
    const params = new URLSearchParams(window.location.search);
    const idParaConectar = params.get('connect');
    if (idParaConectar) {
        remoteIdInput.value = idParaConectar;
    }
}