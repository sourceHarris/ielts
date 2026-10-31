import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, Mic, Square, ShieldCheck, Download } from 'lucide-react'
import { assetUrl, emptyWork, markPrivatePractice, practiceLabels, validPrivateAttempt, validPrivateConfig, validWork, wordCount } from './privatePractice'
import type { PracticeConfig, PracticeWork, PrivateAttempt } from './privatePractice'
import type { ReadingResult } from '../reading/grading'
import { completePractice, localData } from './privateStore'
import PdfPage from './PdfPage'
import './workspaces.css'

type Loaded = { config: PracticeConfig; work: PracticeWork; resultSnapshot?: ReadingResult | null }
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

function RecordingClip({ id, part, seconds, type }: { id: string; part: number; seconds: number; type: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true, objectUrl = ''
    localData<{ blob: Blob }>('media', 'get', id).then(record => {
      if (!(record?.blob instanceof Blob)) throw Error()
      objectUrl = URL.createObjectURL(record.blob)
      if (active) setUrl(objectUrl)
      else URL.revokeObjectURL(objectUrl)
    }).catch(() => { if (active) setError('This recording could not be loaded.') })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])
  return <div className="recording-clip"><strong>Part {part} · {clock(Math.round(seconds))}</strong>
    {url && <audio controls src={url} preload="metadata" aria-label={`Part ${part} recording`} />}
    {error && <p role="alert">{error}</p>}
    {url && <a href={url} download={`speaking-part-${part}.${type.includes('mp4') ? 'm4a' : 'webm'}`} className="text-link">Download recording</a>}
  </div>
}

