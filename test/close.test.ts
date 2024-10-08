import { nextTick } from 'node:process'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'

it('stops the rpc promises', async () => {
  const rpc = createBirpc<{ hello: () => string }>({}, {
    on() {},
    post() {},
  })
  const promise = rpc.hello().then(
    () => {
      throw new Error('Promise should not resolve')
    },
    (err) => {
      // Promise should reject
      expect(err.message).toBe('[birpc] rpc is closed')
    },
  )
  nextTick(() => {
    rpc.$close()
  })
  await promise
  await expect(() => rpc.hello()).rejects.toThrow('[birpc] rpc is closed, cannot call "hello"')
})
