import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../src/router.js' // Replace with the actual file path

test('handles basic GET request', async () => {
  const router = new Router()

  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () => new Response('Hello, World!')
  })

  const request = new Request('http://example.com/hello', { method: 'GET' })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Hello, World!')
})

test('handles 404 Not Found', async () => {
  const router = new Router()

  const request = new Request('http://example.com/notfound', { method: 'GET' })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 404)
})

test('handles middleware mutating response', async () => {
  const router = new Router()

  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async (next) => {
      const response = await next()
      response.headers.set('X-Custom-Header', 'Hello from middleware!')
      return response
    }
  })

  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () => {
      return new Response('Hello, World!')
    }
  })

  const request = new Request('http://example.com/hello', { method: 'GET' })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Hello, World!')
  assert.equal(
    response.headers.get('X-Custom-Header'),
    'Hello from middleware!'
  )
})

test('handles extractor', async () => {
  const router = new Router()

  router.register({
    method: 'POST',
    path: '/echo',
    extractors: [async (request) => await request.text()],
    handler: async (requestText) => new Response(requestText)
  })

  const requestBody = 'Hello, Router!'
  const request = new Request('http://example.com/echo', {
    method: 'POST',
    body: requestBody,
    headers: { 'Content-Type': 'text/plain' }
  })

  const response = await router.handleRequest(request)

  assert.equal(response instanceof Response, true)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), requestBody)
})

test('handles middleware and handler with different extractors', async () => {
  const router = new Router()

  router.register({
    method: 'POST',
    path: '/hello',
    extractors: [
      async (request) => {
        const url = new URL(request.url)
        return url.searchParams.get('name') // Extractor for middleware
      }
    ],
    handler: async (name, next) => {
      const response = await next()
      response.headers.set('X-Name', name!)
      return response
    }
  })

  router.register({
    method: 'POST',
    path: '/hello',
    extractors: [
      async (request) => await request.text() // Extractor for handler
    ],
    handler: async (requestText) => {
      return new Response(requestText)
    }
  })

  const request = new Request('http://example.com/hello?name=John', {
    method: 'POST',
    body: 'Hello, World!'
  })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Hello, World!')
  assert.equal(response.headers.get('X-Name'), 'John')
})

test('handles both GET and POST handlers on the same path', async () => {
  const router = new Router()

  // GET handler
  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () => new Response('Hello, World!')
  })

  // POST handler
  router.register({
    method: 'POST',
    path: '/hello', // Same path as the GET handler
    extractors: [async (request) => await request.text()],
    handler: async (requestText) => new Response(requestText)
  })

  // Test GET request
  const getRequest = new Request('http://example.com/hello', { method: 'GET' })
  const getResponse = await router.handleRequest(getRequest)

  // Test POST request
  const postRequestBody = 'Hello, Router!'
  const postRequest = new Request('http://example.com/hello', {
    method: 'POST',
    body: postRequestBody,
    headers: { 'Content-Type': 'text/plain' }
  })
  const postResponse = await router.handleRequest(postRequest)

  assert.equal(await postResponse.text(), postRequestBody)
  assert.equal(await getResponse.text(), 'Hello, World!')
})

test('middleware matches all routes and methods', async () => {
  const router = new Router()

  let middlewareCalled = false

  // Middleware that matches all routes and methods
  router.register({
    method: '*',
    path: '/(.*)',
    extractors: [],
    handler: async (next) => {
      middlewareCalled = true
      const response = await next()
      return response
    }
  })

  // Handler 1
  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () => new Response('Handler 1 - Hello, World!')
  })

  // Handler 2
  router.register({
    method: 'POST',
    path: '/echo',
    extractors: [async (request) => await request.text()],
    handler: async (requestText) => new Response(`Handler 2 - ${requestText}`)
  })

  // Test GET request
  const getRequest = new Request('http://example.com/hello', { method: 'GET' })
  const getResponse = await router.handleRequest(getRequest)

  assert.equal(getResponse.status, 200)
  assert.equal(await getResponse.text(), 'Handler 1 - Hello, World!')
  assert.equal(middlewareCalled, true)

  // Reset the flag
  middlewareCalled = false

  // Test POST request
  const postRequestBody = 'Hello, Router!'
  const postRequest = new Request('http://example.com/echo', {
    method: 'POST',
    body: postRequestBody,
    headers: { 'Content-Type': 'text/plain' }
  })
  const postResponse = await router.handleRequest(postRequest)

  assert.equal(postResponse.status, 200)
  assert.equal(await postResponse.text(), 'Handler 2 - Hello, Router!')
  assert.equal(middlewareCalled, true)
})

