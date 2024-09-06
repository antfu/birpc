import { MessageChannel } from 'node:worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'
import * as Bob from './bob'
import * as Alice from './alice'

type BobFunctions = typeof Bob
type AliceFunctions = typeof Alice

function createChannel() {
  const channel = new MessageChannel()
  return {
    channel,
    alice: createBirpc<BobFunctions, AliceFunctions>(
      Alice,
      {
        // mark bob's `bump` as an event without response
        eventNames: ['bump'],
        post: data => channel.port2.postMessage(data),
        on: fn => channel.port2.on('message', fn),
      },
    ),
    bob: createBirpc<AliceFunctions, BobFunctions>(
      Bob,
      {
        post: data => channel.port1.postMessage(data),
        on: fn => channel.port1.on('message', fn),
      },
    ),
  }
}

async function toArray<T>(iter: AsyncIterable<T>) {
  const arr = []
  for await (const i of iter) arr.push(i)
  return arr as T[]
}

it('async generator', async () => {
  const { bob } = createChannel()

  const iter = bob.helloAsyncGenerator.asAsyncIter('Bob')

  const arr = await toArray(iter)

  expect(arr).toEqual([
    'Hello Bob, my name is Alice',
    'Hello Bob, my name is Alice',
    'Hello Bob, my name is Alice',
  ])
})

it('async generator err', async () => {
  const { bob } = createChannel()

  const iter = bob.helloAsyncError.asAsyncIter('Bob')

  const arr = []
  let error: any
  try {
    for await (const i of iter)
      arr.push(i)
  }
  catch (err) {
    error = err
  }

  expect(arr).toEqual([
    'Hello Bob, my name is Alice',
    'Hello Bob, my name is Alice',
  ])
  expect(error).toMatchInlineSnapshot(`[Error: Oops, something went wrong!]`)
})

it('async readable stream', async () => {
  const { bob } = createChannel()

  const iter = bob.helloStream.asAsyncIter('Bob')

  const arr = await toArray(iter)

  expect(arr).toEqual([
    'Hello Bob, my name is Alice',
    'Hello Bob, my name is Alice',
    'Hello Bob, my name is Alice',
  ])
})
