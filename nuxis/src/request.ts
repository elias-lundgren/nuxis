export default class NuxisRequest<Params extends Record<string, string> = {}> {
  params: Params
  r: Request

  constructor(request: Request, params: Params) {
    this.r = request
    this.params = params
  }

  get url() {
    return new URL(this.r.url)
  }

  get method() {
    return this.r.method
  }

  get headers() {
    return this.r.headers
  }

  get body() {
    return this.r.body
  }

  text() {
    return this.r.text()
  }

  json() {
    return this.r.json()
  }

  formData() {
    return this.r.formData()
  }

  arrayBuffer() {
    return this.r.arrayBuffer()
  }

  blob() {
    return this.r.blob()
  }

  clone() {
    return new NuxisRequest(this.r.clone(), this.params)
  }
}

type ExtractParam<Path, NextPart> = Path extends `:${infer Param}`
  ? Record<Param, string> & NextPart
  : NextPart

export type PathParams<Path> = Path extends `${infer Segment}/${infer Rest}`
  ? ExtractParam<Segment, PathParams<Rest>>
  : ExtractParam<Path, {}>
