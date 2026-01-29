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
    log("📞 Llamada entrante de " + call.peer);
    call.answer(localStream);  // tu stream con vídeo

    call.on('stream', (remoteStream) => {
        log("Recibí stream del receptor (puede ser solo audio o vacío)");
        // Si quieres ver también el del receptor (aunque sea negro o audio)
        // mostrarVideo(remoteStream); 
    });

    call.on('error', err => log("Error en call: " + err));
});

// --- LÓGICA RECEPTOR (el que pulsa btnConnect) ---
btnConnect.addEventListener('click', async () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Falta ID");

    log("Conectando a: " + remoteId + "...");

    let receptorStream;

    try {
        // Opción A: Audio dummy (la que más estabilidad da en 2026)
        receptorStream = await navigator.mediaDevices.getUserMedia({
            //audio: true,   // ← crea un track de audio "silencio"
            video: true
        });
        log("Stream dummy de audio creado para negociación");

        // Opción B: Si no quieres micrófono, prueba esto (funciona en muchos casos)
        // receptorStream = new MediaStream(); // ← a veces falla, pero con audio:true arriba suele ir

    } catch (err) {
        log("No se pudo crear stream dummy: " + err);
        receptorStream = new MediaStream(); // fallback
    }

    const call = peer.call(remoteId, receptorStream);

    call.on('stream', (remoteStream) => {
        log("¡¡STREAM RECIBIDO DEL EMISOR!! 🎥");
        mostrarVideo(remoteStream);
    });

    // Limpieza opcional cuando termine la llamada
    call.on('close', () => {
        if (receptorStream) {
            receptorStream.getTracks().forEach(t => t.stop());
        }
    });

    setTimeout(() => {
        if (!videoElement.srcObject) {
            log("⚠️ No hay vídeo después de 8s... ¿mismo WiFi o firewall?");
        }
    }, 8000);
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