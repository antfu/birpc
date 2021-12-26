export type ArgumentsType<T> = T extends (...args: infer A) => any ? A : never
export type ReturnType<T> = T extends (...args: any) => infer R ? R : never

export interface BirpcOptions<S> {
  /**
   * Local functions implementation.
   */
  functions: S
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

export interface BirpcReturn<RemoteFunctions> {
  /**
   * Call a remote function and wait for the result.
   */
  call<T extends keyof RemoteFunctions>(method: T, ...args: ArgumentsType<RemoteFunctions[T]>): Promise<Awaited<ReturnType<RemoteFunctions[T]>>>
  /**
   * Send events without waiting for response
   */
  send<T extends keyof RemoteFunctions>(method: T, ...args: ArgumentsType<RemoteFunctions[T]>): void
}

interface Request {
  type: 'req'
  ack?: string
  method: string
  args: any[]
}

interface Response {
  type: 'res'
  ack: string
  result?: any
  error?: any
}

type RPCMessage = Request | Response

export function createBirpc<LocalFunctions = {}, RemoteFunctions = {}>({
  functions,
  post,
  on,
  serialize = i => i,
  deserialize = i => i,
}: BirpcOptions<LocalFunctions>): BirpcReturn<RemoteFunctions> {
  const rpcPromiseMap = new Map<string, { resolve: ((...args: any) => any); reject: (...args: any) => any }>()

  on(async(data) => {
    const msg = deserialize(data) as RPCMessage
    if (msg.type === 'req') {
      const { method, args, ack } = msg
      let result, error: any
      try {
        // @ts-expect-error
        result = await functions[method](...args)
      }
      catch (e) {
        error = e
      }
      if (ack)
        await post(serialize({ type: 'res', ack, result, error }))
    }
    else {
      const { ack, result, error } = msg
      const promise = rpcPromiseMap.get(ack)
      if (error)
        promise?.reject(error)
      else
        promise?.resolve(result)
      rpcPromiseMap.delete(ack)
    }
  })

  return {
    call(method, ...args) {
      return new Promise((resolve, reject) => {
        const ack = nanoid()
        rpcPromiseMap.set(ack, { resolve, reject })
        post(serialize({ method, args, ack, type: 'req' }))
      })
    },
    send(method, ...args) {
      post(serialize({ method, args, type: 'req' }))
    },
  }
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
