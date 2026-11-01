import { readFile, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve } from 'node:path'
import { CURATED_READING_SLUG, validStructuredTest } from '../src/reading/structuredTest.ts'

const directory = resolve(import.meta.dirname, '../../private-content/curated-reading')

async function containedFile(name: string) {
  const base = await realpath(directory), actual = await realpath(resolve(base, name)), inside = relative(base, actual)
  if (inside.startsWith('..') || isAbsolute(inside)) throw Error('Curated asset outside local content directory')
  return readFile(actual)
}

export async function readCuratedTest(slug: string) {
  if (slug !== CURATED_READING_SLUG) return null
  const registry = JSON.parse((await containedFile('index.local.json')).toString('utf8'))
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.tests)) throw Error('Invalid local test registry')
  const entries = registry.tests.filter((entry: { slug?: string }) => entry?.slug === slug)
  if (entries.length !== 1) throw Error('Missing or conflicting local test entry')
  const entry = entries[0]
  if (!/^[a-f0-9]{64}\.json$/.test(entry.file) || entry.file !== `${entry.sha256}.json`) throw Error('Invalid local test fingerprint')
  const bytes = await containedFile(entry.file)
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error('Local test bytes changed')
  const test: unknown = JSON.parse(bytes.toString('utf8'))
  if (!validStructuredTest(test) || test.id !== entry.id) throw Error('Invalid structured Reading test')
  return test
}

export async function readCuratedImage(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) return null
  const test = await readCuratedTest(CURATED_READING_SLUG)
  if (!test?.passages.some(passage => passage.image?.assetId === id)) return null
  const bytes = await containedFile(`assets/${id}.png`)
  if (createHash('sha256').update(bytes).digest('hex') !== id) throw Error('Local image bytes changed')
  return bytes
}
