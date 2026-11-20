export type PdfRoutePoint = { x: number; y: number }
export type PdfVectorRoute = { points: PdfRoutePoint[]; color: string; gas: 'Oxygen' | 'Nitrous Oxide' | 'Medical Air' | 'Medical Vacuum' | '' }

export function gasFromPlanColor(color: string): PdfVectorRoute['gas'] {
  const hex = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return ''
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if (g >= 120 && g > r * 1.45 && g > b * 1.25) return 'Oxygen'
  if (b >= 120 && b > r * 1.45 && b > g * 1.15) return 'Nitrous Oxide'
  if (r >= 160 && g >= 160 && b < 120) return 'Medical Air'
  if (Math.max(r, g, b) <= 55) return 'Medical Vacuum'
  return ''
}

function isReviewColor(color: string) {
  const hex = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
  return Math.max(...channels) >= 140 && Math.max(...channels) - Math.min(...channels) >= 90
}

function floorFromPageText(text: string, pageNumber: number) {
  const match = text.match(/\b(?:lantai|floor|level|lt\.?)[\s:_-]*(\d+|ground|dasar|basement|semi\s*basement)\b/i)
  if (!match) return { floorIndex: pageNumber - 1, floorLabel: `Lantai ${pageNumber}` }
  const raw = match[1].toLowerCase().replace(/\s+/g, ' ')
  const floorIndex = /^\d+$/.test(raw) ? Math.max(0, Number(raw) - 1) : raw === 'ground' || raw === 'dasar' ? 0 : -1
  return { floorIndex, floorLabel: raw === 'ground' || raw === 'dasar' ? 'Lantai Dasar' : raw === 'basement' ? 'Basement' : raw === 'semi basement' ? 'Semi-basement' : `Lantai ${raw}` }
}

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

/** Extract long, predominantly orthogonal colored vector strokes from a PDF page.
 * Gas classification follows the project mapping supplied by the user.
 */
export function extractPdfVectorRoutes(pdfjs: any, operatorList: any, pageWidth: number, pageHeight: number, floorIndex = 0, floorLabel = 'Lantai 1', pageNumber = 1) {
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
    if (op !== OPS.constructPath || (!gasFromPlanColor(strokeColor) && !isReviewColor(strokeColor))) continue

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
    gas: gasFromPlanColor(path.color),
    floorIndex,
    floorLabel,
    pageNumber,
    points: path.points.map(point => ({
      x: Math.max(0, Math.min(1, point.x / pageWidth)),
      y: Math.max(0, Math.min(1, 1 - point.y / pageHeight)),
    })),
  }))
  return {
    routes,
    colorCounts: routes.reduce<Record<string, number>>((counts, route) => {
      counts[route.color] = (counts[route.color] || 0) + 1
      return counts
    }, {}),
    unsupportedCurveCount,
  }
}

export async function extractPdfDocumentRoutes(pdfjs: any, document: any, onPage?: (pageNumber: number, totalPages: number) => void) {
  const routes: ReturnType<typeof extractPdfVectorRoutes>['routes'] = []
  const pages: Array<{ pageNumber: number; floorLabel: string; floorIndex: number; routeCount: number }> = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    onPage?.(pageNumber, document.numPages)
    const page = await document.getPage(pageNumber)
    const [operatorList, textContent] = await Promise.all([page.getOperatorList(), page.getTextContent()])
    const floor = floorFromPageText(textContent.items.map((item: any) => item.str || '').join(' '), pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const pageResult = extractPdfVectorRoutes(pdfjs, operatorList, viewport.width, viewport.height, floor.floorIndex, floor.floorLabel, pageNumber)
    routes.push(...pageResult.routes)
    pages.push({ pageNumber, ...floor, routeCount: pageResult.routes.length })
  }
  return { routes, pages }
}
