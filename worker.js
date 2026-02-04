// worker.js
// Worker que carga apriltag_wasm desde jsDelivr y expone detección por mensajes.

// 1) Indica dónde localizar archivos WASM antes de cargar el JS generado por emscripten.
//    Ajusta la URL a la versión que quieras (recomendado: usar un tag/commit en lugar de @master).
self.Module = {
  locateFile: (path) => {
    return 'https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/' + path;
  }
};

// 2) Cargar el JS generado (apriltag_wasm.js) y el wrapper apriltag.js desde jsDelivr.
//    Apriltag_wasm.js usará self.Module.locateFile para resolver apriltag_wasm.wasm.
importScripts('https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/apriltag_wasm.js');
importScripts('https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/apriltag.js');

let detector = null;
let detectorReady = false;

// Inicializa el detector usando la clase Apriltag del wrapper (usa 'new' si es una clase).
function initDetector() {
  try {
    // La clase Apriltag en el repo acepta un callback cuando el WASM se haya inicializado.
    // Usamos 'new Apriltag(...)' basándonos en la implementación del wrapper.
    detector = new Apriltag(() => {
      postMessage({ type: 'ready' });
      detectorReady = true;
    });
  } catch (err) {
    postMessage({ type: 'error', message: 'init failed: ' + err.message });
  }
}
initDetector();

// Mensajes entrantes: detect recibe { type: 'detect', width, height, buffer }
// Nota: buffer debe ser un ArrayBuffer transferido con datos en escala de grises (Uint8Array).
onmessage = async (ev) => {
  const msg = ev.data;
  if (msg && msg.type === 'detect') {
    if (!detectorReady) {
      postMessage({ type: 'error', message: 'detector not ready' });
      return;
    }
    // Esperamos buffer transferido (ArrayBuffer) con datos en escala de grises
    const { width, height, buffer } = msg;
    try {
      const gray = new Uint8Array(buffer); // ya es el buffer transferido
      const detections = detector.detect(gray, width, height);
      // detections es un array de objetos JSON según la API del repo
      postMessage({ type: 'result', detections });
    } catch (err) {
      postMessage({ type: 'error', message: err.message });
    }
  } else if (msg && msg.type === 'set_pose_info') {
    // Opcional: exponer otras llamadas al detector (ejemplo set_pose_info)
    try {
      if (!detectorReady) throw new Error('detector not ready');
      const { fx, fy, cx, cy } = msg;
      if (detector._set_pose_info) {
        detector._set_pose_info(fx, fy, cx, cy); // si el wrapper expone el método directamente
        postMessage({ type: 'ok', action: 'set_pose_info' });
      } else if (detector.set_pose_info) {
        detector.set_pose_info(fx, fy, cx, cy);
        postMessage({ type: 'ok', action: 'set_pose_info' });
      } else {
        postMessage({ type: 'error', message: 'set_pose_info not available on detector' });
      }
    } catch (err) {
      postMessage({ type: 'error', message: err.message });
    }
  }
};