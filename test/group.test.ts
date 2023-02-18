import { MessageChannel } from 'worker_threads'
import { expect, it } from 'vitest'
import { createBirpc, createBirpcGroup } from '../src'
import * as Bob from './bob'
import * as Alice from './alice'

type BobFunctions = typeof Bob
type AliceFunctions = typeof Alice

it('group', async () => {
  const channel1 = new MessageChannel()
  const channel2 = new MessageChannel()
  const channel3 = new MessageChannel()

  const client1 = createBirpc<AliceFunctions>(
    Bob,
    {
      post: data => channel1.port1.postMessage(data),
      on: data => channel1.port1.on('message', data),
    },
  )
  const client2 = createBirpc<AliceFunctions>(
    Bob,
    {
      post: data => channel2.port1.postMessage(data),
      on: data => channel2.port1.on('message', data),
    },
  )
  const client3 = createBirpc<AliceFunctions>(
    Bob,
    {
      post: data => channel3.port1.postMessage(data),
      on: data => channel3.port1.on('message', data),
    },
  )

  const server = createBirpcGroup<BobFunctions>(
    Alice,
    [
      {
        post: data => channel1.port2.postMessage(data),
        on: data => channel1.port2.on('message', data),
      },
      {
        post: data => channel2.port2.postMessage(data),
        on: data => channel2.port2.on('message', data),
      },
    ],
    { eventNames: ['bump'] },
  )

  // RPCs
  expect(await client1.hello('Bob'))
    .toEqual('Hello Bob, my name is Alice')
  expect(await client2.hello('Bob'))
    .toEqual('Hello Bob, my name is Alice')
  expect(await server.broadcast.hi('Alice'))
    .toEqual([
      'Hi Alice, I am Bob',
      'Hi Alice, I am Bob',
    ])

  server.updateChannels((channels) => {
    channels.push({
      post: data => channel3.port2.postMessage(data),
      on: data => channel3.port2.on('message', data),
    })
  })

  expect(await server.broadcast.hi('Alice'))
    .toEqual([
      'Hi Alice, I am Bob',
      'Hi Alice, I am Bob',
      'Hi Alice, I am Bob',
    ])

  expect(await client3.hello('Bob'))
    .toEqual('Hello Bob, my name is Alice')
})