test('handles errors with default behavior', async () => {
  const router = new Router()

  // Handler that throws an error
  router.register({
    method: 'GET',
    path: '/error',
    extractors: [],
    handler: async () => {
      throw new Error('Handler Error')
    }
  })

  // Test handler error
  const request = new Request('http://example.com/error', { method: 'GET' })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 500)
  assert.equal(await response.text(), 'Internal server error')
})

test('handles errors with custom error handler', async () => {
  const router = new Router()

  router.register({
    method: 'GET',
    path: '/error',
    extractors: [],
    handler: async () => {
      throw new Error('Handler Error')
    }
  })

  router.onError(
    Error,
    [],
    async () => new Response('Custom Handler Error', { status: 418 })
  )

  const request = new Request('http://example.com/error', {
    method: 'GET'
  })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 418)
  assert.equal(await response.text(), 'Custom Handler Error')
})

test('handles errors in middleware', async () => {
  const router = new Router()

  router.register({
    method: 'GET',
    path: '/error',
    extractors: [],
    handler: async (next) => {
      const response = await next()
      throw new Error('Middleware Error')
    }
  })

  router.register({
    method: 'GET',
    path: '/error',
    extractors: [],
    handler: async () => new Response('Handler')
  })

  const request = new Request('http://example.com/error')
  const repsonse = await router.handleRequest(request)

  assert.equal(repsonse.status, 500)
  assert.equal(await repsonse.text(), 'Internal server error')
})

test('handles errors in extractors', async () => {
  const router = new Router()

  router.register({
    method: 'GET',
    path: '/error',
    extractors: [
      async () => {
        throw new Error('Extractor Error')
      }
    ],
    handler: async () => new Response('Handler')
  })

  const request = new Request('http://example.com/error')
  const repsonse = await router.handleRequest(request)

  assert.equal(repsonse.status, 500)
  assert.equal(await repsonse.text(), 'Internal server error')
})

// 1. Test for Path Parameter Extraction: Testing the router's ability to extract parameters from the URL path (e.g., /user/:id) and pass them to handlers.
// 3. Handling Query Parameters: Ensuring that query parameters in the URL can be extracted and utilized by handlers.
// 5. Handling HEAD Requests: Since HEAD requests should not return a body, verifying that the router correctly handles such requests.
// 7. Test for Method-Specific Routing: Ensure that a route responds correctly only to the specified HTTP method(s), returning a 405 Method Not Allowed for non-supported methods.
// 8. Testing Support for OPTIONS Method: The router should ideally be able to auto-respond to OPTIONS requests indicating supported methods for a given route.
// 10. Custom 404 Handler: Test the ability to define a custom "Not Found" handler instead of the default 404 response.
// 17. Middleware Exception Handling: Test how the router handles exceptions thrown by middleware (e.g., async errors, syntactical errors).
// 18. Base Path Handling: If the router supports base paths, test that routes correctly prepend the base path before matching.
// 19. Testing Router Composition: Verify that multiple routers composed together maintain their individual route handling.
test('middleware execution order', async () => {
  const router = new Router()
  const order: string[] = []

  // Middleware 1
  router.register({
    method: '*',
    path: '/test-order',
    extractors: [],
    handler: async (next) => {
      order.push('middleware1')
      return next()
    }
  })

  // Middleware 2
  router.register({
    method: '*',
    path: '/test-order',
    extractors: [],
    handler: async (next) => {
      order.push('middleware2')
      return next()
    }
  })

  // Handler
  router.register({
    method: 'GET',
    path: '/test-order',
    extractors: [],
    handler: async () => new Response('done')
  })

  await router.handleRequest(new Request('http://example.com/test-order'))

  assert.deepEqual(order, ['middleware1', 'middleware2'])
})

