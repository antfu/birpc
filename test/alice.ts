import { ReadableStream } from 'node:stream/web'

export function hello(name: string) {
  return `Hello ${name}, my name is Alice`
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function* helloAsyncGenerator(name: string) {
  yield `Hello ${name}, my name is Alice`
  await sleep(50)
  yield `Hello ${name}, my name is Alice`
  await sleep(50)
  yield `Hello ${name}, my name is Alice`
}

export async function* helloAsyncError(name: string) {
  yield `Hello ${name}, my name is Alice`
  await sleep(50)
  yield `Hello ${name}, my name is Alice`
  await sleep(50)
  throw new Error('Oops, something went wrong!')
}

export function helloStream(name: string) {
  return new ReadableStream<string>({
    async start(controller) {
      controller.enqueue(`Hello ${name}, my name is Alice`)
      await sleep(50)
      controller.enqueue(`Hello ${name}, my name is Alice`)
      await sleep(50)
      controller.enqueue(`Hello ${name}, my name is Alice`)
      controller.close()
    },
  })
}
