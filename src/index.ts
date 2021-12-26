export type ArgumentsType<T> = T extends (...args: infer A) => any ? A : never
export type ReturnType<T> = T extends (...args: any) => infer R ? R : never

export interface BirpcOptions<Local, Remote> {
  /**
   * Local functions implementation.
   */
  functions: Local
  /**
   * Names of remote functions that do not need response.
   */
  eventNames?: (keyof Remote)[]
  /**
   * Function to post raw message
   */
  post: (data: any) => void
  /**
   * Listener to receive raw message
   */
  on: (fn: (data: any) => void) => void
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
}

export type BirpcFn<T> = {
  /**
   * Call the remote function and wait for the result.
   */
  (...args: ArgumentsType<T>): Promise<Awaited<ReturnType<T>>>
  /**
   * Send event without asking for response
   */
  asEvent(...args: ArgumentsType<T>): void
}

export type BirpcReturn<RemoteFunctions> = {
  [K in keyof RemoteFunctions]: BirpcFn<RemoteFunctions[K]>
}

interface Request {
  /**
   * Type
   */
  t: 'q'
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
  t: 's'
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

export function createBirpc<LocalFunctions = {}, RemoteFunctions = {}>({
  functions,
  post,
  on,
  eventNames = [],
  serialize = i => i,
  deserialize = i => i,
}: BirpcOptions<LocalFunctions, RemoteFunctions>): BirpcReturn<RemoteFunctions> {
  const rpcPromiseMap = new Map<string, { resolve: ((...args: any) => any); reject: (...args: any) => any }>()

  on(async(data) => {
    const msg = deserialize(data) as RPCMessage
    if (msg.t === 'q') {
      const { m: method, a: args } = msg
      let result, error: any
      try {
        // @ts-expect-error
        result = await functions[method](...args)
      }
      catch (e) {
        error = e
      }
      if (msg.i)
        post(serialize(<Response>{ t: 's', i: msg.i, r: result, e: error }))
    }
    else {
      const { i: ack, r: result, e: error } = msg
      const promise = rpcPromiseMap.get(ack)
      if (error)
        promise?.reject(error)
      else
        promise?.resolve(result)
      rpcPromiseMap.delete(ack)
    }
  })

  return new Proxy({}, {
    get(_, method) {
      const sendEvent = (...args: any[]) => {
        post(serialize(<Request>{ m: method, a: args, t: 'q' }))
      }
      if (eventNames.includes(method as any)) {
        sendEvent.asEvent = sendEvent
        return sendEvent
      }
      const sendCall = (...args: any[]) => {
        return new Promise((resolve, reject) => {
          const id = nanoid()
          rpcPromiseMap.set(id, { resolve, reject })
          post(serialize(<Request>{ m: method, a: args, i: id, t: 'q' }))
        })
      }
      sendCall.asEvent = sendEvent
      return sendCall
    },
  }) as any
}

// port from nanoid
// https://github.com/ai/nanoid
const urlAlphabet = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
function nanoid(size = 21) {
  let id = ''
  let i = size
  while (i--)
    id += urlAlphabet[(Math.random() * 64) | 0]
  return id
}
