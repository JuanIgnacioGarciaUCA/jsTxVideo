// worker.js
console.log("Iniciando Worker de AprilTag...");

// URL base de la librería
//const baseUrl = 'https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/';

let detector = null;
let detectorReady = false;

// 1. CARGA SÍNCRONA DE LIBRERÍAS
/*
try {
    // Importamos primero el motor WASM y luego el wrapper
    importScripts(baseUrl + 'apriltag_wasm.js');
    importScripts(baseUrl + 'apriltag.js');
    console.log("Scripts de AprilTag importados correctamente.");
} catch (e) {
    postMessage({ type: 'error', message: 'Error al importar scripts: ' + e.message });
}*/
// 1. CARGA LOCAL
try {
    // Importamos los archivos que ya están en nuestra carpeta
    importScripts('apriltag_wasm.js');
    importScripts('apriltag.js');
    console.log("Scripts locales cargados.");
} catch (e) {
    postMessage({ type: 'error', message: 'Error cargando scripts locales: ' + e.message });
}



// 2. CONFIGURACIÓN DEL WRAPPER WASM
// Esto es necesario porque la librería espera encontrar el archivo .wasm en la misma carpeta
if (typeof self.AprilTagWasm === 'function') {
    const origFactory = self.AprilTagWasm;
    self.AprilTagWasm = function(moduleOverrides) {
        moduleOverrides = moduleOverrides || {};
        // Decimos dónde encontrar el binario .wasm explícitamente
        //moduleOverrides.locateFile = (path) => baseUrl + path;
        moduleOverrides.locateFile = (path) => path;
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
            console.log("Detector listo:", detector); 
            console.log("Configuración del detector:", detector._opt);
            console.log("Familia asignada:", detector.family || "Interna en WASM");
            postMessage({ type: 'ready' });
        });

    } catch (err) {
        postMessage({ type: 'error', message: 'Error en init: ' + err.message });
    }
}

// Arrancamos la inicialización
init();

// 4. MANEJO DE MENSAJES (Detección)
let aux=true;
onmessage = (ev) => {
  const msg = ev.data;  
  if (msg.type === 'detect') {
    if (!detectorReady || !detector) {
      postMessage({ type: 'debug', message: "Detector no listo, ignorando mensaje de detección.", msg });
      return;
    }
    try {
      const { type, width, height, buffer } = msg;
      // El buffer que viene del main thread es un GrayScale Uint8Array
      const grayPixels = new Uint8Array(buffer);
      // Ejecutar detección
      const detections = detector.detect(grayPixels, width, height);
      // Devolver resultados
      postMessage({ type: 'result', detections });
      /*if(detections.length>0 ){
        postMessage({ type: 'result1', detections });
        postMessage({ type: 'debug1', message: "Primera detección realizada con éxito.", msg, detections });
        aux=false;
      }*/
    } catch (err) {
      postMessage({ type: 'error', message: 'Error detectando: ' + err.message });
    }
  }
};