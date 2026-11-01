export type Box = { x0: number; y0: number; x1: number; y1: number }
export type Word = { text: string; confidence: number; bbox: Box }

export function consolidateVisuals(boxes: Box[], words: Word[], width: number, height: number) {
  const merged = boxes.map(box => ({ ...box }))
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < merged.length && !changed; i++) for (let j = i + 1; j < merged.length; j++) {
      const a = merged[i], b = merged[j]
      const xGap = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1))
      const yGap = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1))
      if ((xGap === 0 && yGap < height * 0.065) || (yGap === 0 && xGap < width * 0.05)) {
        merged[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
        merged.splice(j, 1); changed = true; break
      }
    }
  }
  return merged.map(box => {
    // Include nearby original labels/captions. Never redraw text or infer values.
    const nearby = words.filter(word => word.bbox.x1 >= box.x0 - 45 && word.bbox.x0 <= box.x1 + 45 &&
      word.bbox.y1 >= box.y0 - 45 && word.bbox.y0 <= box.y1 + 45).map(word => word.bbox)
    return { x0: Math.max(0, Math.floor(Math.min(box.x0, ...nearby.map(b => b.x0)) - 16)),
      y0: Math.max(0, Math.floor(Math.min(box.y0, ...nearby.map(b => b.y0)) - 16)),
      x1: Math.min(width, Math.ceil(Math.max(box.x1, ...nearby.map(b => b.x1)) + 16)),
      y1: Math.min(height, Math.ceil(Math.max(box.y1, ...nearby.map(b => b.y1)) + 16)) }
  }).filter(box => (box.x1 - box.x0) * (box.y1 - box.y0) < width * height * 0.65)
}

export function columnLines(words: Word[], width: number) {
  return [0, 1].map(column => {
    const rows: { words: Word[]; center: number }[] = []
    for (const word of words.filter(word => (word.bbox.x0 + word.bbox.x1) / 2 < width / 2 === (column === 0))
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
      const center = (word.bbox.y0 + word.bbox.y1) / 2
      const row = rows.find(row => Math.abs(row.center - center) <= Math.max(5, (word.bbox.y1 - word.bbox.y0) * 0.4))
      if (row) row.words.push(word)
      else rows.push({ words: [word], center })
    }
    return rows.map(row => {
      const ordered = row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0)
      return { column, text: ordered.map(word => word.text).join(' '), words: ordered,
        bbox: { x0: Math.min(...ordered.map(word => word.bbox.x0)), y0: Math.min(...ordered.map(word => word.bbox.y0)),
          x1: Math.max(...ordered.map(word => word.bbox.x1)), y1: Math.max(...ordered.map(word => word.bbox.y1)) } }
    })
  })
}

export function keyColumnCandidates(words: Word[], width: number) {
  return columnLines(words, width).flatMap(rows => rows.flatMap(row => {
    const match = /^(\d{1,2})(?:\s*[.)])?\s+(.+)$/.exec(row.text)
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 60) return []
    // No splitting on slashes: 12/10 and 1/2 can be single accepted values.
    return [{ numberCandidate: Number(match[1]), answerRaw: match[2], source: row,
      confidence: Math.min(...row.words.map(word => word.confidence)), approved: false }]
  }))
}

export function visualRegions(rgba: Uint8ClampedArray, width: number, height: number, words: Word[]) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) throw Error('Invalid raster dimensions.')
  const cell = 8, columns = Math.ceil(width / cell), rows = Math.ceil(height / cell)
  const counts = new Uint16Array(columns * rows), textMask = new Uint8Array(width * height)
  for (const word of words.filter(word => word.confidence >= 45)) {
    const box = word.bbox
    for (let y = Math.max(0, Math.floor(box.y0) - 2); y < Math.min(height, box.y1 + 2); y++) {
      for (let x = Math.max(0, Math.floor(box.x0) - 2); x < Math.min(width, box.x1 + 2); x++) textMask[y * width + x] = 1
    }
  }
  for (let y = Math.floor(height * 0.025); y < height * 0.975; y++) for (let x = Math.floor(width * 0.025); x < width * 0.975; x++) {
    const offset = y * width + x, pixel = offset * 4
    if (!textMask[offset] && rgba[pixel + 3] > 128 && Math.min(rgba[pixel], rgba[pixel + 1], rgba[pixel + 2]) < 150) {
      counts[Math.floor(y / cell) * columns + Math.floor(x / cell)]++
    }
  }
  // One-cell dilation joins chart axes and nearby strokes, while word pixels are masked.
  const occupied = new Uint8Array(counts.length)
  for (let i = 0; i < counts.length; i++) if (counts[i] >= 4) {
    const x = i % columns, y = Math.floor(i / columns)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < columns && y + dy >= 0 && y + dy < rows) occupied[(y + dy) * columns + x + dx] = 1
    }
  }
  const components: Box[] = []
  for (let i = 0; i < occupied.length; i++) if (occupied[i]) {
    const queue = [i]; occupied[i] = 0
    let x0 = columns, x1 = 0, y0 = rows, y1 = 0
    for (let k = 0; k < queue.length; k++) {
      const x = queue[k] % columns, y = Math.floor(queue[k] / columns)
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy, next = ny * columns + nx
        if (nx >= 0 && nx < columns && ny >= 0 && ny < rows && occupied[next]) { occupied[next] = 0; queue.push(next) }
      }
    }
    if ((x1 - x0) * cell < 70 || (y1 - y0) * cell < 55) continue
    components.push({ x0: Math.max(0, x0 * cell - 10), y0: Math.max(0, y0 * cell - 10),
      x1: Math.min(width, (x1 + 1) * cell + 10), y1: Math.min(height, (y1 + 1) * cell + 10) })
  }
  const candidates = components.filter(box => (box.x1 - box.x0) * (box.y1 - box.y0) < width * height * 0.65)
  return { candidates, rejectedBroadRegions: components.length - candidates.length }
}
