const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

let localStream;
const peer = new Peer(); 

// 1. Al abrir, generar ID y Código QR
peer.on('open', (id) => {
    myIdDisplay.innerText = id;
    
    // Limpiar QR previo si existe
    qrContainer.innerHTML = "";
    
    // Crear la URL que el otro dispositivo escaneará
    // Ejemplo: https://tu-usuario.github.io/jsTxVideo/?connect=ID_PEER
    const connectUrl = `${window.location.origin}${window.location.pathname}?connect=${id}`;
    
    new QRCode(qrContainer, {
        text: connectUrl,
        width: 128,
        height: 128
    });
});

// 2. Lógica para conexión automática (Si hay un ID en la URL)
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const connectId = urlParams.get('connect');
    
    if (connectId) {
        remoteIdInput.value = connectId;
        alert("ID detectado de la URL. Pulsa 'Ver Video Remoto' cuando el emisor esté listo.");
        // Opcional: podrías llamar a btnConnect.click() automáticamente tras un delay
    }
});

// --- (El resto del código se mantiene igual que antes) ---

peer.on('call', (call) => {
    call.answer();
    call.on('stream', (remoteStream) => {
        videoElement.srcObject = remoteStream;
    });
});

btnStart.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        videoElement.srcObject = localStream;
        btnStart.innerText = "Cámara lista ✅";
        if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
    } catch (err) { alert("Error: " + err); }
});

btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value;
    if (!remoteId) return alert("Introduce el ID del móvil que transmite");
    const call = peer.call(remoteId, localStream || new MediaStream());
    call.on('stream', (remoteStream) => {
        videoElement.srcObject = remoteStream;
    });
});