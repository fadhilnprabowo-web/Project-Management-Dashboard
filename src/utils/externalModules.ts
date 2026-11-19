const loadModule = (url: string) => import(/* @vite-ignore */ url) as Promise<any>

let threePromise: Promise<{ THREE: any; OrbitControls: any; GLTFExporter: any; OBJExporter: any }> | null = null
export function loadThreeTools() {
  if (!threePromise) {
    threePromise = Promise.all([
      loadModule('https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js'),
      loadModule('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js'),
      loadModule('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/exporters/GLTFExporter.js'),
      loadModule('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/exporters/OBJExporter.js'),
    ]).then(([THREE, controls, gltf, obj]) => ({
      THREE,
      OrbitControls: controls.OrbitControls,
      GLTFExporter: gltf.GLTFExporter,
      OBJExporter: obj.OBJExporter,
    })).catch(error => {
      threePromise = null
      throw error
    })
  }
  return threePromise
}

let pdfPromise: Promise<any> | null = null
export function loadPdfJs() {
  if (!pdfPromise) {
    pdfPromise = loadModule('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').catch(error => {
      pdfPromise = null
      throw error
    })
  }
  return pdfPromise
}

let modelViewerPromise: Promise<void> | null = null
export function loadModelViewer() {
  if (!modelViewerPromise) {
    modelViewerPromise = loadModule('https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer.min.js').then(() => undefined).catch(error => {
      modelViewerPromise = null
      throw error
    })
  }
  return modelViewerPromise
}
