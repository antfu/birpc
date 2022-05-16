import { MessageChannel } from 'worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'
import * as Bob from './bob'
import * as Alice from './alice'

type BobFunctions = typeof Bob
type AliceFunctions = typeof Alice

it('basic', async () => {
  const channel = new MessageChannel()

  const bob = createBirpc<AliceFunctions>(
    Bob,
    {
      post: data => channel.port1.postMessage(data),
      on: data => channel.port1.on('message', data),
    },
  )

  const alice = createBirpc<BobFunctions>(
    Alice,
    {
      // mark bob's `bump` as an event without response
      eventNames: ['bump'],
      post: data => channel.port2.postMessage(data),
      on: data => channel.port2.on('message', data),
    },
  )

  // RPCs
  expect(await bob.hello('Bob'))
    .toEqual('Hello Bob, my name is Alice')
  expect(await alice.hi('Alice'))
    .toEqual('Hi Alice, I am Bob')

  // one-way event
  expect(alice.bump()).toBeUndefined()

  expect(Bob.getCount()).toBe(0)
  await new Promise(resolve => setTimeout(resolve, 1))
  expect(Bob.getCount()).toBe(1)
})
