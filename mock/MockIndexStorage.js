import assert from "assert"

export default class MockIndexStorage {
  constructor () {
    this._map = Object.create(null)
    this._getCalledWith = null
    this._setCalledWith = null
  }

  get (id) {
    this._getCalledWith = Array.from(arguments)
    return new Promise(resolve => {
      process.nextTick(() => resolve(this._map[id]))
    })
  }

  set (id, val) {
    this._setCalledWith = Array.from(arguments)
    return new Promise(resolve => {
      process.nextTick(() => resolve(this._map[id] = val))
    })
  }

  assertGetCalledWith () {
    assert.deepEqual(this._getCalledWith, Array.from(arguments))
  }

  assertSetCalledWith () {
    assert.deepEqual(this._setCalledWith, Array.from(arguments))
  }
}
