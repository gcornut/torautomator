
const fn = require('./fn')

const trace = fn.curry(async function* trace(m, input) {
  for await (let i of await asIterator(input)) {
    console.debug(m, i)
    yield i
  }
})

const map = fn.curry(async function* map(fun, input) {
  for await (let i of await asIterator(input))
    yield fun(i)
})

const mapEager = fn.curry(async function* mapEager(fun, input) {
  yield* await consume(map(fun, input))
})

const reduce = fn.curry(async function reduce(fun, init, input) {
  let acc = init
  for await (let i of await asIterator(input))
    acc = await fun(acc, i)
  return acc
})

const filter = fn.curry(async function* filter(fun, input) {
  for await (let i of await asIterator(input))
    if (await fun(i)) yield i
})

const filterEager = fn.curry(async function* filterEager(fun, input) {
  yield* fn.pipe(
    filter(async ([i, p]) => await p),
    map(([i, p]) => i)
  )(mapEager(i => [i, fun(i)], input))
})

const mapcat = fn.curry(async function* mapcat(fun, input) {
  for await (let i of await asIterator(input)) {
    for await (const k of fun(i)) yield k
  }
})

async function consume(input) {
  return reduce(async (res, i) => res.concat([await i]), [], input)
}

const partition = fn.curry(async function* partition(n, input) {
  let batch = []
  for await (let i of await asIterator(input)) {
    batch.push(i)
    if (batch.length >= n) {
      yield Promise.all([...batch])
      batch = []
    }
  }
  yield Promise.all([...batch])
})

async function asIterator(input) {
  let xs = await input
  if (Symbol.iterator in xs) return xs[Symbol.iterator]()
  else if (Symbol.asyncIterator in xs) return xs[Symbol.asyncIterator]()
  throw new TypeError('TypeError: input is not (async) iterable')
}

const zip = fn.curry(async function* zip(input1, input2) {
  let it1 = await asIterator(input1)
  let done1 = false
  let it2 = await asIterator(input2)
  let done2 = false
  do {
    let i1 = it1.next()
    yield i1.value
    done1 = i1.done
    let i2 = it2.next()
    yield i2.value
    done2 = i2.done
  } while (!done1 && !done2)
  do {
    let i1 = it1.next()
    yield i1.value
    done1 = i1.done
  } while (!done1)
  do {
    let i2 = it2.next()
    yield i2.value
    done2 = i2.done
  } while (!done2)
})

async function firstAndRest(input) {
  let it = await asIterator(input)
  if (!it) return []
  let first = await it.next()
  return [first.value, it]
}

async function* reverse(input) {
  yield* reduce((res, i) => [i].concat(res), [], input)
}

module.exports = {
  trace,
  map, mapEager, mapcat, reduce, filter, filterEager,
  consume, partition, reverse, firstAndRest
}


/*

function * a() {
  yield 1
  yield 2
  yield 3
}
async function * b() {
  yield 1
  yield 2
  yield 3
  yield 4
  yield 5
  yield 6
  yield 7
  yield 8
}

// test filter
(async () => {
  console.log(await consume(filter(n => n > 2, b())))
  console.log(await consume(filter(n => n > 2, consume(b()))))
})()
function c() {
  return [1, 2 ,3]
}
(async () => {
  let first, rest

  [first, rest] = await firstAndRest(a())
  console.log(first, await consume(rest))
  [first, rest] = await firstAndRest(b())
  console.log(first, await consume(rest))
  [first, rest] = await firstAndRest(c())
  console.log(first, await consume(rest))
})()


// test partition
(async () => {
  console.log(await consume(partition(2, b())))
  console.log(await consume(partition(3, b())))
  console.log(await consume(partition(100, b())))
})()
*/
