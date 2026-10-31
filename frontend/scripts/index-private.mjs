import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { detectSections } from './sourceSections.mts'
const directory = resolve('../private-content')
const file = join(directory, 'catalog.local.json')
const catalog = JSON.parse(await readFile(file, 'utf8'))
let overrides = {}
try { overrides = JSON.parse(await readFile(join(directory, 'review-overrides.local.json'), 'utf8')) } catch { /* No manually checked suggestions yet. */ }
for (const book of catalog.books) {
  const document = JSON.parse(await readFile(join(directory, 'pages', book.id + '.local.json'), 'utf8'))
  const fallback = /-([1-4])$/.exec(book.title)
  book.sections = detectSections(document.pages, fallback ? Number(fallback[1]) : null)
  if (overrides[book.fingerprint]) {
    for (const section of overrides[book.fingerprint]) {
      book.sections = book.sections.filter(existing => existing.skill !== section.skill || existing.testNumber !== section.testNumber)
      book.sections.push(section)
    }
  }
}
await writeFile(file + '.tmp', JSON.stringify(catalog))
await rename(file + '.tmp', file)
console.log(`Indexed ${catalog.books.reduce((count, book) => count + book.sections.length, 0)} source section candidates. Human review is required before activation.`)
