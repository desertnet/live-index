import assert from "assert"
import tmp from "tmp"
import path from "path"
import fs from "fs"
import concat from "concat-stream"

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
  })

  describe("indexer", () => {
    it("processedTo callback should cause unprocessed buffer to be appended in next chunk", done => {
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
    beforeEach(done => {
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
})

class MockIndexStorage {
  constructor () {
    this._getCalledWith = null
    this._setCalledWith = null
  }

  get (id) {
    this._getCalledWith = Array.from(arguments)
  }

  set (id, val) {
    this._setCalledWith = Array.from(arguments)
  }

  assertGetCalledWith () {
    assert.deepEqual(this._getCalledWith, Array.from(arguments))
  }

  assertSetCalledWith () {
    assert.deepEqual(this._setCalledWith, Array.from(arguments))
  }
}
