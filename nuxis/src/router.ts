import { MatchFn, pathToMatch } from './path-to-regexp.js'
import NuxisResponse, { type ResponseIsh } from './response.js'
import NuxisRequest, { PathParams } from './request.js'
import { ExtractedArgs, Extractor, extract } from './extractor.js'

export type Handler<
  Req extends NuxisRequest = NuxisRequest,
  Extractors extends Extractor<Req>[] = []
> = (
  ...args: [
    ...ExtractedArgs<Extractors, Req>,
    next: () => Promise<NuxisResponse>
  ]
) => Promise<ResponseIsh> | ResponseIsh

type Register = <
  Method extends string | '*',
  Path extends string,
  Extractors extends Extractor<Req>[],
  Req extends NuxisRequest = NuxisRequest<PathParams<Path>>
>(params: {
  method: Method
  path: Path
  extractors: [...Extractors]
  handler: Handler<Req, Extractors>
}) => void

declare function registerMethod<
  Path extends string,
  Extractors extends Extractor[],
  Req extends NuxisRequest = NuxisRequest<PathParams<Path>>
>(
  path: Path,
  extractors: [...Extractors],
  handler: Handler<Req, Extractors>
): void

declare function registerMethod<
  Path extends string,
  Req extends NuxisRequest = NuxisRequest<PathParams<Path>>
>(path: Path, handler: Handler<Req>): void

declare function registerMethod<
  Extractors extends Extractor[],
  Req extends NuxisRequest = NuxisRequest<{}>
>(extractors: [...Extractors], handler: Handler<Req, Extractors>): void

declare function registerMethod(handler: Handler): void

type ErrorHandlersMap = Map<
  any,
  {
    handler: Handler<NuxisRequest, Extractor[]>
    extractors: Extractor[]
  }
>

export class Router {
  #paths: Array<
    [
      MatchFn,
      Array<{
        method: string
        handler: Handler<NuxisRequest, Extractor[]>
        extractors: Extractor[]
        isMiddleware: boolean
      }>
    ]
  > = []
  #errorHandlers: ErrorHandlersMap = new Map()

  register: Register = ({ method, path, extractors, handler }) => {
    const match = pathToMatch(path)
    method = method.toLowerCase() as any
    let handlers = this.#paths.find(([m]) => m === match)

    if (!handlers) {
      handlers = [match, []]
      this.#paths.push(handlers)
    }

    const isMiddleware = handler.length === extractors.length + 1

    // @ts-ignore
    handlers[1].push({ method, handler, extractors, isMiddleware })
  }

  use(router: Router) {
    for (const [match, handlers] of router.#paths) {
      let thisHandlers = this.#paths.find(([m]) => m === match)

      if (!thisHandlers) {
        thisHandlers = [match, []]
        this.#paths.push(thisHandlers)
      }

      for (const handler of handlers) {
        thisHandlers[1].push(handler)
      }
    }
  }

  allowedMethods(url: URL) {
    return Array.from(
      new Set(
        this.#paths
          .filter(([match]) => match(url.pathname))
          .flatMap(([, handlers]) => handlers)
          .filter(({ isMiddleware }) => !isMiddleware)
          .map(({ method }) => method.toUpperCase())
      )
    )
  }

  getHandlers(request: Request) {
    const matchedHandlers: Array<{
      request: NuxisRequest
      handlers: Array<{
        method: string
        handler: Handler<NuxisRequest, Extractor[]>
        extractors: Extractor[]
        isMiddleware: boolean
      }>
    }> = []

    for (const [match, handlers] of this.#paths) {
      const url = new URL(request.url)
      const result = match(url.pathname)

      if (!result) {
        continue
      }

      const nuxisRequest = new NuxisRequest(request, result.params)

      let filteredHandlers = handlers.filter(
        (handler) =>
          handler.method === request.method.toLowerCase() ||
          handler.method === '*' ||
          (handler.method === 'get' && request.method.toLowerCase() === 'head')
      )

      if (
        request.method.toLowerCase() === 'head' &&
        filteredHandlers
          .filter(({ isMiddleware }) => !isMiddleware)
          .some(({ method }) => method === 'head')
      ) {
        filteredHandlers = filteredHandlers.filter(
          ({ method }) => method !== 'get'
        )
      }

      if (filteredHandlers.length === 0) {
        continue
      }

      matchedHandlers.push({
        request: nuxisRequest,
        handlers: filteredHandlers
      })
    }

    return matchedHandlers
  }

