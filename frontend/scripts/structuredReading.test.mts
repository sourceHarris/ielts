import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeStructuredTest, validStructuredTest } from '../src/reading/structuredTest.ts'
import type { ReadingGroup, StructuredReadingTest } from '../src/reading/structuredTest.ts'
import type { ReadingQuestion } from '../src/reading/types.ts'
import { readDraft, saveDraft, draftKey } from '../src/reading/sessionStorage.ts'
import { readCuratedImage, readCuratedTest } from '../server/curatedReading.ts'

// Entirely synthetic QA text/keys. Publisher content stays in private-content/.
function fixture(): StructuredReadingTest {
  const letters = ['A','B','C','D','E','F','G','H'].map(value => ({ value, label: `QA option ${value}` }))
  const bank = [{ value: 'alpha', label: 'alpha' }, { value: 'beta', label: 'beta' }]
  const yn = ['YES','NO','NOT GIVEN'].map(value => ({ value, label: value }))
  const questions: ReadingQuestion[] = Array.from({ length: 40 }, (_, i) => ({ id: `qa-q${i + 1}`, number: i + 1,
    type: 'short', prompt: `Original QA question ${i + 1}`, correctAnswers: ['alpha'], explanation: '' }))
  for (const q of questions) {
    if (q.number <= 8) q.options = bank
    else if (q.number >= 16 && q.number <= 22) { q.type = 'choice'; q.options = yn; q.correctAnswers = ['YES'] }
    else if ((q.number >= 9 && q.number <= 28) || q.number >= 36) { q.type = 'choice'; q.options = letters; q.correctAnswers = ['A'] }
    if (q.number >= 26 && q.number <= 28) q.correctAnswers = ['A','C','E']
  }
  const group = (id: string, kind: ReadingGroup['kind'], first: number, last: number): ReadingGroup => ({ id, kind,
    heading: `QA ${first}-${last}`, numbers: Array.from({ length: last - first + 1 }, (_, i) => first + i), instructions: ['QA instruction'] })
  return { schemaVersion: 1, reviewStatus: 'source-compared', sourceAssetId: 'a'.repeat(64), id: 'qa-structured-v1', title: 'Original QA test', durationMinutes: 60,
    passages: [
      { id:'qa-p1', title:'QA passage one', instruction:'QA timing', paragraphs:['Original QA paragraph.'], questions: questions.slice(0,15), groups:[
        { ...group('qa-g1','summary',1,8), options:bank, text:[Array.from({length:8},(_,i)=>`QA ... (${i+1}) ...`).join(' ')] },
        { ...group('qa-g2','matching',9,15), options:letters },
      ] },
      { id:'qa-p2', title:'QA passage two', instruction:'QA timing', paragraphs:['Original QA paragraph two.'], questions: questions.slice(15,28), groups:[
        group('qa-g3','yes-no-not-given',16,22), group('qa-g4','choice',23,25), { ...group('qa-g5','multi-select',26,28), options:letters },
      ] },
      { id:'qa-p3', title:'QA passage three', instruction:'QA timing', paragraphs:['Original QA paragraph three.'], questions: questions.slice(28), groups:[
        { ...group('qa-g6','table',29,35), maxWords:3, columns:['QA label','QA answer'], rows:Array.from({length:7},(_,i)=>['QA row',`... (${i+29}) ...`]) },
        { ...group('qa-g7','matching',36,40), options:letters },
      ] },
    ] }
}
function correctAnswers(source: StructuredReadingTest) {
  const answers = Object.fromEntries(source.passages.flatMap(p => p.questions).map(q => [q.id,q.correctAnswers[0]]))
  Object.assign(answers, { 'qa-q26':'E','qa-q27':'A','qa-q28':'C' })
  return answers
}

