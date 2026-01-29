/**
 * jsTxVideo - VERSIÓN FINAL (FIX RECEPTOR)
 */

const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

// Log en pantalla
const logArea = document.createElement('div');
logArea.style = "background: #000; color: #0f0; font-family: monospace; font-size: 10px; padding: 10px; height: 80px; overflow-y: scroll; width: 100%; text-align: left;";
document.body.appendChild(logArea);

function log(msg) {
    logArea.innerHTML += `> ${msg}<br>`;
    logArea.scrollTop = logArea.scrollHeight;
    console.log(msg);
}

let localStream = null;

// Configuración con varios servidores STUN para saltar Firewalls
const peer = new Peer(undefined, {
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' },
            { url: 'stun:stun2.l.google.com:19302' }
        ]
    }
});

peer.on('open', (id) => {
    log("Mi ID: " + id);
    myIdDisplay.innerText = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', (err) => log("ERROR: " + err.type));

// --- LÓGICA EMISOR ---
btnStart.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        videoElement.srcObject = localStream;
        videoElement.play();
        log("Cámara lista ✅");
        btnStart.style.background = "#2e7d32";
    } catch (err) {
        log("Error cámara: " + err);
    }
});

peer.on('call', (call) => {
    log("📞 Llamada entrante...");
    // Aunque no tengamos stream, respondemos para abrir el canal
    call.answer(localStream);
    
    call.on('stream', (remoteStream) => {
        log("Recibiendo stream del que llama...");
        mostrarVideo(remoteStream);
    });
});

// --- LÓGICA RECEPTOR ---
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Falta ID");
    
    log("Conectando a: " + remoteId + "...");
    
    // El receptor llama. IMPORTANTE: Pasamos un stream vacío pero estructurado
    const call = peer.call(remoteId, new MediaStream());

    call.on('stream', (remoteStream) => {
        log("¡¡STREAM RECIBIDO!! 🎥");
        mostrarVideo(remoteStream);
    });

    // Si después de 5 segundos no hay stream, puede ser el Firewall
    setTimeout(() => {
        if (!videoElement.srcObject) log("⚠️ Sin datos... ¿estás en el mismo WiFi?");
    }, 5000);
});

function mostrarVideo(stream) {
    log("Configurando elemento de video...");
    videoElement.srcObject = stream;
    videoElement.style.transform = "scaleX(1)";
    
    // Obligatorio para navegadores modernos
    videoElement.muted = true; 
    videoElement.setAttribute('autoplay', '');
    videoElement.setAttribute('playsinline', '');
    
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            log("Reproducción iniciada con éxito 🍿");
        }).catch(error => {
            log("Autoplay bloqueado. Haz clic en el video.");
            // Si falla, añadimos un evento para que al tocar la pantalla arranque
            document.body.addEventListener('click', () => videoElement.play(), {once: true});
        });
    }
}

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