test('error propagation in middleware', async () => {
  const router = new Router()
  let errorCaught = false

  // Middleware that throws an error
  router.register({
    method: 'GET',
    path: '/error-propagation',
    extractors: [],
    handler: async (next) => {
      throw new Error('Middleware Error')
    }
  })

  // Custom global error handler
  router.onError(Error, [], async () => {
    errorCaught = true
    return new Response('Error handled')
  })

  await router.handleRequest(
    new Request('http://example.com/error-propagation')
  )

  assert.equal(errorCaught, true)
})

test('handle promise rejection', async () => {
  const router = new Router()
  let rejectionHandled = false

  router.register({
    method: 'GET',
    path: '/promise-rejection',
    extractors: [],
    handler: async () => {
      return Promise.reject(new Error('Rejected Promise'))
    }
  })

  // Custom global error handler for promise rejection
  router.onError(Error, [], async () => {
    rejectionHandled = true
    return new Response('Rejected Promise Handled')
  })

  await router.handleRequest(
    new Request('http://example.com/promise-rejection')
  )

  assert.equal(rejectionHandled, true)
})

test('wildcard subpath matching', async () => {
  const router = new Router()
  let wildcardMatched = false

  router.register({
    method: 'GET',
    path: '/users/(.*)',
    extractors: [],
    handler: async () => {
      wildcardMatched = true
      return new Response('Wildcard Matched')
    }
  })

  await router.handleRequest(new Request('http://example.com/users/john/doe'))

  assert.equal(wildcardMatched, true)
})

test('router use method', async () => {
  const parentRouter = new Router()
  const childRouter = new Router()

  childRouter.register({
    method: 'GET',
    path: '/child',
    extractors: [],
    handler: async () => new Response('Child Router')
  })

  // Using the child router under a defined base path
  parentRouter.use(childRouter)

  const response = await parentRouter.handleRequest(
    new Request('http://example.com/child')
  )

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Child Router')
})

test('response transformations', async () => {
  const router = new Router()

  // Middleware for response transformation
  router.register({
    method: '*',
    path: '/(.*)',
    extractors: [],
    handler: async (next) => {
      const response = await next()
      response.headers.set('X-Transformed-Header', 'true')
      response.headers.delete('X-Original-Header')
      return new Response('Transformed', {
        headers: response.headers,
        status: response.status
      })
    }
  })

  router.register({
    method: 'GET',
    path: '/transform-response',
    extractors: [],
    handler: async () => {
      const response = new Response('Original')
      response.headers.set('X-Original-Header', 'true')
      return response
    }
  })

  const response = await router.handleRequest(
    new Request('http://example.com/transform-response')
  )

  assert.equal(await response.text(), 'Transformed')
  assert.equal(response.headers.get('X-Original-Header'), null)
  assert.equal(response.headers.get('X-Transformed-Header'), 'true')
})

test('concurrent request handling', async () => {
  const router = new Router()
  let globalCounter = 0

  router.register({
    method: 'GET',
    path: '/increment',
    extractors: [],
    handler: async () => {
      // Simulate some async work that increments a shared counter.
      const localCounter = await new Promise((resolve) =>
        setTimeout(() => resolve(globalCounter++), Math.random() * 100)
      )
      return new Response(String(localCounter))
    }
  })

  // Run multiple requests concurrently and collect responses.
  const requests = Array.from({ length: 10 }, (_, i) =>
    router.handleRequest(new Request(`http://example.com/increment?id=${i}`))
  )

  // Wait for all responses.
  const responses = await Promise.all(requests)

  // Convert responses to text to see the counter values returned.
  const counterValues = await Promise.all(responses.map((r) => r.text()))

  // Ensure that we have 10 unique values (0 to 9) which would indicate no side effects.
  const uniqueValues = new Set(counterValues)
  assert.equal(uniqueValues.size, 10) // There should be 10 unique counter increments.

  // Verify that each expected value is present exactly once.
  for (let expectedValue = 0; expectedValue < 10; expectedValue++) {
    assert.equal(
      uniqueValues.has(String(expectedValue)),
      true,
      `Value ${expectedValue} is missing`
    )
  }
})

