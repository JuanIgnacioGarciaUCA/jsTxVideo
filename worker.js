// Worker que carga apriltag_wasm desde jsDelivr y fuerza locateFile para que apriltag_wasm.wasm
// Ajusta baseUrl si quieres usar un tag/commit concreto en lugar de @master
const baseUrl = 'https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/';

// 1) Carga el JS generado por emscripten
importScripts(baseUrl + 'apriltag_wasm.js');

// 2) Si AprilTagWasm existe, envolvemos la fábrica para inyectar locateFile por defecto
if (typeof self.AprilTagWasm === 'function') {
  const _orig = self.AprilTagWasm;
  self.AprilTagWasm = function(moduleOverrides) {
    moduleOverrides = moduleOverrides || {};
    // Si no existe locateFile, inyectamos una que resuelva al CDN
    if (!moduleOverrides.locateFile) {
      moduleOverrides.locateFile = (path) => {
        const url = baseUrl + path;
        // console.log a DevTools (worker console) - también lo reportamos al main thread
        try { console.log('[worker] locateFile ->', url); } catch(e){}
        return url;
      };
    }
    return _orig(moduleOverrides);
  };
  console.log('[worker] AprilTagWasm wrapped to inject locateFile.');
} else {
  // Si no está definido, lo avisamos (esto indicaría que apriltag_wasm.js no cargó correctamente)
  console.warn('[worker] AprilTagWasm is not defined after importing apriltag_wasm.js');
}

// 3) Ahora cargamos el wrapper apriltag.js (usa la fábrica AprilTagWasm() ya envuelta)
importScripts(baseUrl + 'apriltag.js');

let detector = null;
let detectorReady = false;

// función para verificar la disponibilidad del .wasm (HEAD)
async function checkWasm() {
  try {
    const wasmUrl = baseUrl + 'apriltag_wasm.wasm';
    const r = await fetch(wasmUrl, { method: 'HEAD' });
    postMessage({ type: 'debug', message: 'wasm HEAD', status: r.status, contentType: r.headers.get('content-type'), url: wasmUrl });
  } catch (e) {
    postMessage({ type: 'debug', message: 'wasm HEAD failed', error: (e && e.message) ? e.message : String(e) });
  }
}
checkWasm();

function initDetector() {
  try {
    // Comprobación de qué exporta apriltag.js
    try { console.log('[worker] Apriltag class:', typeof Apriltag); } catch(e){}

    // Crear instancia (Apriltag en el repo acepta un callback cuando WASM está listo)
    detector = new Apriltag(() => {
      postMessage({ type: 'ready' });
      detectorReady = true;
      console.log('[worker] detector ready');
    });
  } catch (err) {
    const msg = 'init failed: ' + (err && err.message ? err.message : String(err));
    postMessage({ type: 'error', message: msg, stack: err && err.stack });
  }
}
initDetector();

onmessage = async (ev) => {
  const msg = ev.data;
  if (msg && msg.type === 'detect') {
    if (!detectorReady) {
      postMessage({ type: 'error', message: 'detector not ready' });
      return;
    }
    const { width, height, buffer } = msg;
    try {
      const gray = new Uint8Array(buffer);
      const detections = detector.detect(gray, width, height);
      postMessage({ type: 'result', detections });
    } catch (err) {
      postMessage({ type: 'error', message: err && err.message ? err.message : String(err), stack: err && err.stack });
    }
  } else if (msg && msg.type === 'debug') {
    // Permite pedir al worker re-chequear wasm
    if (msg.action === 'check_wasm') {
      await checkWasm();
    }
  }
};