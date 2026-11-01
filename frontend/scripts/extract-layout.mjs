// Layout OCR and original raster crops remain local. Existing OCR caches are untouched.
import { readFile, mkdir, writeFile, access, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { createWorker } from 'tesseract.js'
import { discoverTests } from './discoverTests.mts'
import { consolidateVisuals, keyColumnCandidates, visualRegions } from './extractionLayout.mts'

const root = fileURLToPath(new URL('../../private-content/', import.meta.url))
const args = process.argv.slice(2)
if (args.some(arg => !/^--(?:limit=\d+|book=\d+|refine)$/.test(arg))) throw Error('Usage: node scripts/extract-layout.mjs [--limit=10] [--book=6] [--refine]')
const refine = args.includes('--refine')
const directory = join(root, refine ? 'layout-v3' : 'layout-v2'), cropDirectory = join(directory, 'crops')
await mkdir(cropDirectory, { recursive: true })
const catalog = JSON.parse(await readFile(join(root, 'catalog.local.json'), 'utf8'))
const limit = Number(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? Infinity)
const selectedBook = Number(args.find(arg => arg.startsWith('--book='))?.split('=')[1] ?? 0)
const workers = refine ? [] : await Promise.all(Array.from({ length: 3 }, () => createWorker('eng', 1, { cachePath: join(root, 'ocr-cache'), cacheMethod: 'readOnly' })))
let processed = 0, reused = 0
try {
  for (const book of catalog.books) {
    const cached = JSON.parse(await readFile(join(root, 'pages', `${book.id}.local.json`), 'utf8'))
    const discovery = discoverTests(book.id, book.title, cached.pages)
    if (discovery.plan.role === 'transcript' || (selectedBook && discovery.plan.bookNumber !== selectedBook)) continue
    const scopes = discovery.plan.tests.flatMap(test => Object.entries(test.modules).map(([module, scope]) => ({ test, module, scope })))
    const keys = new Set(scopes.flatMap(({ scope }) => scope.keyPages ?? []))
    const selected = [...new Set(scopes.flatMap(({ module, scope }) => module === 'speaking' ? [] : [...scope.pages, ...(scope.keyPages ?? [])]))]
      .sort((a, b) => Number(keys.has(b)) - Number(keys.has(a)) || a - b)
    const asset = catalog.assets.find(asset => asset.id === book.id && asset.type === 'pdf')
    const path = await realpath(asset.path), inside = relative(await realpath(join(root, 'assets')), path)
    if (isAbsolute(inside) || inside.startsWith('..')) throw Error('Private asset escaped cache.')
    const bytes = await readFile(path)
    if (createHash('sha256').update(bytes).digest('hex') !== book.id || cached.fingerprint !== book.id) throw Error('Source hash mismatch.')
    const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true,
      standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\', '/') })
    const pdf = await loading.promise
    const bookDirectory = join(directory, book.id)
    await mkdir(bookDirectory, { recursive: true })
    for (let start = 0; start < selected.length && processed < limit; start += 3) {
      await Promise.all(selected.slice(start, start + Math.min(3, limit - processed)).map(async (number, slot) => {
        const destination = join(bookDirectory, `${number}.json`)
        try {
          const old = JSON.parse(await readFile(destination, 'utf8'))
          if (old.sourceAssetId !== book.id || old.page !== number || old.schemaVersion !== 1) throw Error('Invalid existing layout cache.')
          for (const crop of old.visuals) await access(join(cropDirectory, `${crop.sha256}.png`))
          reused++; return
        } catch (error) { if (error.code !== 'ENOENT') throw error }
        const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 2 })
        const image = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        const context = image.getContext('2d')
        await page.render({ canvasContext: context, viewport }).promise
        const data = refine ? JSON.parse(await readFile(join(root, 'layout-v2', book.id, `${number}.json`), 'utf8')) :
          (await workers[slot].recognize(image.toBuffer('image/png'), {}, { text: true, blocks: true })).data
        if (refine && (data.sourceAssetId !== book.id || data.page !== number || data.extractorVersion !== 'layout-v2')) throw Error('Invalid source layout for refinement.')
        const words = refine ? data.words : (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(para => para.lines.flatMap(line => line.words.map(word => ({
          text: word.text, confidence: word.confidence, bbox: word.bbox,
        })))))
        const detection = keys.has(number) ? { candidates: [], rejectedBroadRegions: 0 } : visualRegions(context.getImageData(0, 0, image.width, image.height).data, image.width, image.height, words)
        // Native embedded figures are more precise than residual-pixel detection.
        const operations = keys.has(number) ? null : await page.getOperatorList()
        let transform = [1, 0, 0, 1, 0, 0], stack = []
        if (operations) for (let i = 0; i < operations.fnArray.length; i++) {
          const fn = operations.fnArray[i], values = operations.argsArray[i]
          if (fn === OPS.save) stack.push([...transform])
          else if (fn === OPS.restore) transform = stack.pop() ?? [1, 0, 0, 1, 0, 0]
          else if (fn === OPS.transform) transform = Util.transform(transform, values)
          else if ([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(fn)) {
            const matrix = Util.transform(viewport.transform, transform)
            const points = [[0, 0], [0, 1], [1, 0], [1, 1]].map(point => { Util.applyTransform(point, matrix); return point })
            const box = { x0: Math.max(0, Math.floor(Math.min(...points.map(p => p[0])))), y0: Math.max(0, Math.floor(Math.min(...points.map(p => p[1])))),
              x1: Math.min(image.width, Math.ceil(Math.max(...points.map(p => p[0])))), y1: Math.min(image.height, Math.ceil(Math.max(...points.map(p => p[1])))) }
            const area = (box.x1 - box.x0) * (box.y1 - box.y0)
            if (area > 4000 && area < image.width * image.height * 0.65) detection.candidates.push({ ...box, nativeImage: true })
          }
        }
        const visuals = []
        const regions = refine ? consolidateVisuals(detection.candidates, words, image.width, image.height) : detection.candidates
        for (const box of regions) {
          const crop = createCanvas(box.x1 - box.x0, box.y1 - box.y0)
          crop.getContext('2d').drawImage(image, box.x0, box.y0, crop.width, crop.height, 0, 0, crop.width, crop.height)
          const png = crop.toBuffer('image/png'), sha256 = createHash('sha256').update(png).digest('hex')
          try { await writeFile(join(cropDirectory, `${sha256}.png`), png, { flag: 'wx' }) } catch (error) { if (error.code !== 'EEXIST') throw error }
          visuals.push({ sha256, bbox: box, width: crop.width, height: crop.height, detection: box.nativeImage ? 'native-image-operator' : 'non-text-pixel-region',
            questionAssociation: null, approved: false })
        }
        const output = { schemaVersion: 1, extractorVersion: refine ? 'layout-v3' : 'layout-v2', sourceAssetId: book.id, page: number,
          renderScale: 2, width: image.width, height: image.height, text: data.text, confidence: data.confidence,
          words, uncertainWords: words.filter(word => word.confidence < 80),
          keyCandidates: keys.has(number) ? keyColumnCandidates(words, image.width) : [], visuals,
          issues: ['OCR text and crop-to-question associations require source review.',
            ...(detection.rejectedBroadRegions ? [`${detection.rejectedBroadRegions} broad regions rejected; never substitute a full-page image for a question.`] : [])] }
        await writeFile(destination, JSON.stringify(output), { flag: 'wx' })
        processed++; page.cleanup()
      }))
      console.log(`${book.title}: layout through source ${selected[Math.min(start + 2, selected.length - 1)]}; processed ${processed}, reused ${reused}`)
    }
    await loading.destroy()
    if (processed >= limit) break
  }
} finally { await Promise.all(workers.map(worker => worker.terminate())) }
console.log(JSON.stringify({ processed, reused, output: directory, note: 'Original crops and OCR candidates only; no UI activation.' }))
