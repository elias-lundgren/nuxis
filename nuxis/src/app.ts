import { Router } from './router.js'

export interface Backend {
  onRequest(callback: (request: Request) => Response | Promise<Response>): void
  listen(host: string, port: number): void
}

export class App extends Router {
  backend: Backend

  constructor(backend: Backend) {
    super()
    this.backend = backend
  }

  listen(host: string, port: number) {
    this.backend.onRequest(this.handleRequest)
    this.backend.listen(host, port)
  }
}
