import { MessageChannel } from 'node:worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'
import * as Alice from './alice'
import * as Bob from './bob'

type BobFunctions = typeof Bob
type AliceFunctions = typeof Alice

it('error', async () => {
  const channel = new MessageChannel()

  let error: any

  const _bob = createBirpc<AliceFunctions, BobFunctions>(
    { ...Bob },
    {
      post: data => channel.port1.postMessage(data),
      on: fn => channel.port1.on('message', fn),
      onError(err, method, args) {
        error = { err, method, args }
      },
    },
  )

  const alice = createBirpc<BobFunctions, AliceFunctions>(
    { ...Alice },
    {
      // mark bob's `bump` as an event without response
      eventNames: ['bump'],
      post: data => channel.port2.postMessage(data),
      on: fn => channel.port2.on('message', fn),
    },
  )

  try {
    // @ts-expect-error `foo` is not defined
    await alice.foo('Bob')
  }
  catch {
  }

  expect(error).toMatchInlineSnapshot(`
    {
      "args": [
        "Bob",
      ],
      "err": [Error: [birpc] function "foo" not found],
      "method": "foo",
    }
  `)
})
