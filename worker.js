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