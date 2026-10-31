// Local-only extraction. Source documents stay in place; outputs are Git-ignored.
import { readdir, readFile, mkdir, writeFile, rename, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, relative, join, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const args = process.argv.slice(2)
const sourceArg = args[args.indexOf('--source') + 1]
if (!args.includes('--source') || !sourceArg) throw Error('Usage: node scripts/import-private.mjs --source <directory> [--ocr]')
const root = resolve(sourceArg)
const output = resolve('../private-content')
await mkdir(join(output, 'pages'), { recursive: true })
await mkdir(join(output, 'ocr-cache'), { recursive: true })
await mkdir(join(output, 'assets'), { recursive: true })
const paths = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (['.pdf', '.mp3', '.wav', '.m4a'].includes(extname(path).toLowerCase())) paths.push(path)
  }
}
await walk(root)
const assets = []
for (const path of paths) {
  const id = createHash('sha256').update(await readFile(path)).digest('hex')
  const cached = join(output, 'assets', id + extname(path).toLowerCase())
  try { await copyFile(path, cached, constants.COPYFILE_EXCL) } catch (error) { if (error.code !== 'EEXIST') throw error }
  if (assets.some(asset => asset.id === id)) continue
  assets.push({
  id, path: cached, name: basename(path), type: extname(path).toLowerCase() === '.pdf' ? 'pdf' : 'audio',
  // Relative paths help match sectioned audio without sending absolute paths to the UI.
  label: relative(root, path).replaceAll('\\', '/'),
  })
}
let old = {}
try { old = JSON.parse(await readFile(join(output, 'catalog.local.json'), 'utf8')) } catch { /* First import. */ }
const archiveAssets = [...(old.archiveAssets ?? []), ...(old.assets ?? [])]
  .filter(asset => /^[a-f0-9]{64}$/.test(asset.id) && asset.path.startsWith(join(output, 'assets')) && !assets.some(current => current.id === asset.id))
const catalog = { schemaVersion: 1, sourceRoot: root, assets,
  archiveAssets: [...new Map(archiveAssets.map(asset => [asset.id, asset])).values()],
  books: (old.books ?? []).filter(book => assets.some(asset => asset.id === book.id)) }
async function saveCatalog() {
  const file = join(output, 'catalog.local.json')
  await writeFile(file + '.tmp', JSON.stringify(catalog))
  await rename(file + '.tmp', file)
}
await saveCatalog()
let workers = [], canvas
if (args.includes('--ocr')) {
  const { createWorker } = await import('tesseract.js')
  canvas = (await import('@napi-rs/canvas')).createCanvas
  workers = await Promise.all(Array.from({ length: 3 }, () => createWorker('eng', 1, {
    cachePath: join(output, 'ocr-cache'),
  })))
}
try {
  for (const asset of assets.filter(item => item.type === 'pdf')) {
    const bytes = await readFile(asset.path)
    const fingerprint = createHash('sha256').update(bytes).digest('hex')
    const pageFile = join(output, 'pages', asset.id + '.local.json')
    let previous
    try { previous = JSON.parse(await readFile(pageFile, 'utf8')) } catch { /* Not yet extracted. */ }
    const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true })
    const pdf = await task.promise
    const pages = previous?.fingerprint === fingerprint ? previous.pages : []
    for (let start = 1; start <= pdf.numPages; start += 3) {
      await Promise.all(Array.from({ length: Math.min(3, pdf.numPages - start + 1) }, async (_, offset) => {
        const number = start + offset
        if (pages[number - 1]?.text?.trim().length > 40) return
        const page = await pdf.getPage(number)
        const content = await page.getTextContent()
        let text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('')
        let method = 'text', confidence = null
        if (text.trim().length < 40 && workers.length) {
          const viewport = page.getViewport({ scale: 2 })
          const image = canvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
          await page.render({ canvasContext: image.getContext('2d'), viewport }).promise
          const result = await workers[offset].recognize(image.toBuffer('image/png'))
          text = result.data.text
          confidence = result.data.confidence
          method = 'ocr'
        } else if (!text.trim()) method = 'scan'
        pages[number - 1] = { page: number, text, method, confidence }
        page.cleanup()
      }))
      await writeFile(pageFile, JSON.stringify({ fingerprint, pages }))
      if (workers.length) console.log(`${asset.name}: ${Math.min(start + 2, pdf.numPages)}/${pdf.numPages}`)
    }
    const book = {
      id: asset.id, assetId: asset.id, title: basename(asset.name, '.pdf'), fingerprint,
      pages: pdf.numPages, extractedPages: pages.filter(page => page?.text?.trim().length > 40).length,
      status: 'needs-review',
    }
    catalog.books = [...catalog.books.filter(item => item.id !== book.id), book]
    await saveCatalog()
    await task.destroy()
    console.log(`Indexed ${book.title}: ${book.pages} pages; ${book.extractedPages} text pages. Review required.`)
  }
} finally {
  await Promise.all(workers.map(worker => worker.terminate()))
}
console.log(`Private catalog: ${catalog.books.length} PDFs, ${assets.filter(asset => asset.type === 'audio').length} audio files. Nothing uploaded.`)
await import('./index-private.mjs')
