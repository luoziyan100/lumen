/**
 * [OUTPUT]: adapters 出口
 * [POS]: ModelPort 实现层的入口（M1：Claude + 录制重放）
 */
export {
  buildClaudeRequest,
  parseClaudeResponse,
  createFetchTransport,
  createClaudeAdapter,
  type ClaudeTransport,
  type ClaudeRequest,
  type ClaudeResponseBody,
  type ClaudeAdapterOptions,
  type FetchTransportOptions,
} from './claude.ts'
export { createReplayTransport, createRecordingTransport, type ReplayTransport } from './record-replay.ts'
