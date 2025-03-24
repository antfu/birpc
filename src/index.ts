export type ArgumentsType<T> = T extends (...args: infer A) => any ? A : never
export type ReturnType<T> = T extends (...args: any) => infer R ? R : never
export type PromisifyFn<T> = ReturnType<T> extends Promise<any>
  ? T
  : (...args: ArgumentsType<T>) => Promise<Awaited<ReturnType<T>>>

export type BirpcResolver = (name: string, resolved: (...args: unknown[]) => unknown) => ((...args: unknown[]) => unknown) | undefined

export interface ChannelOptions {
  /**
   * Function to post raw message
   */
  post: (data: any, ...extras: any[]) => any | Promise<any>
  /**
   * Listener to receive raw message
   */
  on: (fn: (data: any, ...extras: any[]) => void) => any | Promise<any>
  /**
   * Clear the listener when `$close` is called
   */
  off?: (fn: (data: any, ...extras: any[]) => void) => any | Promise<any>
  /**
   * Custom function to serialize data
   *
   * by default it passes the data as-is
   */
  serialize?: (data: any) => any
  /**
   * Custom function to deserialize data
   *
   * by default it passes the data as-is
   */
  deserialize?: (data: any) => any

  /**
   * Call the methods with the RPC context or the original functions object
   */
  bind?: 'rpc' | 'functions'
}

export interface EventOptions<Remote> {
  /**
   * Names of remote functions that do not need response.
   */
  eventNames?: (keyof Remote)[]

  /**
   * Maximum timeout for waiting for response, in milliseconds.
   *
   * @default 60_000
   */
  timeout?: number

  /**
   * Custom resolver to resolve function to be called
   *
   * For advanced use cases only
   */
  resolver?: BirpcResolver

  /**
   * Custom error handler
   *
   * @deprecated use `onFunctionError` and `onGeneralError` instead
   */
  onError?: (error: Error, functionName: string, args: any[]) => boolean | void

  /**
   * Custom error handler for errors occurred in local functions being called
   *
   * @returns `true` to prevent the error from being thrown
   */
  onFunctionError?: (error: Error, functionName: string, args: any[]) => boolean | void

  /**
   * Custom error handler for errors occurred during serialization or messsaging
   *
   * @returns `true` to prevent the error from being thrown
   */
  onGeneralError?: (error: Error, functionName?: string, args?: any[]) => boolean | void

  /**
   * Custom error handler for timeouts
   *
   * @returns `true` to prevent the error from being thrown
   */
  onTimeoutError?: (functionName: string, args: any[]) => boolean | void
}

export type BirpcOptions<Remote> = EventOptions<Remote> & ChannelOptions

export type BirpcFn<T> = PromisifyFn<T> & {
  /**
   * Send event without asking for response
   */
  asEvent: (...args: ArgumentsType<T>) => void
}

export interface BirpcGroupFn<T> {
  /**
   * Call the remote function and wait for the result.
   */
  (...args: ArgumentsType<T>): Promise<Awaited<ReturnType<T>>[]>
  /**
   * Send event without asking for response
   */
  asEvent: (...args: ArgumentsType<T>) => void
}

export type BirpcReturn<RemoteFunctions, LocalFunctions = Record<string, never>> = {
  [K in keyof RemoteFunctions]: BirpcFn<RemoteFunctions[K]>
} & { $functions: LocalFunctions, $close: (error?: Error) => void }

export type BirpcGroupReturn<RemoteFunctions> = {
  [K in keyof RemoteFunctions]: BirpcGroupFn<RemoteFunctions[K]>
}

export interface BirpcGroup<RemoteFunctions, LocalFunctions = Record<string, never>> {
  readonly clients: BirpcReturn<RemoteFunctions, LocalFunctions>[]
  readonly functions: LocalFunctions
  readonly broadcast: BirpcGroupReturn<RemoteFunctions>
  updateChannels: (fn?: ((channels: ChannelOptions[]) => void)) => BirpcReturn<RemoteFunctions, LocalFunctions>[]
}

