import { MessageChannel } from 'worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'

interface Bobs {
  hi(name: string): string
  bump(): void
}

interface Alice {
  hello(name: string): string
}

it('basic', async() => {
  const channel = new MessageChannel()

  let bobCount = 0
  const bob = createBirpc<Bobs, Alice>({
    functions: {
      hi(name) {
        return `Hi ${name}, I am Bob`
      },
      bump() {
        bobCount += 1
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
    eventNames: ['bump'],
    post: data => channel.port2.postMessage(data),
    on: data => channel.port2.on('message', data),
  })

  expect(await bob.hello('Bob')).toEqual('Hello Bob, my name is Alice')
  expect(await alice.hi('Alice')).toEqual('Hi Alice, I am Bob')

  // one way message
  expect(alice.bump()).toBeUndefined()

  expect(bobCount).toBe(0)

  await new Promise(resolve => setTimeout(resolve, 1))

  expect(bobCount).toBe(1)
})
