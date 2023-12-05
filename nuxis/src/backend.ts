import { Router } from './router.js'

export interface Backend {
  new <Options>(router: Router, options?: Options): Backend
  listen(host: string, port: number, callback: () => void): void
}
