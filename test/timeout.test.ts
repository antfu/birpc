import type * as Alice from './alice'
import { MessageChannel } from 'node:worker_threads'
import { expect, it, vi } from 'vitest'
import { createBirpc } from '../src'
import * as Bob from './bob'

type AliceFunctions = typeof Alice
type BobFunctions = typeof Bob

it('timeout', async () => {
  const channel = new MessageChannel()

  const bob = createBirpc<AliceFunctions, BobFunctions>(
    Bob,
    {
      post: data => channel.port1.postMessage(data),
      on: fn => channel.port1.on('message', fn),
      timeout: 100,
    },
  )

  try {
    await bob.hello('Bob')
    expect(1).toBe(2)
  }
  catch (e) {
    expect(e).toMatchInlineSnapshot('[Error: [birpc] timeout on calling "hello"]')
  }
})

it('custom onTimeoutError', async () => {
  const channel = new MessageChannel()
  const onTimeout = vi.fn()

  const bob = createBirpc<AliceFunctions, BobFunctions>(
    Bob,
    {
      post: data => channel.port1.postMessage(data),
      on: fn => channel.port1.on('message', fn),
      timeout: 100,
      onTimeoutError(functionName, args) {
        onTimeout({ functionName, args })
        throw new Error('Custom error')
      },
    },
  )

  try {
    await bob.hello('Bob')
    expect(1).toBe(2)
  }
  catch (e) {
    expect(onTimeout).toHaveBeenCalledWith({ functionName: 'hello', args: ['Bob'] })
    expect(e).toMatchInlineSnapshot(`[Error: Custom error]`)
  }
})

it('custom onTimeoutError without custom error', async () => {
  const channel = new MessageChannel()
  const onTimeout = vi.fn()

  const bob = createBirpc<AliceFunctions, BobFunctions>(
    Bob,
    {
      post: data => channel.port1.postMessage(data),
      on: fn => channel.port1.on('message', fn),
      timeout: 100,
      onTimeoutError(functionName, args) {
        onTimeout({ functionName, args })
      },
    },
  )

  try {
    await bob.hello('Bob')
    expect(1).toBe(2)
  }
  catch (e) {
    expect(onTimeout).toHaveBeenCalledWith({ functionName: 'hello', args: ['Bob'] })
    expect(e).toMatchInlineSnapshot(`[Error: [birpc] timeout on calling "hello"]`)
  }
})