  async handleRequest(request: Request): Promise<Response> {
    const matchedHandlers = this.getHandlers(request)

    if (
      request.method.toLowerCase() === 'options' &&
      matchedHandlers
        .flatMap(({ handlers }) => handlers)
        .filter(({ isMiddleware }) => !isMiddleware).length === 0
    ) {
      const methods = this.allowedMethods(new URL(request.url))

      matchedHandlers.push({
        request: new NuxisRequest(request, {}),
        handlers: [
          {
            method: 'options',
            handler: async () =>
              new Response(null, {
                headers: { allow: methods.join(', ') }
              }),
            extractors: [],
            isMiddleware: false
          }
        ]
      })
    }

    let i = 0
    let j = 0

    const match = matchedHandlers[i]
    const handler = match?.handlers[j]
    const nuxisRequest = match?.request

    if (!match || !handler || !nuxisRequest) {
      return new Response('Not Found', { status: 404 })
    }

    const next = async () => {
      j++
      const handler =
        matchedHandlers[i]?.handlers[j] ??
        matchedHandlers[++i]?.handlers[(j = 0)]
      const nuxisRequest =
        matchedHandlers[i]?.request ?? matchedHandlers[++i]?.request

      if (!handler || !nuxisRequest) {
        return NuxisResponse.text('Not Found', 404)
      }

      const args = await extract(handler.extractors, nuxisRequest)

      const response = await handler.handler(...args, next)

      return await NuxisResponse.fromResponseIsh(response, nuxisRequest)
    }

    try {
      const args = await extract(handler.extractors, nuxisRequest)

      const response = await NuxisResponse.fromResponseIsh(
        await handler.handler(...args, next),
        nuxisRequest
      )
      if (request.method.toLowerCase() === 'head' && response.ok) {
        return new NuxisResponse(null, response)
      }

      return response
    } catch (error) {
      return await this.handleError(error, nuxisRequest)
    }
  }

  onError<
    Err,
    Extractors extends Extractor[],
    H extends Handler<NuxisRequest, [() => Err, ...Extractors]>
  >(
    error: { new (...args: any[]): Err } | null,
    extractors: [...Extractors],
    handler: H
  ) {
    this.#errorHandlers.set(error, {
      extractors,
      // @ts-ignore
      handler
    })
  }

  async handleError(error: any, request: NuxisRequest): Promise<NuxisResponse> {
    let constructor = error?.constructor
    let handler = this.#errorHandlers.get(constructor)

    while (!handler && constructor) {
      constructor = Object.getPrototypeOf(constructor)
      handler = this.#errorHandlers.get(constructor)
    }

    if (!handler) {
      return NuxisResponse.text('Internal server error', 500)
    }

    const next = async () => {
      constructor = Object.getPrototypeOf(constructor)
      handler = this.#errorHandlers.get(constructor)

      while (!handler && constructor) {
        constructor = Object.getPrototypeOf(constructor)
        handler = this.#errorHandlers.get(constructor)
      }

      if (!handler) {
        return NuxisResponse.text('Internal server error', 500)
      }

      const args = await extract(
        [() => (constructor === null ? null : error)].concat(
          // @ts-ignore
          handler.extractors
        ),
        request
      )

      const response = await handler.handler(...args, next)

      return NuxisResponse.fromResponseIsh(response, request)
    }

    const args = await extract(
      // @ts-ignore
      [() => (constructor === null ? null : error)].concat(handler.extractors),
      request
    )

    const response = await handler.handler(...args, next)

    return NuxisResponse.fromResponseIsh(response, request)
  }

  registerMethod(method: string) {
    return (a1: unknown, a2: unknown, a3: unknown) => {
      if (
        typeof a1 === 'string' &&
        Array.isArray(a2) &&
        typeof a3 === 'function'
      ) {
        const path = a1
        const extractors = a2
        const handler = a3
        this.register({
          method,
          path,
          extractors,
          // @ts-ignore
          handler
        })
      } else if (
        typeof a1 === 'string' &&
        typeof a2 === 'function' &&
        typeof a3 === 'undefined'
      ) {
        const path = a1
        const handler = a2

        this.register({
          method,
          path,
          extractors: [],
          // @ts-ignore
          handler
        })
      } else if (
        Array.isArray(a1) &&
        typeof a2 === 'function' &&
        typeof a3 === 'undefined'
      ) {
        const extractors = a1
        const handler = a2
        this.register({
          method,
          path: '/(.*)',
          extractors,
          // @ts-ignore
          handler
        })
      } else if (
        typeof a1 === 'function' &&
        typeof a2 === 'undefined' &&
        typeof a3 === 'undefined'
      ) {
        const handler = a1
        this.register({
          method,
          path: '/(.*)',
          extractors: [],
          // @ts-ignore
          handler
        })
      }
    }
  }

  // @ts-ignore
  get: typeof registerMethod = this.registerMethod('get')
  // @ts-ignore
  put: typeof registerMethod = this.registerMethod('put')
  // @ts-ignore
  post: typeof registerMethod = this.registerMethod('post')
  // @ts-ignore
  options: typeof registerMethod = this.registerMethod('options')
  // @ts-ignore
  head: typeof registerMethod = this.registerMethod('head')
  // @ts-ignore
  all: typeof registerMethod = this.registerMethod('*')
  // @ts-ignore
  delete: typeof registerMethod = this.registerMethod('delete')
  // @ts-ignore
  patch: typeof registerMethod = this.registerMethod('patch')
}
