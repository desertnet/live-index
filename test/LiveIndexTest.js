import assert from "assert"
import tmp from "tmp"
import path from "path"
import fs from "fs"
import concat from "concat-stream"
import sinon from "sinon"

import LogFileGenerator from "../mock/LogFileGenerator.js"
import LiveIndex from "../lib/LiveIndex.js"

tmp.setGracefulCleanup()

const fooFixturePath = path.resolve(__dirname, "..", "fixtures", "foo.txt")
const fooFixtureData = fs.readFileSync(fooFixturePath)
const barFixturePath = path.resolve(__dirname, "..", "fixtures", "bar.txt")
const barFixtureData = fs.readFileSync(barFixturePath)

describe("LiveIndex", () => {
  let index, logGenerator, dir, logPath

  const simpleIndexer = (data, addIndex) => {
    let pos = 0
    data.toString().split(/\n+/).forEach(s => {
      const m = s.match(/[^:]+/);
      if (m) { addIndex(m[0], pos) }
      pos += s.length + 1
    })
  }

  beforeEach(done => {
    logGenerator = new LogFileGenerator()
    dir = tmp.dirSync({ unsafeCleanup: true }).name
    logPath = path.join(dir, "foo.log")
    logGenerator.createLog(logPath)
    logGenerator.on("created", () => {
      index = new LiveIndex({ pathToWatch: logPath })
      return done()
    })
  })

  describe("fileAndPositionForIdentifier()", () => {
    beforeEach(() => {
      index.setIndexer(simpleIndexer)
      index.watch()
    })

    it("should return the correct file and position for the id", done => {
      index.once("insert", id => {
        assert.strictEqual(id, logGenerator.ids[0])
        const result = index.fileAndPositionForIdentifier(id)
        assert.strictEqual(result.file, logPath)
        assert.strictEqual(result.position, 0)
        return done()
      })
      logGenerator.writeLog()
    })

    it("should update the file name when the underlying file is renamed", done => {
      logGenerator.on("flushed", () => {
        const newPath = path.join(dir, "renamed.txt")
        logGenerator.renameFile(newPath, () => {
          setTimeout(() => {
            const result = index.fileAndPositionForIdentifier(logGenerator.ids[0])
            assert.strictEqual(result.file, newPath)
            return done()
          }, 40)
        })
      })
      logGenerator.writeLog()
    })

    it("should resolve link entries", () => {
      index.addStaticDataFile(fooFixturePath)
      index.insert("foo", fooFixturePath, 9)
      index.insertLink("bar", "foo")
      const result = index.fileAndPositionForIdentifier("bar")
      const expected = index.fileAndPositionForIdentifier("foo")
      assert.deepEqual(expected, {file: fooFixturePath, position: 9})
      assert.deepEqual(result, expected)
    })

    describe("when using async storage", () => {
      it("should return a promise that resolves to the index entry", done => {
        index.setIndexStorageObject(new AsyncIndexStorage())
        index.addStaticDataFile(fooFixturePath)
        index.insert("foo", fooFixturePath, 9)
        index.insertLink("bar", "foo")
        index.fileAndPositionForIdentifier("bar").then(result => {
          assert.deepEqual(result, {file: fooFixturePath, position: 9})
          return done()
        })
      })
    })
  })

  describe("insertLink", () => {
    it("should throw an error when inserting a circular link", () => {
      index.addStaticDataFile(fooFixturePath)
      assert.throws(() => index.insertLink("foo", "foo"))

      index.insertLink("foo", "bar")
      assert.throws(() => index.insertLink("bar", "foo"))

      index.insertLink("bar", "baz")
      assert.throws(() => index.insertLink("baz", "foo"))
    })
  })

  describe("indexer", () => {
    describe("processedTo callback", () => {
      it("should cause unprocessed buffer to be appended in next chunk", done => {
        let callCount = 0
        index.setIndexer((data, addIndex, processedTo) => {
          callCount += 1
          if (callCount === 1) {
            assert(processedTo)
            processedTo(7)
          }
          else if (callCount === 2) {
            const expected = logGenerator.lines[0].slice(7) + logGenerator.lines[1]
            assert.strictEqual(data.toString(), expected)
            return done()
          }
        })
        index.watch()
        logGenerator.writeLog()
      })
    })

    describe("addIndex callback", () => {
      it("should call .insert() to add indexes", done => {
        const insertSpy = sinon.spy(index, "insert")
        index.setIndexer(simpleIndexer)
        index.watch()
        logGenerator.writeLog()
        logGenerator.on("flushed", () => {
          assert.strictEqual(insertSpy.callCount, 5)
          logGenerator.ids.forEach((id, i) => {
            assert(insertSpy.calledWithExactly(id, logPath, i*20))
          })
          return done()
        })
      })

      it("should call .insertLink() to add links", done => {
        const insertLinkSpy = sinon.spy(index, "insertLink")
        index.setIndexer((chunk, addIndex, processedTo) => {
          simpleIndexer(chunk, addIndex, processedTo)
          const lastId = logGenerator.ids.pop()
          addIndex(`link-${lastId}`, lastId)
        })
        index.watch()
        logGenerator.writeLog()
        logGenerator.on("flushed", () => {
          assert.strictEqual(insertLinkSpy.callCount, 5)
          logGenerator.ids.forEach((id, i) => {
            assert(insertLinkSpy.calledWithExactly(`link-${id}`, id))
          })
          return done()
        })
      })
    })
  })

  describe("setIndexStorageObject()", () => {
    let mockStore

    beforeEach(() => {
      mockStore = new MockIndexStorage()
      index = new LiveIndex()
      index.setIndexStorageObject(mockStore)
    })

    it("should update the object that is used when calling .insert()", () => {
      index.insert("foo", "file", 5)
      mockStore.assertSetCalledWith("foo", {file: undefined, position: 5})
    })

    it("should update the object that is used when calling fileAndPositionForIdentifier()", () => {
      index.fileAndPositionForIdentifier("foo")
      mockStore.assertGetCalledWith("foo")
    })
  })

  describe("addStaticDataFile()", () => {
    it("should add a file to the index", done => {
      index.setIndexer(simpleIndexer)
      index.watch()

      logGenerator.on("flushed", () => {

        index.addStaticDataFile(barFixturePath, err => {
          assert.ifError(err)
          const expected = {file: barFixturePath, position: 20}
          assert.deepEqual(index.fileAndPositionForIdentifier("EtBQPcgqTHA"), expected)
          return done()
        })
      })
      logGenerator.writeLog()
    })
  })

  describe("readStreamBetweenIndexes()", () => {
    function setUpReadStreamBetweenIndexesTest (done) {
      index.setIndexer(simpleIndexer)
      index.addStaticDataFile(barFixturePath, err => added(err, barFixturePath))
      index.addStaticDataFile(fooFixturePath, err => added(err, fooFixturePath))

      const seen = []
      function added (err, path) {
        assert.ifError(err)

        seen.push(path)
        if (seen.length !== 2) {
          return done()
        }
      }
    }

    describe("when using synchronous built in storage", () => {
      beforeEach(done => {
        setUpReadStreamBetweenIndexesTest(done)
      })

      it("should return undefined if index does not exist", () => {
        assert.strictEqual(index.readStreamBetweenIndexes("6fVmv625zfs", "nonexistent"), undefined)
        assert.strictEqual(index.readStreamBetweenIndexes("nonexistent", "6fVmv625zfs"), undefined)
        assert.strictEqual(index.readStreamBetweenIndexes("nonexistent", "nonexistent"), undefined)
      })

      it("should return a Readable stream beginning at the offset specified by the index", done => {
        index.readStreamBetweenIndexes("6fVmv625zfs", "cLlQfumYGlQ").pipe(concat(result => {
          assert.strictEqual(result.toString(), fooFixtureData.slice(40, 80).toString())
          return done()
        }))
      })

      it("should return a Readable stream that spans across files", done => {
        index.readStreamBetweenIndexes("EtBQPcgqTHA", "6fVmv625zfs").pipe(concat(result => {
          const barThenFoo = Buffer.concat([barFixtureData, fooFixtureData])
          assert.strictEqual(result.toString(), barThenFoo.slice(20, 140).toString())
          return done()
        }))
      })

      it("should emit an error when startId comes after endId in different files", () => {
        assert.throws(() => index.readStreamBetweenIndexes("6fVmv625zfs", "EtBQPcgqTHA"))
      })

      it("should emit an error when startId comes after endId in same file", () => {
        assert.throws(() => index.readStreamBetweenIndexes("cLlQfumYGlQ", "6fVmv625zfs"))
      })
    })

    describe("when using async storage", () => {
      beforeEach(done => {
        index.setIndexStorageObject(new AsyncIndexStorage())
        setUpReadStreamBetweenIndexesTest(done)
      })

      it("should return a promise that resolves to undefined if index does not exist", () => {
        return Promise.all([
          index.readStreamBetweenIndexes("nonexistent", "6fVmv625zfs"),
          index.readStreamBetweenIndexes("6fVmv625zfs", "nonexistent"),
          index.readStreamBetweenIndexes("nonexistent", "nonexistent")
        ]).then(([firstNonExistent, secondNonExistent, bothNonExistent]) => {
          assert.strictEqual(firstNonExistent, undefined)
          assert.strictEqual(secondNonExistent, undefined)
          assert.strictEqual(bothNonExistent, undefined)
        })
      })

      it("should return a promise that resolves to a Readable stream that spans across files", done => {
        index.readStreamBetweenIndexes("EtBQPcgqTHA", "6fVmv625zfs").then(stream => {
          stream.pipe(concat(result => {
            const barThenFoo = Buffer.concat([barFixtureData, fooFixtureData])
            assert.strictEqual(result.toString(), barThenFoo.slice(20, 140).toString())
            return done()
          }))
        })
      })
    })
  })
})

class MockIndexStorage {
  constructor () {
    this._map = Object.create(null)
    this._getCalledWith = null
    this._setCalledWith = null
  }

  get (id) {
    this._getCalledWith = Array.from(arguments)
    return this._map[id]
  }

  set (id, val) {
    this._setCalledWith = Array.from(arguments)
    this._map[id] = val
  }

  assertGetCalledWith () {
    assert.deepEqual(this._getCalledWith, Array.from(arguments))
  }

  assertSetCalledWith () {
    assert.deepEqual(this._setCalledWith, Array.from(arguments))
  }
}

class AsyncIndexStorage extends MockIndexStorage {
  get (id) {
    return new Promise(resolve => {
      process.nextTick(() => resolve(super.get(id)))
    })
  }

  set (id, val) {
    return new Promise(resolve => {
      process.nextTick(() => resolve(super.set(id, val)))
    })
  }
}
