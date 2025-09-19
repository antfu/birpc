import { MessageChannel } from 'node:worker_threads'
import { expect, it, vi } from 'vitest'
import { createBirpc } from '../src'
import * as Alice from './alice'
import * as Bob from './bob'

type BobFunctions = typeof Bob
type AliceFunctions = typeof Alice

const bobFn = {
  post(data: string) {
    return data
  },
}

function createChannel() {
  const channel = new MessageChannel()
  return {
    channel,
    alice: createBirpc<BobFunctions, AliceFunctions>(
      Alice,
      {
        post: data => channel.port2.postMessage(data),
        on: fn => channel.port2.on('message', fn),
      },
    ),
    bob: createBirpc<AliceFunctions, BobFunctions>(
      Bob,
      {
        post: (data) => {
          bobFn.post(data)
          return channel.port1.postMessage(data)
        },
        on: fn => channel.port1.on('message', fn),
      },
    ),
  }
}

it('cache', async () => {
  const spy = vi.spyOn(bobFn, 'post')
  const { bob } = createChannel()

  function fn(name: string) {
    return bob.hello.cachedCall(name)
  }

  function fn2(name: string) {
    return bob.hi.cachedCall(name)
  }

  expect(await fn('Bob'))
    .toEqual('Hello Bob, my name is Alice')

  expect(spy).toHaveBeenCalledTimes(1)

  expect(await fn('Bob'))
    .toEqual('Hello Bob, my name is Alice')

  expect(spy).toHaveBeenCalledTimes(1)

  expect(await fn('Bob2'))
    .toEqual('Hello Bob2, my name is Alice')

  expect(spy).toHaveBeenCalledTimes(2)

  bob.$refresh('hello')

  expect(await fn('Bob'))
    .toEqual('Hello Bob, my name is Alice')

  expect(spy).toHaveBeenCalledTimes(3)

  expect(await fn('Bob2'))
    .toEqual('Hello Bob2, my name is Alice')

  expect(spy).toHaveBeenCalledTimes(4)

  expect(await fn('Bob'))
    .toEqual('Hello Bob, my name is Alice')

  expect(spy).toHaveBeenCalledTimes(4)

  expect(await fn2('Bob'))
    .toEqual('Hi Bob, I am Alice')

  expect(spy).toHaveBeenCalledTimes(5)

  expect(await fn2('Bob'))
    .toEqual('Hi Bob, I am Alice')

  expect(spy).toHaveBeenCalledTimes(5)

  bob.$refresh()

  expect(await fn('Bob'))
    .toEqual('Hello Bob, my name is Alice')

  expect(spy).toHaveBeenCalledTimes(6)

  expect(await fn2('Bob'))
    .toEqual('Hi Bob, I am Alice')

  expect(spy).toHaveBeenCalledTimes(7)
})