test('Options request returns correct http methods', async () => {
  const router = new Router()
  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () => new Response('Hello, World!')
  })

  router.register({
    method: 'POST',
    path: '/hello',
    extractors: [async (request) => await request.text()],
    handler: async (requestText) => new Response(requestText)
  })

  const request = new Request('http://example.com/hello', {
    method: 'OPTIONS'
  })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('allow'), 'GET, POST')
})

test('A head request to a route with a get handler returns the same response as a get request', async () => {
  const router = new Router()

  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () =>
      new Response('Hello, World!', { headers: { foo: 'bar' } })
  })

  const request = new Request('http://example.com/hello', {
    method: 'HEAD'
  })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('foo'), 'bar')
  assert.equal(await response.text(), '')
})

test('A head request where both head and get is defined for the same route returns only head response', async () => {
  const router = new Router()
  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () =>
      new Response('Hello, World!', { headers: { foo: 'bar' } })
  })

  router.register({
    method: 'HEAD',
    path: '/hello',
    extractors: [],
    handler: async () => new Response(null, { headers: { foo: 'baz' } })
  })

  const request = new Request('http://example.com/hello', {
    method: 'HEAD'
  })
  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('foo'), 'baz')
  assert.equal(await response.text(), '')
})

test('Return a string in a handler should return a response', async () => {
  const router = new Router()
  router.register({
    method: 'GET',
    path: '/hello',
    extractors: [],
    handler: async () => 'Hello, World!'
  })

  router.onError(null, [], (foo) => {
    return new Response('Error', { status: 500 })
  })

  const request = new Request('http://example.com/hello', {
    method: 'GET'
  })

  const response = await router.handleRequest(request)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Hello, World!')
})

test('Path parameters are extracted correctly', async () => {
  const router = new Router()
  router.register({
    method: 'GET',
    path: '/users/:id',
    extractors: [(req) => req.params.id],
    handler: async (id) => {
      return new Response(id)
    }
  })

  const request = new Request('http://example.com/users/123', {
    method: 'GET'
  })

  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), '123')
})

test('Middleware with path params and handler with path params get correct values', async () => {
  const router = new Router()

  router.register({
    method: 'GET',
    path: '/users/:userId',
    extractors: [(req) => req.params.userId],
    handler: async (userId, next) => {
      const response = await next()
      response.headers.set('X-User-Id', userId)
      return response
    }
  })

  router.register({
    method: 'GET',
    path: '/users/:id',
    extractors: [(req) => req.params.id],
    handler: async (id) => {
      return new Response(id)
    }
  })

  const request = new Request('http://example.com/users/123', {
    method: 'GET'
  })

  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), '123')
  assert.equal(response.headers.get('X-User-Id'), '123')
})

test('Handles multiple extractors', async () => {
  const router = new Router()
  router.register({
    method: 'GET',
    path: '/users/:id',
    extractors: [
      (req) => req.params.id,
      (req) => req.url,
      (req) => req.url.toString().length
    ],
    handler: async (id, url, length) => {
      return new Response(`${id} ${url} ${length}`)
    }
  })

  const request = new Request('http://example.com/users/123', {
    method: 'GET'
  })

  const response = await router.handleRequest(request)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), '123 http://example.com/users/123 28')
})

test('Middleware error handlers are called correctly', async () => {
  const router = new Router()

  router.onError(null, [], async () => {
    return new Response('null error', { status: 500 })
  })

  router.onError(Error, [], async (error, next) => {
    const response = await next()
    response.headers.set('X-Error', error.message)
    return response
  })

  router.register({
    method: 'GET',
    path: '/error',
    extractors: [],
    handler: async () => {
      throw new Error('Fuck')
    }
  })

  const request = new Request('http://example.com/error')

  const response = await router.handleRequest(request)

  assert.equal(response.status, 500)
  assert.equal(await response.text(), 'null error')
  assert.equal(response.headers.get('X-Error'), 'Fuck')
})

test('Null error handler extracts null', async () => {
  const router = new Router()
  let e

  router.onError(null, [], async (error) => {
    e = error
    return new Response('Internal server error', { status: 500 })
  })

  router.register({
    path: '/',
    method: 'GET',
    extractors: [],
    handler: () => {
      throw new Error('fuck')
    }
  })

  const request = new Request('http://example.com/')
  const response = await router.handleRequest(request)

  assert.equal(response.status, 500)
  assert.equal(e, null)
})
