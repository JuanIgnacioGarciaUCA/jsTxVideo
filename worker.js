self.Module = {
  locateFile: (path) => {
    // ruta absoluta al directorio donde están apriltag_wasm.js y apriltag_wasm.wasm en jsDelivr
    return 'https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/' + path;
  }
};
// ahora carga primero el JS generado y luego el wrapper apriltag.js
importScripts('https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/apriltag_wasm.js');
importScripts('https://cdn.jsdelivr.net/gh/arenaxr/apriltag-js-standalone@master/html/apriltag.js');

let detector = null;
let detectorReady = false;

// Si apriltag.js define una clase global Apriltag:
function initDetector() {
  // Apriltag constructor takes a callback when wasm is ready
  try {
    detector = new Apriltag(() => {
      // apriltag.js internally calls AprilTagWasm() and then onWasmInit
      postMessage({ type: 'ready' });
      detectorReady = true;
      log("AprilTag detector ready ✓");
    });
  } catch (err) {
    postMessage({ type: 'error', message: 'init failed: ' + err.message });
    log("Error inicializando AprilTag: " + err.message);
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
  }
};