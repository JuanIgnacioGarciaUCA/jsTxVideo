const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');

let localStream;
// Creamos una instancia de PeerJS
const peer = new Peer(); 

// Mostrar mi ID cuando el servidor PeerJS me lo asigne
peer.on('open', (id) => {
    myIdDisplay.innerText = id;
});

// ESCENARIO A: Recibir la transmisión (Cuando alguien me llama)
peer.on('call', (call) => {
    call.answer(); // Responder a la llamada
    call.on('stream', (remoteStream) => {
        // Mostrar el video que viene del otro dispositivo
        videoElement.srcObject = remoteStream;
    });
});

// ESCENARIO B: Iniciar mi cámara y estar listo para enviar
btnStart.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        videoElement.srcObject = localStream;
        btnStart.innerText = "Cámara lista ✅";

        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        alert("Error: " + err);
    }
});

// ESCENARIO C: Conectarme al otro dispositivo para ver su video
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value;
    if (!remoteId) return alert("Introduce el ID del móvil que transmite");

    // Llamar al otro dispositivo enviando mi stream (opcional)
    const call = peer.call(remoteId, localStream || new MediaStream());
    
    call.on('stream', (remoteStream) => {
        videoElement.srcObject = remoteStream;
    });
});
