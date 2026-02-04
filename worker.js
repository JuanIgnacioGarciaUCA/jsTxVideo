// worker.js (fallback para cargar apriltag.js si importScripts falla)
// Ajusta baseUrl si quieres usar un tag/commit en lugar de @master
const baseUrl = 'https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/';

// 1) Importa el JS de emscripten (debe definir AprilTagWasm)
try {
  importScripts(baseUrl + 'apriltag_wasm.js');
  postMessage({ type: 'debug', message: 'imported apriltag_wasm.js' });
} catch (e) {
  postMessage({ type: 'error', message: 'importScripts apriltag_wasm.js failed', error: e && e.message ? e.message : String(e) });
  throw e;
}

// 2) Prefetch wasm (ArrayBuffer)
const wasmPromise = (async () => {
  const url = baseUrl + 'apriltag_wasm.wasm';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('WASM fetch failed: ' + r.status);
    const ab = await r.arrayBuffer();
    postMessage({ type: 'debug', message: 'wasm fetched', status: r.status, url });
    return ab;
  } catch (e) {
    postMessage({ type: 'debug', message: 'wasm fetch error', error: e && e.message ? e.message : String(e), url });
    throw e;
  }
})();

// 3) Wrap AprilTagWasm to inject wasmBinary / locateFile
if (typeof self.AprilTagWasm === 'function') {
  const origFactory = self.AprilTagWasm;
  self.AprilTagWasm = async function(moduleOverrides) {
    moduleOverrides = moduleOverrides || {};
    if (!moduleOverrides.locateFile) moduleOverrides.locateFile = (path) => baseUrl + path;
    try {
      moduleOverrides.wasmBinary = await wasmPromise;
    } catch (_) {
      postMessage({ type: 'debug', message: 'wasmBinary not available, letting factory fetch it' });
    }
    return origFactory(moduleOverrides);
  };
  postMessage({ type: 'debug', message: 'AprilTagWasm wrapped' });
} else {
  postMessage({ type: 'debug', message: 'AprilTagWasm is NOT defined after apriltag_wasm.js import' });
}

// 4) Cargar apriltag.js con fallback: importScripts directo, si falla -> fetch + blob -> importScripts(blobURL)
async function importApriltagWrapper() {
  const url = baseUrl + 'apriltag.js';
  try {
    // Intento directo (sin await porque importScripts es síncrono)
    importScripts(url);
    postMessage({ type: 'debug', message: 'imported apriltag.js via importScripts', url });
    return;
  } catch (e) {
    postMessage({ type: 'debug', message: 'importScripts apriltag.js failed, will try fetch+blob', error: e && e.message ? e.message : String(e), url });
    // fallback: fetch and import as blob URL
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch apriltag.js failed: ' + r.status);
      const text = await r.text();
      const blob = new Blob([text], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        importScripts(blobUrl);
        postMessage({ type: 'debug', message: 'imported apriltag.js via blobUrl', blobUrl });
        // revoke the blob URL after a short delay to avoid race with worker internals
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      } catch (innerErr) {
        postMessage({ type: 'error', message: 'importScripts from blob failed', error: innerErr && innerErr.message ? innerErr.message : String(innerErr) });
        throw innerErr;
      }
    } catch (fetchErr) {
      postMessage({ type: 'error', message: 'fetch apriltag.js failed', error: fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr), url });
      throw fetchErr;
    }
  }
}

importApriltagWrapper().then(() => {
  postMessage({ type: 'debug', message: 'apriltag wrapper loaded' });
  // después de cargar el wrapper intentaremos inicializar el detector
  initDetectorSafe();
}).catch((e) => {
  postMessage({ type: 'error', message: 'Failed to load apriltag wrapper', error: e && e.message ? e.message : String(e) });
  // no seguiremos si no tenemos el wrapper
});

// 5) Inicialización (separamos para llamar después de cargar wrapper)
let detector = null;
let detectorReady = false;

function initDetectorSafe() {
  try {
    // Detectamos qué exporta el wrapper
    postMessage({ type: 'debug', message: 'Apriltag export type', typeofApriltag: typeof Apriltag });
    // Crear instancia; el wrapper del repo usa "new Apriltag(callback)"
    detector = new Apriltag(() => {
      detectorReady = true;
      postMessage({ type: 'ready' });
    });
  } catch (err) {
    postMessage({ type: 'error', message: 'init failed: ' + (err && err.message ? err.message : String(err)), stack: err && err.stack });
  }
}

// 6) Mensajes entrantes: detect, debug
onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg) return;
  if (msg.type === 'detect') {
    if (!detectorReady) { postMessage({ type: 'error', message: 'detector not ready' }); return; }
    try {
      const { width, height, buffer } = msg;
      const gray = new Uint8Array(buffer);
      const detections = detector.detect(gray, width, height);
      postMessage({ type: 'result', detections });
    } catch (err) {
      postMessage({ type: 'error', message: err && err.message ? err.message : String(err), stack: err && err.stack });
    }
  } else if (msg.type === 'debug' && msg.action === 'check_wasm') {
    try {
      const r = await fetch(baseUrl + 'apriltag_wasm.wasm', { method: 'HEAD' });
      postMessage({ type: 'debug', message: 'wasm HEAD', status: r.status, contentType: r.headers.get('content-type'), url: baseUrl + 'apriltag_wasm.wasm' });
    } catch (e) {
      postMessage({ type: 'debug', message: 'wasm HEAD failed', error: e && e.message ? e.message : String(e) });
    }
  }
};