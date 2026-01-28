const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

let localStream = null;
const peer = new Peer(); 

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
        // Forzamos la reproducción
        videoElement.play();
        
        btnStart.innerText = "CÁMARA TRANSMITIENDO ✅";
        btnStart.style.background = "#2e7d32";
        if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
    } catch (err) {
        alert("Error al abrir cámara: " + err);
    }
});

// El emisor recibe la llamada
peer.on('call', (call) => {
    console.log("Recibiendo llamada de:", call.peer);
    
    if (!localStream) {
        alert("¡Alguien intenta conectar pero no has activado tu cámara!");
        // Opcional: podrías llamar a btnStart.click() aquí
    }

    // Respondemos con nuestro stream (aunque sea null, pero lo ideal es que ya exista)
    call.answer(localStream);

    // Si el receptor también envía video (poco probable en este esquema, pero por si acaso)
    call.on('stream', (remoteStream) => {
        mostrarVideoRemoto(remoteStream);
    });
});

// --- RECEPTOR ---
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Introduce el ID del emisor");

    console.log("Llamando al emisor...");
    
    // El receptor inicia la llamada. 
    // Enviamos un MediaStream vacío para activar el canal.
    const call = peer.call(remoteId, new MediaStream());

    call.on('stream', (remoteStream) => {
        console.log("¡Stream remoto recibido con éxito!");
        mostrarVideoRemoto(remoteStream);
    });

    call.on('error', (err) => {
        console.error("Error en la llamada:", err);
    });
});

// Función auxiliar para asegurar que el video se muestra y reproduce
function mostrarVideoRemoto(stream) {
    videoElement.srcObject = stream;
    videoElement.style.transform = "scaleX(1)";
    
    // IMPORTANTE: Algunos navegadores bloquean el play automático
    videoElement.play().catch(e => {
        console.warn("El autoplay fue bloqueado, intentando con mute...", e);
        videoElement.muted = true;
        videoElement.play();
    });
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