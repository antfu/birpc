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
        on: data => channel.port2.on('message', data),
      },
    ),
    bob: createBirpc<AliceFunctions, BobFunctions>(
      Bob,
      {
        post: data => channel.port1.postMessage(data),
        on: data => channel.port1.on('message', data),
      },
    ),
  }
}

it('basic', async () => {
  const { bob, alice } = createChannel()

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

it('async', async () => {
  const { bob, alice } = createChannel()

  await alice
  await bob
})
