import { MessageChannel } from 'worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'
import * as Bob from './bob'
import type * as Alice from './alice'

type AliceFunctions = typeof Alice

it('timeout', async () => {
  const channel = new MessageChannel()

  const bob = createBirpc<AliceFunctions>(
    Bob,
    {
      post: data => channel.port1.postMessage(data),
      on: data => channel.port1.on('message', data),
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
