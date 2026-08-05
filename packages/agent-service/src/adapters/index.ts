/**
 * [OUTPUT]: adapters 出口(Claude/OpenAI 整包+SSE、coalesce、录制重放)
 * [POS]: ModelPort 实现层的入口
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
export {
  buildClaudeRequest,
  parseClaudeResponse,
  createFetchTransport,
  createClaudeStreamFetchTransport,
  createClaudeAdapter,
  type ClaudeTransport,
  type ClaudeStreamTransport,
  type ClaudeRequest,
  type ClaudeResponseBody,
  type ClaudeAdapterOptions,
  type FetchTransportOptions,
} from './claude.ts'
export {
  buildOpenAIRequest,
  parseOpenAIResponse,
  createOpenAIFetchTransport,
  createOpenAIStreamFetchTransport,
  createOpenAIAdapter,
  type OpenAITransport,
  type OpenAIStreamTransport,
} from './openai.ts'
export { createTextDeltaCoalescer } from './stream-coalesce.ts'
export { createReplayTransport, createRecordingTransport, type ReplayTransport } from './record-replay.ts'
