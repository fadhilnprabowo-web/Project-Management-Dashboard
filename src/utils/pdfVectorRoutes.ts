export type PdfRoutePoint = { x: number; y: number }
export type PdfVectorRoute = { points: PdfRoutePoint[]; color: string }

type Matrix = [number, number, number, number, number, number]

const transformPoint = (point: PdfRoutePoint, matrix: Matrix): PdfRoutePoint => ({
  x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
  y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
})

const multiplyMatrix = (left: Matrix, right: Matrix): Matrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
]

/** Extract long, predominantly orthogonal red/green vector strokes from a PDF page.
 * This creates reviewable route candidates; it never assigns a gas type from color.
 */
export function extractPdfVectorRoutes(pdfjs: any, operatorList: any, pageWidth: number, pageHeight: number) {
  const { OPS } = pdfjs
  let matrix: Matrix = [1, 0, 0, 1, 0, 0]
  let strokeColor = ''
  const stack: Array<{ matrix: Matrix; strokeColor: string }> = []
  const paths: Array<{ points: PdfRoutePoint[]; color: string; length: number; axisLength: number; curved: boolean }> = []
  let unsupportedCurveCount = 0

  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const op = operatorList.fnArray[index]
    const args = operatorList.argsArray[index]
    if (op === OPS.save) {
      stack.push({ matrix: [...matrix] as Matrix, strokeColor })
      continue
    }
    if (op === OPS.restore) {
      const previous = stack.pop()
      if (previous) { matrix = previous.matrix; strokeColor = previous.strokeColor }
      continue
    }
    if (op === OPS.transform) {
      matrix = multiplyMatrix(matrix, args as Matrix)
      continue
    }
    if (op === OPS.setStrokeRGBColor) {
      strokeColor = `#${[args[0], args[1], args[2]].map((value: number) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toLowerCase()
      continue
    }
    if (op !== OPS.constructPath || (strokeColor !== '#ff0000' && strokeColor !== '#00ff00')) continue

    const [commands, coordinates] = args as [number[], number[]]
    let offset = 0
    let current: PdfRoutePoint | null = null
    let first: PdfRoutePoint | null = null
    let length = 0
    let axisLength = 0
    let curved = false
    const points: PdfRoutePoint[] = []
    for (const command of commands) {
      if (command === OPS.moveTo) {
        current = transformPoint({ x: coordinates[offset], y: coordinates[offset + 1] }, matrix)
        first = current
        points.push(current)
        offset += 2
      } else if (command === OPS.lineTo) {
        const end = transformPoint({ x: coordinates[offset], y: coordinates[offset + 1] }, matrix)
        if (current) {
          const dx = Math.abs(end.x - current.x)
          const dy = Math.abs(end.y - current.y)
          const distance = Math.hypot(dx, dy)
          length += distance
          if (dx < 0.05 || dy < 0.05) axisLength += distance
        }
        points.push(end)
        current = end
        offset += 2
      } else if (command === OPS.closePath) {
        if (current && first) {
          const dx = Math.abs(first.x - current.x)
          const dy = Math.abs(first.y - current.y)
          const distance = Math.hypot(dx, dy)
          length += distance
          if (dx < 0.05 || dy < 0.05) axisLength += distance
          points.push(first)
          current = first
        }
      } else if (command === OPS.curveTo || command === OPS.curveTo2 || command === OPS.curveTo3) {
        // Curves are deliberately omitted rather than replaced with guessed elbows.
        curved = true
        unsupportedCurveCount++
        offset += command === OPS.curveTo ? 6 : 4
        current = null
        first = null
      }
    }
    if (!curved && points.length >= 2 && length >= 15 && axisLength / length >= 0.75) {
      paths.push({ points, color: strokeColor, length, axisLength, curved })
    }
  }

  const routes = paths.map(path => ({
    color: path.color,
    points: path.points.map(point => ({
      x: Math.max(0, Math.min(1, point.x / pageWidth)),
      y: Math.max(0, Math.min(1, 1 - point.y / pageHeight)),
    })),
  }))
  return {
    routes,
    redCount: routes.filter(route => route.color === '#ff0000').length,
    greenCount: routes.filter(route => route.color === '#00ff00').length,
    unsupportedCurveCount,
  }
}