const TYPE_REQUEST = 'q' as const
const TYPE_RESPONSE = 's' as const

interface Request {
  /**
   * Type
   */
  t: typeof TYPE_REQUEST
  /**
   * ID
   */
  i?: string
  /**
   * Method
   */
  m: string
  /**
   * Arguments
   */
  a: any[]
}

interface Response {
  /**
   * Type
   */
  t: typeof TYPE_RESPONSE
  /**
   * Id
   */
  i: string
  /**
   * Result
   */
  r?: any
  /**
   * Error
   */
  e?: any
}

type RPCMessage = Request | Response

export const DEFAULT_TIMEOUT = 60_000 // 1 minute

function defaultSerialize(i: any) {
  return i
}
const defaultDeserialize = defaultSerialize

// Store public APIs locally in case they are overridden later
const { clearTimeout, setTimeout } = globalThis
const random = Math.random.bind(Math)

export function createBirpc<RemoteFunctions = Record<string, never>, LocalFunctions extends object = Record<string, never>>(
  functions: LocalFunctions,
  options: BirpcOptions<RemoteFunctions>,
): BirpcReturn<RemoteFunctions, LocalFunctions> {
  const {
    post,
    on,
    off = () => {},
    eventNames = [],
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
    resolver,
    bind = 'rpc',
    timeout = DEFAULT_TIMEOUT,
  } = options

  const rpcPromiseMap = new Map<string, {
    resolve: (arg: any) => void
    reject: (error: any) => void
    method: string
    timeoutId?: ReturnType<typeof setTimeout>
  }>()

  let _promise: Promise<any> | any
  let closed = false

  const rpc = new Proxy({}, {
    get(_, method: string) {
      if (method === '$functions')
        return functions

      if (method === '$close')
        return close

      // catch if "createBirpc" is returned from async function
      if (method === 'then' && !eventNames.includes('then' as any) && !('then' in functions))
        return undefined

      const sendEvent = (...args: any[]) => {
        post(serialize(<Request>{ m: method, a: args, t: TYPE_REQUEST }))
      }
      if (eventNames.includes(method as any)) {
        sendEvent.asEvent = sendEvent
        return sendEvent
      }
      const sendCall = async (...args: any[]) => {
        if (closed)
          throw new Error(`[birpc] rpc is closed, cannot call "${method}"`)
        if (_promise) {
          // Wait if `on` is promise
          try {
            await _promise
          }
          finally {
            // don't keep resolved promise hanging
            _promise = undefined
          }
        }
        return new Promise((resolve, reject) => {
          const id = nanoid()
          let timeoutId: ReturnType<typeof setTimeout> | undefined

          if (timeout >= 0) {
            timeoutId = setTimeout(() => {
              try {
                // Custom onTimeoutError handler can throw its own error too
                const handleResult = options.onTimeoutError?.(method, args)
                if (handleResult !== true)
                  throw new Error(`[birpc] timeout on calling "${method}"`)
              }
              catch (e) {
                reject(e)
              }
              rpcPromiseMap.delete(id)
            }, timeout)

            // For node.js, `unref` is not available in browser-like environments
            if (typeof timeoutId === 'object')
              timeoutId = timeoutId.unref?.()
          }

          rpcPromiseMap.set(id, { resolve, reject, timeoutId, method })
          post(serialize(<Request>{ m: method, a: args, i: id, t: 'q' }))
        })
      }
      sendCall.asEvent = sendEvent
      return sendCall
    },
  }) as BirpcReturn<RemoteFunctions, LocalFunctions>

  function close(error?: Error) {
    closed = true
    rpcPromiseMap.forEach(({ reject, method }) => {
      reject(error || new Error(`[birpc] rpc is closed, cannot call "${method}"`))
    })
    rpcPromiseMap.clear()
    off(onMessage)
  }

  async function onMessage(data: any, ...extra: any[]) {
    let msg: RPCMessage

    try {
      msg = deserialize(data) as RPCMessage
    }
    catch (e) {
      if (options.onGeneralError?.(e as Error) !== true)
        throw e
      return
    }

    if (msg.t === TYPE_REQUEST) {
      const { m: method, a: args } = msg
      let result, error: any
      const fn = resolver
        ? resolver(method, (functions as any)[method])
        : (functions as any)[method]

      if (!fn) {
        error = new Error(`[birpc] function "${method}" not found`)
      }
      else {
        try {
          result = await fn.apply(bind === 'rpc' ? rpc : functions, args)
        }
        catch (e) {
          error = e
        }
      }

      if (msg.i) {
        // Error handling
        if (error && options.onError)
          options.onError(error, method, args)
        if (error && options.onFunctionError) {
          if (options.onFunctionError(error, method, args) === true)
            return
        }

        // Send data
        if (!error) {
          try {
            post(serialize(<Response>{ t: TYPE_RESPONSE, i: msg.i, r: result }), ...extra)
            return
          }
          catch (e) {
            error = e
            if (options.onGeneralError?.(e as Error, method, args) !== true)
              throw e
          }
        }
        // Try to send error if serialization failed
        try {
          post(serialize(<Response>{ t: TYPE_RESPONSE, i: msg.i, e: error }), ...extra)
        }
        catch (e) {
          if (options.onGeneralError?.(e as Error, method, args) !== true)
            throw e
        }
      }
    }
    else {
      const { i: ack, r: result, e: error } = msg
      const promise = rpcPromiseMap.get(ack)
      if (promise) {
        clearTimeout(promise.timeoutId)

        if (error)
          promise.reject(error)
        else
          promise.resolve(result)
      }
      rpcPromiseMap.delete(ack)
    }
  }

  _promise = on(onMessage)

  return rpc
}