export default function PracticeWorkspace({ id, review = false }: { id: string; review?: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const current = useRef<Loaded | null>(null)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const [archiveState, setArchiveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [page, setPage] = useState(1)
  const [now, setNow] = useState(Date.now)
  const [task, setTask] = useState(0)
  const [part, setPart] = useState(1)
  const [audioIndex, setAudioIndex] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recordStarted, setRecordStarted] = useState(0)
  const [preparationEnd, setPreparationEnd] = useState<number | null>(null)
  const [micOpening, setMicOpening] = useState(false)
  const microphoneBusy = useRef(false)
  const unsavedRecording = useRef<{ id: string; blob: Blob; part: number; durationSeconds: number; type: string } | null>(null)
  const [recordingSaveFailed, setRecordingSaveFailed] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const recordingDone = useRef<Promise<void>>(Promise.resolve())
  const active = useRef(true)
  const pending = useRef<Promise<unknown>>(Promise.resolve())
  const revision = useRef(0)
  const finishing = useRef(false)
  const autoFinished = useRef(false)

  useEffect(() => {
    active.current = true
    let cancelled = false
    const load = async () => {
      try {
        let data: Loaded
        if (review) {
          const attempt = await localData<PrivateAttempt | undefined>('attempts', 'get', id)
          if (!validPrivateAttempt(attempt)) throw Error('This saved attempt was not found or could not be verified. It has not been changed.')
          data = attempt
        } else {
          const config = await localData<PracticeConfig | undefined>('configs', 'get', id)
          if (!validPrivateConfig(config)) throw Error('This test setup could not be verified. Review the source before starting.')
          const work = await localData<PracticeWork | undefined>('work', 'get', id)
          const archived = work?.submittedAt && work.startedAt ? await localData<PrivateAttempt | undefined>('attempts', 'get', `${id}:${work.startedAt}`) : undefined
          if (archived && !validPrivateAttempt(archived)) throw Error('The saved result could not be verified. It has not been changed.')
          data = archived ?? { config, work: work ?? emptyWork(id) }
        }
        if (!validWork(data.work, data.config.id) || !data.config.book?.assetId) throw Error('The saved session could not be verified. It has not been changed.')
        if (!cancelled) {
          current.current = data; setLoaded(data); setPage(data.config.firstPage)
          setArchiveState(data.work.submittedAt ? 'saved' : 'idle')
        }
      } catch (error) { if (!cancelled) setError((error as Error).message) }
    }
    void load()
    return () => { cancelled = true; active.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()) }
  }, [id, review])

  const apply = useCallback((work: PracticeWork) => {
    if (!current.current) return
    const data = { config: current.current.config, work }
    current.current = data; setLoaded(data); setSaveState('saving')
    const number = ++revision.current
    pending.current = pending.current.catch(() => {}).then(() => localData('work', 'put', work))
    void pending.current.then(() => { if (active.current && number === revision.current) setSaveState('saved') })
      .catch(() => { if (active.current && number === revision.current) setSaveState('failed') })
  }, [])

  const stopRecording = useCallback(async () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    await recordingDone.current
    if (unsavedRecording.current) throw Error('Your recording is not saved yet. Retry saving the recording before finishing.')
  }, [])

  const finish = useCallback(async () => {
    if (finishing.current || review || !current.current?.work.startedAt) return
    finishing.current = true; setArchiveState('saving'); setError('')
    try {
      await stopRecording()
      await pending.current.catch(() => {})
      const data = current.current!
      const work = { ...data.work, submittedAt: data.work.submittedAt ?? Date.now() }
      current.current = { ...data, work }; setLoaded(current.current)
      const saved = await completePractice(data.config, work)
      current.current = saved; setLoaded(saved); setArchiveState('saved'); setSaveState('saved')
    } catch (error) { setArchiveState('failed'); setError((error as Error).message) }
    finally { finishing.current = false }
  }, [review, stopRecording])

  const work = loaded?.work, config = loaded?.config
  const remaining = config && work?.startedAt ? Math.max(0, Math.ceil((work.startedAt + config.durationMinutes * 60_000 - now) / 1000)) : (config?.durationMinutes ?? 0) * 60
  useEffect(() => {
    if (!work?.startedAt || work.submittedAt || review) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [work?.startedAt, work?.submittedAt, review])
  useEffect(() => {
    if (!review && work?.startedAt && !work.submittedAt && remaining === 0 && !autoFinished.current) {
      autoFinished.current = true; void finish()
    }
  }, [remaining, review, work?.startedAt, work?.submittedAt, finish])
  useEffect(() => {
    if (recording && part === 2 && now - recordStarted >= 120_000) void stopRecording().catch(error => setError(error.message))
  }, [recording, part, now, recordStarted, stopRecording])
  useEffect(() => {
    if (saveState === 'saved' && archiveState !== 'saving' && archiveState !== 'failed' && !recording && !recordingSaveFailed) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState, archiveState, recording, recordingSaveFailed])

  async function record() {
    if (microphoneBusy.current || recorder.current?.state === 'recording' || unsavedRecording.current) return
    if (!current.current || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError('Microphone recording is unavailable in this browser. Use a supported browser on localhost.'); return }
    try {
      microphoneBusy.current = true; setMicOpening(true)
      setError('')
      const capture = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!active.current || current.current.work.submittedAt ||
          Date.now() >= current.current.work.startedAt! + current.current.config.durationMinutes * 60_000) {
        capture.getTracks().forEach(track => track.stop()); return
      }
      stream.current = capture
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const device = new MediaRecorder(capture, mimeType ? { mimeType } : undefined)
      recorder.current = device
      const chunks: BlobPart[] = [], startedAt = Date.now(), recordingPart = part
      device.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recordingDone.current = new Promise(resolve => {
        device.onstop = async () => {
          const durationSeconds = (Date.now() - startedAt) / 1000
          capture.getTracks().forEach(track => track.stop())
          setRecording(false)
          setSaveState('saving')
          try {
            const blob = new Blob(chunks, { type: device.mimeType })
            if (!blob.size) throw Error('The recording was empty. Please check your microphone and try again.')
            const recordingId = crypto.randomUUID()
            unsavedRecording.current = { id: recordingId, blob, part: recordingPart, durationSeconds, type: device.mimeType }
            await localData('media', 'add', { id: recordingId, blob })
            const session = current.current!.work
            apply({ ...session, recordings: [...session.recordings, { id: recordingId, part: recordingPart, durationSeconds, type: device.mimeType }] })
            unsavedRecording.current = null; setRecordingSaveFailed(false)
          } catch (error) { setError((error as Error).message); setSaveState('failed'); setRecordingSaveFailed(true) }
          finally { resolve() }
        }
      })
      device.onerror = () => { setError('Recording was interrupted. Check the saved playback before continuing.'); capture.getTracks().forEach(track => track.stop()) }
      device.start(); setRecording(true); setRecordStarted(startedAt); setNow(startedAt)
    } catch { stream.current?.getTracks().forEach(track => track.stop()); setError('Microphone access failed. Allow microphone access in your browser and try again.') }
    finally { microphoneBusy.current = false; setMicOpening(false) }
  }

  if (!loaded || !config || !work) return <div className="page-section"><a className="back-link" href="#/practice">All practice</a><h1>{error ? 'Test unavailable' : 'Opening your workspace...'}</h1>{error && <p role="alert">{error}</p>}</div>
  const locked = review || work.submittedAt !== null || archiveState === 'saving' || remaining === 0
  const objective = config.skill === 'reading' || config.skill === 'listening'
  const result = objective && work.submittedAt ? loaded.resultSnapshot ?? (review ? null : markPrivatePractice(config, work.answers)) : null

  function exportWriting() {
    const url = URL.createObjectURL(new Blob([`${config!.title}\n\nTask 1\n${work!.essays[0]}\n\nTask 2\n${work!.essays[1]}`], { type: 'text/plain' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `writing-test-${config!.testNumber}.txt`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="page-section workspace-page">
    <a className="back-link" href={review ? '#/progress' : '#/practice'}><ArrowLeft size={16} />{review ? 'Back to progress' : 'All practice'}</a>
    <header className="workspace-header"><div><p className="eyebrow">{practiceLabels[config.skill].toUpperCase()} · PRIVATE PRACTICE</p><h1>{config.title}</h1>
      <p className="workspace-muted">Original source pages {config.firstPage}–{config.lastPage} · {review ? 'Saved attempt · read only' : 'Practice mode'}</p></div>
      <div className="workspace-clock" role="timer"><Clock3 size={19} />{work.submittedAt ? 'Finished' : clock(remaining)}</div></header>
    {error && <p role="alert" className="session-error">{error}</p>}
    {!work.startedAt && !review && <section className="workspace-start"><div><h2>Make room for focused practice.</h2><p>Your timer begins when you start. Answers and writing stay in this browser.</p></div>
      <button className="button button-primary" onClick={() => { autoFinished.current = false; setNow(Date.now()); apply({ ...work, startedAt: Date.now() }) }}>Start {practiceLabels[config.skill].toLowerCase()} practice <ArrowRight size={17} /></button></section>}
    {work.submittedAt && <section className="workspace-result" aria-live="polite"><div><p className="eyebrow">{result ? 'ANSWER REVIEW' : 'SESSION COMPLETE'}</p>
      <h2>{result ? `${result.correct} / ${result.total} matched the reviewed key` : objective ? 'Your original answers are saved.' : config.skill === 'writing' ? 'Your writing is saved for review.' : 'Listen back. Notice what to improve.'}</h2>
      <p>{objective ? 'Raw practice result, not an official IELTS band.' : 'AI assessment is not connected. No band score has been invented.'}</p>
      {!review && <p role={archiveState === 'failed' ? 'alert' : 'status'}>{archiveState === 'saved' ? 'Saved to your private practice history.' : archiveState === 'failed' ? 'Result not archived. Keep this page open and retry.' : 'Saving your result...'}</p>}</div>
      {!review && archiveState === 'failed' && <button className="button button-secondary" onClick={() => void finish()}>Retry saving result</button>}
      {!review && archiveState === 'saved' && <button className="button button-secondary" onClick={() => {
        if (window.confirm('Start another attempt? Your completed attempt stays in history.')) { setArchiveState('idle'); autoFinished.current = false; apply(emptyWork(config.id)) }
      }}>Start another attempt</button>}</section>}
    <div className="workspace-split">
      <section className="workspace-source" aria-label="Original test material"><div className="source-toolbar"><strong>Original material</strong>
        <div><button aria-label="Previous source page" disabled={page <= config.firstPage} onClick={() => setPage(page - 1)}>←</button>
          <label>Page <input aria-label="Source page" type="number" min={config.firstPage} max={config.lastPage} value={page} onChange={event => setPage(Math.min(config.lastPage, Math.max(config.firstPage, Number(event.target.value) || config.firstPage)))} /> / {config.lastPage}</label>
          <button aria-label="Next source page" disabled={page >= config.lastPage} onClick={() => setPage(page + 1)}>→</button></div></div>
        <PdfPage assetId={config.book.assetId} page={page} title={config.book.title} />
      </section>
      <section className="workspace-sheet">
        {config.skill === 'listening' && <div className="workspace-player"><p className="eyebrow">ORIGINAL AUDIO · {audioIndex + 1} / {config.audioIds.length}</p>
          <audio key={config.audioIds[audioIndex]} controls preload="metadata" src={assetUrl(config.audioIds[audioIndex])} onError={() => setError('The original audio could not be played. Check the local library.')} />
          <div className="workspace-actions"><button className="button button-secondary" disabled={audioIndex === 0} onClick={() => setAudioIndex(audioIndex - 1)}>Previous audio</button>
            <button className="button button-secondary" disabled={audioIndex >= config.audioIds.length - 1} onClick={() => setAudioIndex(audioIndex + 1)}>Next audio</button></div>
          <small>Practice playback: pause and replay are available. Your timer continues.</small></div>}
        {objective && <><div className="workspace-section-title"><h2>{work.submittedAt ? 'Review your answers' : 'Answer sheet'}</h2><span>{Object.values(work.answers).filter(answer => answer.trim()).length}/{config.questions.length} answered</span></div>
          <div className="workspace-answer-grid">{config.questions.map((question, index) => <label key={question.number} className={result ? result.questions[index].isCorrect ? 'answer-correct' : 'answer-incorrect' : ''}>
            <strong>{question.number}</strong><input aria-label={`Question ${question.number}`} value={work.answers[String(question.number)] ?? ''} disabled={locked || !work.startedAt}
              onChange={event => apply({ ...work, answers: { ...work.answers, [question.number]: event.target.value } })} />
            {result && <small>{result.questions[index].isCorrect ? 'Correct' : 'Answer: ' + question.accepted.join(' / ')}{question.maxWords && !result.questions[index].isCorrect ? ` · limit ${question.maxWords} words` : ''}</small>}
          </label>)}</div></>}
        {config.skill === 'writing' && <><div className="workspace-tabs" role="group" aria-label="Writing task">{[0, 1].map(index => <button key={index} aria-pressed={task === index} onClick={() => setTask(index)}>Task {index + 1}{' '}<small>{wordCount(work.essays[index])} words</small></button>)}</div>
          <div className="workspace-section-title"><h2>Writing Task {task + 1}</h2><span>{task === 0 ? '150' : '250'} words minimum</span></div>
          <textarea className="essay-editor" aria-label={`Writing Task ${task + 1} response`} value={work.essays[task]} disabled={locked || !work.startedAt}
            placeholder="Read the original task on the left. Write your response here."
            onChange={event => { const essays: [string, string] = [...work.essays]; essays[task] = event.target.value; apply({ ...work, essays }) }} />
          <div className="workspace-section-title"><span>{wordCount(work.essays[task])} words · {task === 0 ? 'Task Achievement' : 'Task Response'}, coherence, vocabulary, grammar</span>
            <button className="text-link" onClick={exportWriting}><Download size={15} />Export writing</button></div></>}
        {config.skill === 'speaking' && <><div className="workspace-tabs" role="group" aria-label="Speaking part">{[1, 2, 3].map(value => <button key={value} disabled={recording || micOpening} aria-pressed={part === value} onClick={() => setPart(value)}>Part {value}</button>)}</div>
          <h2>{part === 1 ? 'Introduce yourself. Keep it natural.' : part === 2 ? 'Prepare. Then keep talking.' : 'Develop your ideas.'}</h2>
          <p className="workspace-muted">Use the original speaking prompts on the left. Your microphone is used only when you press Record.</p>
          {part === 2 && <div className="workspace-actions"><button className="button button-secondary" disabled={locked || !work.startedAt || recording || micOpening} onClick={() => setPreparationEnd(Date.now() + 60_000)}>One-minute preparation</button>
            {preparationEnd && <span role="timer">{clock(Math.max(0, Math.ceil((preparationEnd - now) / 1000)))} preparation</span>}</div>}
          <div className={`recorder-panel ${recording ? 'is-recording' : ''}`}><Mic size={32} aria-hidden="true" /><strong>{recording ? `Recording Part ${part} · ${clock(Math.max(0, Math.floor((now - recordStarted) / 1000)))}` : 'Ready when you are.'}</strong>
            {recording ? <button className="button button-primary" onClick={() => void stopRecording().catch(error => setError(error.message))}><Square size={16} />Stop recording</button>
              : <button className="button button-primary" disabled={locked || !work.startedAt || micOpening || recordingSaveFailed} onClick={() => void record()}><Mic size={16} />{micOpening ? 'Connecting microphone...' : `Record Part ${part}`}</button>}
            <small>Part 2 recordings stop after two minutes. Playback stays private.</small></div>
          {recordingSaveFailed && <div role="alert"><p>The recording is still in memory and has not been saved. Keep this page open.</p><button className="button button-secondary" onClick={async () => {
            const captured = unsavedRecording.current
            if (!captured) return
            try {
              await localData('media', 'put', { id: captured.id, blob: captured.blob })
              const { blob: _blob, ...metadata } = captured
              apply({ ...current.current!.work, recordings: [...current.current!.work.recordings, metadata] })
              unsavedRecording.current = null; setRecordingSaveFailed(false); setError('')
            } catch { setError('Recording is not saved. Restore storage access and try again.') }
          }}>Retry saving recording</button></div>}
          <label className="workspace-notes">Preparation notes<textarea value={work.notes} disabled={locked || !work.startedAt} onChange={event => apply({ ...work, notes: event.target.value })} /></label>
          {work.recordings.map(clip => <RecordingClip key={clip.id} id={clip.id} part={clip.part} seconds={clip.durationSeconds} type={clip.type} />)}</>}
        <div className="workspace-save"><ShieldCheck size={16} /><span role="status">{review ? 'Read-only saved attempt' : recording ? 'Recording in progress — stop to save audio' : recordingSaveFailed ? 'Recording not saved. Keep this page open.' : saveState === 'saved' ? 'Saved in this browser' : saveState === 'saving' ? 'Saving...' : 'Changes are not saved. Keep this page open.'}</span>
          {!review && saveState === 'failed' && !recordingSaveFailed && <button className="text-link" onClick={() => apply(work)}>Retry save</button>}</div>
        {!review && work.startedAt && !work.submittedAt && <button className="button button-primary workspace-submit" disabled={archiveState === 'saving' || micOpening || recordingSaveFailed} onClick={() => {
          if (window.confirm(objective ? 'Finish and check your answers against the reviewed key?' : 'Finish this session and save it for review?')) void finish()
        }}>{archiveState === 'saving' ? 'Saving...' : objective ? 'Finish and check answers' : 'Finish and save session'}<ArrowRight size={17} /></button>}
      </section>
    </div>
  </div>
}
