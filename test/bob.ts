let bobCount = 0

export function hi(name: string) {
  return `Hi ${name}, I am Bob`
}

export function bump() {
  bobCount += 1
}

export function getCount() {
  return bobCount
}
