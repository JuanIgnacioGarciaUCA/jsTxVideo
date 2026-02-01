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
/*
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
});*/

const peer = new Peer(); 

peer.on('open', (id) => {
    log("Mi ID: " + id);
    myIdDisplay.innerText = id;
    generarQR(id);
    revisarUrlParaConexion();
});

peer.on('error', (err) => log("ERROR: " + err.type));

// --- LÓGICA EMISOR ---
// --- LÓGICA EMISOR ---
btnStart.addEventListener('click', async () => {
    try {
        log("Solicitando cámara a 640x480...");
        
        const constraints = {
            video: {
                // Forzamos la resolución
                width: { ideal: 640 },
                height: { ideal: 480 },
                // Aseguramos que mantenga la proporción 4:3
                aspectRatio: 1.33333,
                facingMode: "environment" 
            },
            audio: false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Verificamos qué resolución nos ha dado el móvil realmente
        const settings = localStream.getVideoTracks()[0].getSettings();
        log(`Resolución real: ${settings.width}x${settings.height}`);

        videoElement.srcObject = localStream;
        videoElement.play();
        
        btnStart.innerText = "CÁMARA OK ✅";
        btnStart.style.background = "#2e7d32";
    } catch (err) {
        log("Error cámara: " + err);
        alert("No se pudo forzar 640x480. Probando modo automático...");
        // Fallback por si la cámara no soporta esa resolución exacta
        localStream = await navigator.mediaDevices.getUserMedia({ video: true });
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
/*
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
*/
btnConnect.addEventListener('click', async () => {
    const remoteId = remoteIdInput.value.trim();
    if (!remoteId) return alert("Falta ID");

    log("Conectando a: " + remoteId + "...");

    let receptorStream;

    try {
        // Intentamos pedir cámara (esto ayuda a la estabilidad si existe)
        receptorStream = await navigator.mediaDevices.getUserMedia({
            video: true
        });
        log("Cámara del receptor detectada y usada.");
    } catch (err) {
        log("PC sin cámara o permiso denegado. Creando stream virtual negro...");
        
        // --- TRUCO: Crear un Stream de video "falso" usando un Canvas ---
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Capturamos el dibujo del canvas como un stream de video a 1 frame por segundo
        receptorStream = canvas.captureStream(1); 
        
        // También añadimos un track de audio silencioso por si el receptor lo espera
        try {
            const audioCtx = new AudioContext();
            const destination = audioCtx.createMediaStreamDestination();
            const silentTrack = destination.stream.getAudioTracks()[0];
            if (silentTrack) receptorStream.addTrack(silentTrack);
        } catch(e) { console.log("No se pudo crear audio silencioso"); }
    }

    // Iniciamos la llamada con nuestro stream (sea real o virtual)
    const call = peer.call(remoteId, receptorStream);

    if (!call) {
        log("Error: No se pudo crear el objeto de llamada.");
        return;
    }

    call.on('stream', (remoteStream) => {
        log("¡¡STREAM RECIBIDO DEL EMISOR!! 🎥");
        mostrarVideo(remoteStream);
        const settings = remoteStream.getVideoTracks()[0].getSettings();
        log(`Video recibido a: ${settings.width}x${settings.height}`);
    });

    call.on('error', err => log("Error en conexión: " + err));
    
    // Limpieza al cerrar
    call.on('close', () => {
        if (receptorStream) {
            receptorStream.getTracks().forEach(t => t.stop());
        }
    });
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


//////////////

const btnStealth = document.getElementById('btnStealth');
const blackOverlay = document.getElementById('blackOverlay');

// Función para activar el modo pantalla negra
btnStealth.addEventListener('click', () => {
    if (!localStream) return alert("Primero activa la cámara");
    
    // Entrar en pantalla completa (opcional, pero recomendado)
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
    
    // Mostrar la capa negra
    blackOverlay.style.display = 'block';
    log("Modo ahorro activado. Píxeles apagados.");
});

// Salir del modo pantalla negra con doble clic
blackOverlay.addEventListener('dblclick', () => {
    blackOverlay.style.display = 'none';
    if (document.exitFullscreen) document.exitFullscreen();
    log("Modo ahorro desactivado.");
});