test('accepts a complete structured paper and marks all forty answers', () => {
  const source = fixture()
  assert.equal(validStructuredTest(source), true)
  assert.equal(gradeStructuredTest(source,correctAnswers(source)).correct,40)
})
test('any-order credit counts each selected letter once without changing answers', () => {
  const source=fixture(), answers=correctAnswers(source)
  Object.assign(answers, {'qa-q26':'A','qa-q27':'A','qa-q28':'A'})
  const before=structuredClone(answers)
  assert.equal(gradeStructuredTest(source,answers).correct,38)
  assert.deepEqual(answers,before)
})
test('wrong, blank and out-of-list group selections never earn credit', () => {
  const source=fixture(), answers=correctAnswers(source)
  Object.assign(answers, {'qa-q26':'D','qa-q27':'','qa-q28':'not a choice'})
  const result=gradeStructuredTest(source,answers)
  assert.equal(result.correct,37)
  assert.equal(result.unanswered,1)
})
test('table word limits reject overlong responses but count hyphenated words as one', () => {
  const source=fixture(), q=source.passages[2].questions[0]
  q.correctAnswers=['red blue green yellow','red-blue green yellow']
  assert.equal(gradeStructuredTest(source,{[q.id]:'red blue green yellow'}).questions[28].isCorrect,false)
  assert.equal(gradeStructuredTest(source,{[q.id]:'red-blue green yellow'}).questions[28].isCorrect,true)
})
test('all printed key alternatives remain distinct and normalization does not invent a spelling', () => {
  const source=fixture(), q=source.passages[2].questions[0]
  q.correctAnswers=['source spellng','other printed alternative']
  assert.equal(gradeStructuredTest(source,{[q.id]:' SOURCE SPELLNG. '}).questions[28].isCorrect,true)
  assert.equal(gradeStructuredTest(source,{[q.id]:'source spelling'}).questions[28].isCorrect,false)
})
test('matching may reuse options without the Matching Headings uniqueness rule', () => {
  const source=fixture(), answers=correctAnswers(source)
  assert.equal(gradeStructuredTest(source,answers).correct,40)
  const raw=JSON.stringify({startedAt:1000,submitted:false,answers:{9:'A',10:'A',36:'A',37:'A'}})
  const store={getItem:()=>raw,setItem:()=>assert.fail('read must not write'),removeItem:()=>assert.fail('read must not clear')}
  const result=readDraft(source,2000,store)
  assert.equal(result.kind,'valid')
  if(result.kind==='valid') assert.deepEqual(Object.values(result.draft.answers),['A','A','A','A'])
})
const corruptions: [string,(source: StructuredReadingTest)=>void][] = [
  ['unreviewed extraction',source=>{ source.reviewStatus='needs-review' as never }],
  ['wrong question count',source=>{ source.passages[2].questions.pop() }],
  ['duplicate question ID',source=>{ source.passages[1].questions[0].id=source.passages[0].questions[0].id }],
  ['missing question group',source=>{ source.passages[0].groups.pop() }],
  ['wrong inline number',source=>{ source.passages[0].groups[0].text=['QA ... (9) ...'] }],
  ['missing table blank',source=>{ source.passages[2].groups[0].rows![0][1]='QA no blank' }],
  ['duplicate option IDs',source=>{ source.passages[0].groups[0].options=[{value:'A',label:'QA'},{value:'A',label:'duplicate'}] }],
  ['missing radio options',source=>{ delete source.passages[1].questions[0].options }],
  ['invalid shading',source=>{ source.passages[2].groups[0].shadedCells=[[99,99]] }],
  ['arbitrary image path',source=>{ source.passages[0].image={assetId:'../../private-file',alt:'QA'} }],
]
for(const [label,damage] of corruptions) test(`blocks malformed structured content: ${label}`,()=>{ const source=fixture();damage(source);assert.equal(validStructuredTest(source),false) })

test('new paper drafts use the shared storage contract and cannot touch another test', () => {
  const source=fixture(), values=new Map<string,string>([['unrelated-test','leave unchanged']])
  const store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}}
  const draft={startedAt:1000,submitted:false,answers:correctAnswers(source)}
  assert.equal(saveDraft(source,draft,2000,store).kind,'ok')
  assert.equal(readDraft(source,2000,store).kind,'valid')
  assert.equal(values.get('unrelated-test'),'leave unchanged')
  values.set(draftKey(source),'{broken')
  assert.equal(saveDraft(source,draft,2000,store).kind,'invalid')
  assert.equal(values.get(draftKey(source)),'{broken')
})
test('curated provider rejects unknown test IDs and image traversal before reading files', async () => {
  assert.equal(await readCuratedTest('../../source'),null)
  assert.equal(await readCuratedImage('../../source'),null)
})
