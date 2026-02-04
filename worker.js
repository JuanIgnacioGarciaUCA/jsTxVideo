// worker.js (versión robusta: prefetch WASM y provee wasmBinary a la fábrica)

// Ajusta baseUrl si quieres usar un tag/commit en lugar de @master
const baseUrl = 'https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/';

// 1) Importa el JS generado por emscripten (define la fábrica AprilTagWasm)
importScripts(baseUrl + 'apriltag_wasm.js');

// 2) Inicia la descarga del .wasm (ArrayBuffer) en segundo plano
const wasmPromise = (async () => {
  const url = baseUrl + 'apriltag_wasm.wasm';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('WASM fetch failed: ' + r.status);
    const ab = await r.arrayBuffer();
    // reportamos al main thread que el fetch fue OK
    try { postMessage({ type: 'debug', message: 'wasm fetched', status: r.status, url }); } catch (e) {}
    return ab;
  } catch (e) {
    try { postMessage({ type: 'debug', message: 'wasm fetch error', error: e && e.message ? e.message : String(e), url }); } catch (ee) {}
    throw e;
  }
})();

// 3) Envuelve la fábrica AprilTagWasm para inyectar wasmBinary + locateFile
if (typeof self.AprilTagWasm === 'function') {
  const origFactory = self.AprilTagWasm;
  self.AprilTagWasm = async function(moduleOverrides) {
    moduleOverrides = moduleOverrides || {};
    // inject locateFile if not provided
    if (!moduleOverrides.locateFile) {
      moduleOverrides.locateFile = (path) => baseUrl + path;
    }
    // wait for the fetched wasm and provide it as wasmBinary (so the factory won't fetch it)
    try {
      const wasmBinary = await wasmPromise;
      moduleOverrides.wasmBinary = wasmBinary;
    } catch (e) {
      // If fetch failed, still call the factory (it will try to fetch itself and possibly fail)
      // but we log the error for debugging
      try { postMessage({ type: 'debug', message: 'wasmBinary not available, will let factory fetch it', error: e && e.message ? e.message : String(e) }); } catch (_) {}
    }
    // Call original factory (returns a Promise resolving to Module)
    return origFactory(moduleOverrides);
  };
  try { postMessage({ type: 'debug', message: 'AprilTagWasm wrapped (will provide wasmBinary when available)' }); } catch(e){}
} else {
  try { postMessage({ type: 'debug', message: 'AprilTagWasm is NOT defined after apriltag_wasm.js import' }); } catch(e){}
}

// 4) Ahora importa el wrapper apriltag.js (debe usar AprilTagWasm(...))
importScripts(baseUrl + 'apriltag.js');

// 5) Inicialización del detector usando la clase Apriltag del wrapper
let detector = null;
let detectorReady = false;

function initDetector() {
  try {
    // Apriltag constructor in repo expects a callback when WASM is ready
    detector = new Apriltag(() => {
      detectorReady = true;
      postMessage({ type: 'ready' });
    });
  } catch (err) {
    postMessage({ type: 'error', message: 'init failed: ' + (err && err.message ? err.message : String(err)), stack: err && err.stack });
  }
}
initDetector();

// 6) Mensajes entrantes (detect, debug, etc.)
onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg) return;

  if (msg.type === 'detect') {
    if (!detectorReady) {
      postMessage({ type: 'error', message: 'detector not ready' });
      return;
    }
    try {
      const { width, height, buffer } = msg;
      const gray = new Uint8Array(buffer);
      const detections = detector.detect(gray, width, height);
      postMessage({ type: 'result', detections });
    } catch (err) {
      postMessage({ type: 'error', message: err && err.message ? err.message : String(err), stack: err && err.stack });
    }
  } else if (msg.type === 'debug') {
    if (msg.action === 'check_wasm') {
      try {
        const r = await fetch(baseUrl + 'apriltag_wasm.wasm', { method: 'HEAD' });
        postMessage({ type: 'debug', message: 'wasm HEAD', status: r.status, contentType: r.headers.get('content-type'), url: baseUrl + 'apriltag_wasm.wasm' });
      } catch (e) {
        postMessage({ type: 'debug', message: 'wasm HEAD failed', error: e && e.message ? e.message : String(e) });
      }
    }
  }
};