/**
 * jsTxVideo - Lógica de transmisión P2P con PeerJS y QR
 */

// --- 1. REFERENCIAS A ELEMENTOS DEL DOM ---
const videoElement = document.getElementById('webcam');
const btnStart = document.getElementById('btnStart');
const btnConnect = document.getElementById('btnConnect');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id');
const qrContainer = document.getElementById('qrcode');

// --- 2. VARIABLES GLOBALES ---
let localStream; // Guardará el flujo de video de nuestra cámara
let peer;        // Instancia de la conexión PeerJS

/**
 * INICIALIZACIÓN DE PEERJS
 * Se conecta a los servidores de PeerJS para obtener un ID único y permitir el tráfico P2P.
 */
peer = new Peer(); 

/**
 * EVENTO: 'open'
 * Se dispara cuando PeerJS nos asigna un ID con éxito.
 */
peer.on('open', (id) => {
    console.log('Mi ID de PeerJS es: ' + id);
    myIdDisplay.innerText = id;
    
    // Generamos el Código QR con la URL de nuestra web + nuestro ID
    // Esto permite que el receptor solo tenga que escanear y entrar.
    generarQR(id);
    
    // Verificamos si nosotros somos el receptor (si entramos mediante un link de otro)
    revisarUrlParaConexion();
});

/**
 * EVENTO: 'call'
 * Se dispara cuando alguien nos "llama" para ver nuestro video.
 */
peer.on('call', (call) => {
    console.log('Recibiendo llamada...');
    
    // Respondemos a la llamada. 
    // Si tenemos la cámara activada (localStream), la enviamos.
    console.log("Enviando nuestro stream local a la llamada");
    console.log(localStream);
    call.answer(localStream); 
    
    // Cuando recibimos el flujo de video del que nos llama (si él también envía)
    /*
    call.on('stream', (remoteStream) => {
        videoElement.srcObject = remoteStream;
        // Quitamos el efecto espejo si estamos viendo a otro
        videoElement.style.transform = "scaleX(1)"; 
    });
    */
});

/**
 * FUNCIÓN: Iniciar Cámara Local
 * Pide permiso al usuario, activa el video y bloquea el apagado de pantalla.
 */
btnStart.addEventListener('click', async () => {
    try {
        // Pedimos acceso a la cámara trasera (environment) sin audio para evitar acoples
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        
        // Mostramos nuestro propio video en pantalla
        videoElement.srcObject = localStream;
        btnStart.innerText = "CÁMARA ACTIVADA ✅";
        btnStart.style.background = "#2e7d32";

        // Wake Lock: Evita que el móvil apague la pantalla mientras transmitimos
        if ('wakeLock' in navigator) {
            try {
                await navigator.wakeLock.request('screen');
                console.log("Wake Lock activo: La pantalla no se apagará");
            } catch (err) {
                console.error("Error con Wake Lock:", err);
            }
        }
    } catch (err) {
        console.error("Error al acceder a la cámara:", err);
        alert("No se pudo acceder a la cámara. Revisa los permisos HTTPS.");
    }
});

/**
 * FUNCIÓN: Conectar con un Emisor
 * Toma el ID del input y realiza una llamada WebRTC.
 */
btnConnect.addEventListener('click', () => {
    const remoteId = remoteIdInput.value.trim();
    
    if (!remoteId) {
        alert("Por favor, introduce el ID del emisor.");
        return;
    }

    console.log('Llamando a: ' + remoteId);

    // Iniciamos la llamada enviando nuestro stream (si existe) 
    // o un stream vacío si solo queremos recibir.
    //const call = peer.call(remoteId, localStream || new MediaStream());
    //localStream=new MediaStream();
    const call = peer.call(remoteId);
    console.log(call);
    call.on('stream', (remoteStream) => {
        console.log('Recibiendo stream remoto');
        videoElement.srcObject = remoteStream;
        // Quitamos el efecto espejo para ver el video remoto correctamente
        videoElement.style.transform = "scaleX(1)";
    });

    call.on('error', (err) => {
        console.error("Error en la llamada:", err);
        alert("Error al conectar con el ID remoto.");
    });
});

/**
 * FUNCIÓN AUXILIAR: Generar Código QR
 * Crea un QR que contiene un link directo de conexión.
 */
function generarQR(id) {
    qrContainer.innerHTML = ""; // Limpiar antes de generar
    const protocol = window.location.protocol;
    const host = window.location.host;
    const path = window.location.pathname;
    
    // Construimos la URL: https://usuario.github.io/repo/?connect=ID
    const urlConexion = `${protocol}//${host}${path}?connect=${id}`;
    
    new QRCode(qrContainer, {
        text: urlConexion,
        width: 150,
        height: 150,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

/**
 * FUNCIÓN AUXILIAR: Revisar URL
 * Si la URL tiene el parámetro ?connect=ID, lo pone automáticamente en el input.
 */
function revisarUrlParaConexion() {
    const params = new URLSearchParams(window.location.search);
    const idParaConectar = params.get('connect');
    
    if (idParaConectar) {
        remoteIdInput.value = idParaConectar;
        console.log("ID detectado desde URL: " + idParaConectar);
        // Opcional: Podrías disparar el clic automático aquí
        // btnConnect.click(); 
    }
}