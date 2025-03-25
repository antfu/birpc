import { nextTick } from 'node:process'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'

it('stops the rpc promises', async () => {
  expect.assertions(2)
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
      expect(err.message).toBe('[birpc] rpc is closed, cannot call "hello"')
    },
  )
  nextTick(() => {
    rpc.$close()
  })
  await promise
  await expect(() => rpc.hello()).rejects.toThrow('[birpc] rpc is closed, cannot call "hello"')
})

it('stops the rpc promises with a custom message', async () => {
  expect.assertions(1)
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
      expect(err.message).toBe('Custom error')
    },
  )
  nextTick(() => {
    rpc.$close(new Error('Custom error'))
  })
  await promise
})
