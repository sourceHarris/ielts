import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { assetUrl } from './privatePractice'

GlobalWorkerOptions.workerSrc = workerUrl

export default function PdfPage({ assetId, page, title }: { assetId: string; page: number; title: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [renderedPage, setRenderedPage] = useState<number | null>(null)
  const [largeImage, setLargeImage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let active = true
    const task = getDocument({ url: assetUrl(assetId) })
    task.promise.then(pdf => { if (active) setDocument(pdf) }).catch(() => { if (active) setError('The source PDF could not be opened. Check that the local library is available.') })
    return () => { active = false; void task.destroy() }
  }, [assetId])
  useEffect(() => {
    if (!document) return
    let active = true
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    document.getPage(page).then(async source => {
      if (!active || !canvas.current) return
      const viewport = source.getViewport({ scale: 1.5 })
      canvas.current.width = viewport.width
      canvas.current.height = viewport.height
      render = source.render({ canvas: canvas.current, viewport })
      await render.promise
      if (active) { setRenderedPage(page); setError('') }
    }).catch(error => { if (active && error?.name !== 'RenderingCancelledException') setError('This page could not be rendered.') })
    return () => { active = false; render?.cancel() }
  }, [document, page])
  return <div className="source-document">
    {error && <p role="alert">{error}</p>}
    {!document && !error && <p role="status">Opening your source document...</p>}
    <canvas ref={canvas} role="img" aria-label={`${title}, source page ${page}`} />
    <button type="button" className="button button-secondary document-enlarge" disabled={renderedPage !== page} onClick={() => {
      if (!canvas.current) return
      setLargeImage(canvas.current.toDataURL('image/png')); dialog.current?.showModal()
    }}>Enlarge original page</button>
    <dialog ref={dialog} className="document-dialog" aria-label={`${title}, enlarged source page ${page}`} onClose={() => setLargeImage('')}>
      <button type="button" className="button button-secondary" onClick={() => dialog.current?.close()}>Close large view</button>
      {largeImage && <img src={largeImage} alt={`${title}, original source page ${page}`} />}
    </dialog>
    <details key={`${assetId}:${page}`} onToggle={event => {
      if (!event.currentTarget.open) return
      setText(null)
      fetch(`/api/private/books/${assetId}/pages/${page}`).then(response => response.ok ? response.json() : Promise.reject())
        .then(result => setText(result.text || 'This page has no extracted text yet.'))
        .catch(() => setText('Extracted text is not available for this page.'))
    }}>
      <summary>Read extracted text</summary>
      <p className="workspace-muted">OCR may contain mistakes. Check the original page above.</p>
      <pre className="source-text">{text ?? 'Loading text...'}</pre>
    </details>
  </div>
}
