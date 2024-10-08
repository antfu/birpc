import { MessageChannel } from 'node:worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'
import * as Alice from './alice'
import * as Bob from './bob'

type BobFunctions = typeof Bob
type AliceFunctions = typeof Alice

it('dynamic', async () => {
  const channel = new MessageChannel()

  const bob = createBirpc<AliceFunctions, BobFunctions>(
    { ...Bob },
    {
      post: data => channel.port1.postMessage(data),
      on: fn => channel.port1.on('message', fn),
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

  // RPCs
  expect(await bob.hello('Bob'))
    .toEqual('Hello Bob, my name is Alice')
  expect(await alice.hi('Alice'))
    .toEqual('Hi Alice, I am Bob')

  // replace Alice's `hello` function
  alice.$functions.hello = (name: string) => {
    return `Alice says hello to ${name}`
  }

  expect(await bob.hello('Bob'))
    .toEqual('Alice says hello to Bob')

  // Adding new functions
  // @ts-expect-error `foo` is not defined
  alice.$functions.foo = async (name: string) => {
    return `A random function, called by ${name}`
  }

  // @ts-expect-error `foo` is not defined
  expect(await bob.foo('Bob'))
    .toEqual('A random function, called by Bob')
})
