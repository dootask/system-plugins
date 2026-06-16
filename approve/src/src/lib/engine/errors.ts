import type { MsgKey } from '#/lib/i18n/messages'
import type { TParams } from '#/lib/i18n/translate'

/**
 * 引擎/流程抛出的「可向用户展示」的错误：携带词条 key + 插值参数，
 * 在 handler 边界用请求语言翻译（badRequest(t(e.key, e.params))）。
 * 非 EngineError 的异常视为内部错误，handler 用通用兜底文案，不外泄细节。
 */
export class EngineError extends Error {
  key: MsgKey
  params?: TParams
  constructor(key: MsgKey, params?: TParams) {
    super(key)
    this.name = 'EngineError'
    this.key = key
    this.params = params
  }
}
