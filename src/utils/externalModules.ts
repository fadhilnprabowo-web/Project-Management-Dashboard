type ThreeTools = { THREE: any; OrbitControls: any; GLTFExporter: any; OBJExporter: any }

let threePromise: Promise<ThreeTools> | null = null
export function loadThreeTools() {
  if (!threePromise) {
    threePromise = Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/exporters/GLTFExporter.js'),
      import('three/addons/exporters/OBJExporter.js'),
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
    pdfPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    }).catch(error => {
      pdfPromise = null
      throw error
    })
  }
  return pdfPromise
}

let modelViewerPromise: Promise<void> | null = null
export function loadModelViewer() {
  if (!modelViewerPromise) {
    const url = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer.min.js'
    modelViewerPromise = import(/* @vite-ignore */ url).then(() => undefined).catch(error => {
      modelViewerPromise = null
      throw error
    })
  }
  return modelViewerPromise
}
