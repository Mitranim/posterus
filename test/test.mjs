import * as t from './utils.mjs'
import * as p from '../posterus.mjs'
import * as pf from '../fiber.mjs'

/** Utils **/

function noop() {}

async function seq(funs) {
  for (const fun of funs) {
    try {
      await fun()
    }
    catch (err) {
      console.error(`exception in test "${fun.name}":`, err)
      process.exit(1)
    }
  }
}

const timer = setTimeout(function onTimeout() {throw Error('test timed out')}, 512)

// Must be used as `seq().then(clearTimer)`.
const clearTimer = clearTimeout.bind(undefined, timer)

function panic() {
  console.error(Error('panic'))
  process.exit(1)
}

/** Tests **/

/*
Note: after the 0.5.0 rewrite, the test suite had to be rewritten and might be
incomplete. Posterus 0.5.0 was used in production for 1-2 years without any
issues, but there might still be edge cases that never came to light. The old
suite is not applicable because it was designed for asynchronous completion,
which no longer exists.
*/

seq([
  function isTask() {
    t.is(p.isTask(new p.Task()), true)
    t.is(p.isTask(Promise.resolve()), false)
  },

  function isDone() {
    const task = new p.Task()
    t.is(task.isDone(), false)
    task.done()
    t.is(task.isDone(), true)
  },

  function mapperMethodsReturnSelf() {
    const task = new p.Task()
    t.is(task.map(noop), task)
    t.is(task.mapErr(noop), task)
    t.is(task.mapVal(noop), task)
  },

  function doneCallsMap() {
    const task = new p.Task()
    task.map(() => {called = true})
    let called
    task.done()
    t.is(called, true)
  },

  function doneCallsMultipleMaps() {
    const task = new p.Task()
    let count = 0
    task.map(() => {count += 1})
    task.map(() => {count += 1})
    task.map(() => {count += 1})
    task.done()
    t.is(count, 3)
  },

  function doneCallsMapWithError() {
    const task = new p.Task()
    let args
    task.map((...a) => {args = a})
    task.done('err', undefined)
    t.eq(args, ['err', undefined])
  },

  function doneCallsMapWithValue() {
    const task = new p.Task()
    let args
    task.map((...a) => {args = a})
    task.done(undefined, 'val')
    t.eq(args, [undefined, 'val'])
  },

  function doneOrMapVoidsUnusedError() {
    const task = new p.Task()
    let args
    task.map((...a) => {args = a})
    task.done('', 'val')
    t.eq(args, [undefined, 'val'])
  },

  function doneOrMapVoidsUnusedResult() {
    const task = new p.Task()
    let args
    task.map((...a) => {args = a})
    task.done('err', 'unused')
    t.eq(args, ['err', undefined])
  },

  async function mapRequiresFunction() {
    await t.throws(() => {new p.Task().map()}, `satisfy test isFunction`)
    await t.throws(() => {new p.Task().map({})}, `satisfy test isFunction`)
  },

  async function mapThrowsAfterDone() {
    const task = new p.Task()
    task.done()
    await t.throws(() => {task.map(noop)}, `task is done`)
  },

  async function doneWithErrorThrowsIfUnhandled() {
    const task = new p.Task()
    await t.throws(() => {task.done(Error('test error'), undefined)}, 'test error')
  },

  async function throwingInMapBecomesUnhandledError() {
    const task = new p.Task()
    task.map(() => {throw Error('test error')})
    await t.throws(() => {task.done()}, 'test error')
  },

  function mapHandlesPreviousError() {
    const task = new p.Task()
    task.map(() => {throw 'err'})

    let args
    task.map((...a) => {args = a})
    task.done()
    t.eq(args, ['err', undefined])
  },

  function mapChangesValue() {
    const task = new p.Task()
    task.map(() => 'val')

    let args
    task.map((...a) => {args = a})
    task.done()
    t.eq(args, [undefined, 'val'])
  },

  function mapErrorChain() {
    const task = new p.Task()
    task.map(() => {throw 10})
    task.map(err => {throw err * 2})
    task.map(err => {throw err * 3})

    let args
    task.map((...a) => {args = a})
    task.done()
    t.eq(args, [10 * 2 * 3, undefined])
  },

  function mapValueChain() {
    const task = new p.Task()
    task.map(() => 10)
    task.map((_err, val) => val * 2)
    task.map((_err, val) => val * 3)

    let args
    task.map((...a) => {args = a})
    task.done()
    t.eq(args, [undefined, 10 * 2 * 3])
  },

  function mapVoidsUnusedError() {
    const task = new p.Task()
    task.map(() => {throw ''})
    task.map(() => 'val')

    let args
    task.map((...a) => {args = a})
    task.done()
    t.eq(args, [undefined, 'val'])
  },

  function mapVoidsUnusedResult() {
    const task = new p.Task()
    task.map(() => 'unused')
    task.map(() => {throw 'err'})

    let args
    task.map((...a) => {args = a})
    task.done()
    t.eq(args, ['err', undefined])
  },

  function doneConsumesAndFlattensInnerTaskError() {
    const inner = new p.Task()
    const outer = new p.Task()
    outer.done(undefined, inner)

    let args
    outer.map((...a) => {args = a})
    inner.done('err', undefined)
    t.eq(args, ['err', undefined])
  },

  function doneConsumesAndFlattensInnerTaskValue() {
    const inner = new p.Task()
    const outer = new p.Task()
    outer.done(undefined, inner)

    let args
    outer.map((...a) => {args = a})
    inner.done(undefined, 'val')
    t.eq(args, [undefined, 'val'])
  },

  function longSyncChain() {
    let args
    const task = new p.Task()
    task.map((err, _val) => {throw `${err} two`})
    task.mapErr(err => `${err} three`)
    task.mapVal(val => `${val} four`)
    task.map((...a) => {args = a})
    task.done('one', undefined)
    t.eq(args, [undefined, 'one two three four'])
  },

  function redundantDone() {
    const task = new p.Task()
    task.done()
    // Currently a noop. Could become an exception in the future.
    task.done()
  },

  async function toPromiseOk() {
    const promise = p.async.fromVal(10).toPromise()
    t.eq(promise instanceof Promise, true)
    t.eq(await promise, 10)
  },

  async function toPromiseFail() {
    const promise = p.async.fromErr(Error('test error')).toPromise()
    t.eq(promise instanceof Promise, true)
    await t.throws(async () => await promise, 'test error')
  },

  async function toPromiseDeinit() {
    const task = p.async.fromVal(10)
    const promise = task.toPromise()
    task.deinit()
    await t.throws(async () => await promise, `deinit`)
  },

  async function fromPromiseOk() {
    const promise = Promise.resolve(10)
    const task = p.fromPromise(promise)

    let args
    task.map((...a) => {args = a})

    await promise

    t.eq(args, [undefined, 10])
  },

  async function fromPromiseFail() {
    const promise = Promise.reject('test error')
    const task = p.fromPromise(promise)

    let args
    task.map((...a) => {args = a})

    await task.toPromise()

    t.eq(args, ['test error', undefined])
  },

  function fiber() {
    const task = pf.fiber(outer('one'))

    function* outer(val) {
      val = yield inner(val)
      return val + (yield inner(' two'))
    }

    function* inner(val) {return val}

    let args
    task.map((...a) => {args = a})

    p.async.tick()

    t.eq(args, [undefined, 'one two'])
  },

  function fiberDeinit() {
    function* outer() {
      yield inner()
    }

    function* inner() {
      const task = new p.Task()
      task.onDeinit(() => {throw Error('test error')})
      yield task
    }

    t.throws(() => pf.fiber(outer()).deinit(), 'test error')
  },

  function branchOk() {
    const task = p.async.fromVal('val')
    const branch0 = p.branch(task)
    const branch1 = p.branch(task)

    let args
    task.map((...a) => {args = a})

    let args0
    branch0.map((...a) => {args0 = a})

    let args1
    branch1.map((...a) => {args1 = a})

    p.async.tick()
    t.eq(args, [undefined, 'val'])
    t.eq(args0, [undefined, 'val'])
    t.eq(args1, [undefined, 'val'])
  },

  function branchFail() {
    const task = p.async.fromErr('err')
    const branch0 = p.branch(task)
    const branch1 = p.branch(task)

    let args
    task.map((...a) => {args = a})

    let args0
    branch0.map((...a) => {args0 = a})

    let args1
    branch1.map((...a) => {args1 = a})

    p.async.tick()
    t.eq(args, ['err', undefined])
    t.eq(args0, ['err', undefined])
    t.eq(args1, ['err', undefined])
  },

  function branchDeinitUpstream() {
    const task = p.async.fromVal('val')
    p.branch(task).deinit()
    p.branch(task).deinit()

    let args
    task.map((...a) => {args = a})

    p.async.tick()
    t.eq(args, [undefined, 'val'])
  },

  async function branchDeinitDownstream() {
    const task = p.async.fromVal('val')
    const branch0 = p.branch(task)
    const branch1 = p.branch(task)

    task.deinit()

    await t.throws(() => branch0.map(noop), 'task is done')
    await t.throws(() => branch1.map(noop), 'task is done')
  },

  function allOk() {
    const task = p.all([
      'one',
      p.async.fromVal('two'),
      p.async.fromVal().mapVal(() => 'three'),
    ])

    let args
    task.map((...a) => {args = a})

    p.async.tick()
    t.eq(args, [undefined, ['one', 'two', 'three']])
  },

  function allFail() {
    const task = p.all([
      p.async.fromErr('err'),
      p.async.fromVal().mapVal(panic),
    ])

    let args
    task.map((...a) => {args = a})

    p.async.tick()
    t.eq(args, ['err', undefined])
  },

  function raceOk() {
    const task = p.race([
      p.async.fromVal('one'),
      p.async.fromErr(Error('two')),
      'three',
      p.async.fromVal().mapVal(panic),
    ])

    let args
    task.map((...a) => {args = a})

    p.async.tick()
    t.eq(args, [undefined, 'three'])
  },

  function raceFail() {
    const task = p.race([
      p.async.fromErr('err'),
      p.async.fromVal('val'),
      p.async.fromVal().mapVal(panic),
    ])

    let args
    task.map((...a) => {args = a})

    p.async.tick()
    t.eq(args, ['err', undefined])
  },
]).then(clearTimer)
