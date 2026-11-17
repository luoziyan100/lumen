/**
 * [INPUT]: studio/reading-question's pure parser
 * [OUTPUT]: unit evidence that a reading question splits into quote, place and words; multi-line quotes and words survive; anything that is not a question stays whole for userWords
 * [POS]: the service half of G1; the desktop half (the real MODEL_TEXT.askReading output against this parser) is in ui-client/tests/reading.test.ts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readingQuestion, userWords } from '../../src/studio/reading-question.ts'

test('readingQuestion / userWords: only the words after the place line are the user\'s', () => {
  const text = '> 第一行引文\n> 第二行引文\n— 解读《Free energy》· 2. 证据\n\n我的话\n第二行'
  assert.deepEqual(readingQuestion(text), { quote: '第一行引文 第二行引文', item: 'Free energy', section: '2. 证据', words: '我的话\n第二行' })
  assert.equal(userWords(text), '我的话\n第二行')
  // Not questions: a plain message, a Markdown quote without the place line, a place line without a quote
  for (const plain of ['普通的一句话', '> 只是引用\n\n我的话', '— 解读《x》· 1. y\n\n我的话']) {
    assert.equal(readingQuestion(plain), null)
    assert.equal(userWords(plain), plain)
  }
  // A question with no words leaves nothing for sediment to bind
  assert.equal(userWords('> 引文\n— 解读《x》· 1. y\n\n'), '')
})
