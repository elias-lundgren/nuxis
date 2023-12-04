import NuxisRequest from './request.js'

export type Extractor<Req extends NuxisRequest = NuxisRequest> =
  | ((request: Req) => any | Promise<any>)
  | { fromRequest(request: Req): any | Promise<any> }

export type Extracted<
  T extends Extractor<Req>,
  Req extends NuxisRequest = NuxisRequest
> = T extends { fromRequest: any }
  ? Awaited<ReturnType<T['fromRequest']>>
  : Awaited<ReturnType<Extract<T, (...args: any[]) => any>>>

export type ExtractedArgs<
  Extractors extends Extractor<Req>[],
  Req extends NuxisRequest = NuxisRequest
> = { [K in keyof Extractors]: Extracted<Extractors[K], Req> }

export async function extract<
  Extractors extends Extractor[],
  Req extends NuxisRequest
>(
  extractors: Extractors,
  request: Req
): Promise<ExtractedArgs<Extractors, Req>> {
  const args = []

  for (const extractor of extractors) {
    if (typeof extractor === 'function') {
      args.push(extractor(request))
    } else {
      args.push(extractor.fromRequest(request))
    }
  }

  return (await Promise.all(args)) as ExtractedArgs<Extractors, Req>
}