const cacheMap = new WeakMap<any, any>()
export function cachedMap<T, R>(items: T[], fn: ((i: T) => R)): R[] {
  return items.map((i) => {
    let r = cacheMap.get(i)
    if (!r) {
      r = fn(i)
      cacheMap.set(i, r)
    }
    return r
  })
}

export function createBirpcGroup<RemoteFunctions = Record<string, never>, LocalFunctions extends object = Record<string, never>>(
  functions: LocalFunctions,
  channels: ChannelOptions[] | (() => ChannelOptions[]),
  options: EventOptions<RemoteFunctions> = {},
): BirpcGroup<RemoteFunctions, LocalFunctions> {
  const getChannels = () => typeof channels === 'function' ? channels() : channels
  const getClients = (channels = getChannels()) => cachedMap(channels, s => createBirpc(functions, { ...options, ...s }))

  const broadcastProxy = new Proxy({}, {
    get(_, method) {
      const client = getClients()
      const callbacks = client.map(c => (c as any)[method])
      const sendCall = (...args: any[]) => {
        return Promise.all(callbacks.map(i => i(...args)))
      }
      sendCall.asEvent = (...args: any[]) => {
        callbacks.map(i => i.asEvent(...args))
      }
      return sendCall
    },
  }) as BirpcGroupReturn<RemoteFunctions>

  function updateChannels(fn?: ((channels: ChannelOptions[]) => void)) {
    const channels = getChannels()
    fn?.(channels)
    return getClients(channels)
  }

  getClients()

  return {
    get clients() {
      return getClients()
    },
    functions,
    updateChannels,
    broadcast: broadcastProxy,
    /**
     * @deprecated use `broadcast`
     */
    // @ts-expect-error deprecated
    boardcast: broadcastProxy,
  }
}

// port from nanoid
// https://github.com/ai/nanoid
const urlAlphabet = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
function nanoid(size = 21) {
  let id = ''
  let i = size
  while (i--)
    id += urlAlphabet[(random() * 64) | 0]
  return id
}
