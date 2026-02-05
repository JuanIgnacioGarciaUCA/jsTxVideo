// worker.js
console.log("Iniciando Worker de AprilTag...");

// URL base de la librería
const baseUrl = 'https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/';

let detector = null;
let detectorReady = false;

// 1. CARGA SÍNCRONA DE LIBRERÍAS
try {
    // Importamos primero el motor WASM y luego el wrapper
    importScripts(baseUrl + 'apriltag_wasm.js');
    //importScripts(baseUrl + 'apriltag.js');
    console.log("Scripts de AprilTag importados correctamente.");
} catch (e) {
    postMessage({ type: 'error', message: 'Error al importar scripts: ' + e.message });
}
try {
    // Importamos primero el motor WASM y luego el wrapper
    //importScripts(baseUrl + 'apriltag_wasm.js');
    importScripts(baseUrl + 'apriltag.js');
    console.log("Scripts de AprilTag importados correctamente.");
} catch (e) {
    postMessage({ type: 'error', message: 'Error al importar scripts: ' + e.message });
}



// 2. CONFIGURACIÓN DEL WRAPPER WASM
// Esto es necesario porque la librería espera encontrar el archivo .wasm en la misma carpeta
if (typeof self.AprilTagWasm === 'function') {
    const origFactory = self.AprilTagWasm;
    self.AprilTagWasm = function(moduleOverrides) {
        moduleOverrides = moduleOverrides || {};
        // Decimos dónde encontrar el binario .wasm explícitamente
        moduleOverrides.locateFile = (path) => baseUrl + path;
        return origFactory(moduleOverrides);
    };
}

// 3. INICIALIZACIÓN DEL DETECTOR
function init() {
    try {
        if (typeof Apriltag === 'undefined') {
            throw new Error("La clase 'Apriltag' no está definida. Falló la carga del script.");
        }

        // Creamos la instancia para la familia tag16h5
        detector = new Apriltag(() => {
            detectorReady = true;
            console.log("Detector AprilTag (16h5) listo.");
            postMessage({ type: 'ready' });
        }, "tag16h5");

    } catch (err) {
        postMessage({ type: 'error', message: 'Error en init: ' + err.message });
    }
}

// Arrancamos la inicialización
init();

// 4. MANEJO DE MENSAJES (Detección)
onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === 'detect') {
        if (!detectorReady || !detector) {
            return;
        }

        try {
            const { width, height, buffer } = msg;
            // El buffer que viene del main thread es un GrayScale Uint8Array
            const grayPixels = new Uint8Array(buffer);
            
            // Ejecutar detección
            const detections = detector.detect(grayPixels, width, height);
            
            // Devolver resultados
            postMessage({ type: 'result', detections });
        } catch (err) {
            postMessage({ type: 'error', message: 'Error detectando: ' + err.message });
        }
    }
};