import { MessageChannel } from 'worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'

interface Bobs {
  hi(name: string): string
}

interface Alice {
  hello(name: string): string
}

it('basic', async() => {
  const channel = new MessageChannel()

  const bob = createBirpc<Bobs, Alice>({
    functions: {
      hi(name) {
        return `Hi ${name}, I am Bob`
      },
    },
    post: data => channel.port1.postMessage(data),
    on: data => channel.port1.on('message', data),
  })

  const alice = createBirpc<Alice, Bobs>({
    functions: {
      hello(name) {
        return `Hello ${name}, my name is Alice`
      },
    },
    post: data => channel.port2.postMessage(data),
    on: data => channel.port2.on('message', data),
  })

  expect(await bob.call('hello', 'Bob')).toEqual('Hello Bob, my name is Alice')
  expect(await alice.call('hi', 'Alice')).toEqual('Hi Alice, I am Bob')
})
