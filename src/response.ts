import NuxisRequest from './request.js'

export default class NuxisResponse extends Response {
  constructor(
    body?: BodyInit | null | undefined,
    init?: ResponseInit | undefined
  ) {
    super(body, init)
  }

  static text(body: string, status?: number) {
    return new NuxisResponse(body, { status })
  }

  static async fromResponseIsh(
    responseIsh: ResponseIsh,
    request: NuxisRequest
  ) {
    if (responseIsh instanceof NuxisResponse) {
      return responseIsh
    }

    if (typeof responseIsh === 'function') {
      return await responseIsh(request)
    }

    if (typeof responseIsh === 'object' && 'toResponse' in responseIsh) {
      return await responseIsh.toResponse(request)
    }

    return await responseIsh[TO_RESPONSE]()
  }
}

export type ResponseIsh =
  | NuxisResponse
  | {
      toResponse(request: NuxisRequest): NuxisResponse | Promise<NuxisResponse>
    }
  | ((request: NuxisRequest) => NuxisResponse | Promise<NuxisResponse>)
  | { [TO_RESPONSE](): Promise<NuxisResponse> | NuxisResponse }

export const TO_RESPONSE = Symbol('toResponse')

declare global {
  interface Response {
    [TO_RESPONSE](): NuxisResponse
  }

  interface String {
    [TO_RESPONSE](): NuxisResponse
  }

  interface Number {
    [TO_RESPONSE](): NuxisResponse
  }
}

Response.prototype[TO_RESPONSE] = function () {
  return new NuxisResponse(this.body, this)
}

String.prototype[TO_RESPONSE] = function () {
  return new NuxisResponse(this.toString())
}

Number.prototype[TO_RESPONSE] = function () {
  return new NuxisResponse(this.toString())
}
