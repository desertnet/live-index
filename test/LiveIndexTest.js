import assert from "assert"
import tmp from "tmp"
import path from "path"
import fs from "fs"
import concat from "concat-stream"
import sinon from "sinon"

import LogFileGenerator from "../mock/LogFileGenerator.js"
import MockIndexStorage from "../mock/MockIndexStorage.js"
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
      index = new LiveIndex({
        pathToWatch: logPath,
        indexer: simpleIndexer
      })
      return done()
    })
  })

  describe("fileAndPositionForIdentifier()", () => {
    it("should return the correct file and position for the id", done => {
      logGenerator.writeLog()
      index.once("insert", id => {
        assert.strictEqual(id, logGenerator.ids[0])
        index.fileAndPositionForIdentifier(id).then(result => {
          assert.strictEqual(result.file, logPath)
          assert.strictEqual(result.position, 0)
          return done()
        })
      })
    })

    it("should update the file name when the underlying file is renamed", done => {
      logGenerator.on("flushed", () => {
        const newPath = path.join(dir, "renamed.txt")
        logGenerator.renameFile(newPath, () => {
          setTimeout(() => {
            index.fileAndPositionForIdentifier(logGenerator.ids[0]).then(result => {
              assert.strictEqual(result.file, newPath)
              return done()
            })
          }, 40)
        })
      })
      logGenerator.writeLog()
    })

    it("should resolve link entries", () =>
      index.addStaticDataFile(fooFixturePath)
        .then(() => Promise.all([
          index.insert("foo", fooFixturePath, 9),
          index.insertLink("bar", "foo")
        ]))
        .then(() => index.fileAndPositionForIdentifier("bar"))
        .then(result => {
          assert.deepEqual(result, {file: fooFixturePath, position: 9})
        })
    )

    it("should reject when traversing a self referential link", done => {
      index.addStaticDataFile(fooFixturePath)
      index.insertLink("foo", "foo")
        .then(() => index.fileAndPositionForIdentifier("foo"))
        .then(() => assert.fail(), err => {
          assert(err)
          return done()
        })
    })

    it("should reject when traversing a circular link", done => {
      index.addStaticDataFile(fooFixturePath)
      Promise.all([
        index.insertLink("foo", "bar"),
        index.insertLink("bar", "foo"),
      ]).then(() => index.fileAndPositionForIdentifier("foo"))
        .then(() => assert.fail(), err => {
          assert(err)
          return done()
        })
    })

    it("should reject when storage fails with an error", done => {
      index.setIndexStorageObject(new ExplodingStorage())
      index.fileAndPositionForIdentifier("foo").catch(err => {
        assert(err)
        return done()
      })
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
        logGenerator.writeLog()
      })
    })

    describe("addIndex callback", () => {
      it("should call .insert() to add indexes", done => {
        const insertSpy = sinon.spy(index, "insert")
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
      index.setIndexStorageObject(mockStore)
    })

    it("should update the object that is used when calling .insert()", () =>
      index._fileList.identifierForPath(logGenerator.path).then(fileId =>
        index.insert("foo", logGenerator.path, 5).then(() => {
          mockStore.assertSetCalledWith("foo", {fileId, position: 5})
        })
      )
    )

    it("should update the object that is used when calling fileAndPositionForIdentifier()", () => {
      index.fileAndPositionForIdentifier("foo")
      mockStore.assertGetCalledWith("foo")
    })
  })

  describe("addStaticDataFile()", () => {
    it("should add a file to the index", done => {
      logGenerator.writeLog()

      logGenerator.once("flushed", () => {
        index.addStaticDataFile(barFixturePath, err => {
          assert.ifError(err)
          const expected = {file: barFixturePath, position: 20}
          index.fileAndPositionForIdentifier("EtBQPcgqTHA").then(result => {
            assert.deepEqual(result, expected)
            return done()
          })
        })
      })
    })
  })

  describe("readStreamBetweenIndexes()", () => {
    beforeEach(() => {
      index.setIndexer(simpleIndexer)
      return Promise.all([
        index.addStaticDataFile(barFixturePath),
        index.addStaticDataFile(fooFixturePath)
      ])
    })

    it("should return undefined if index does not exist", () => {
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

    it("should return a Readable stream beginning at the offset specified by the index", done => {
      index.readStreamBetweenIndexes("6fVmv625zfs", "cLlQfumYGlQ").then(stream => {
        stream.pipe(concat(result => {
          assert.strictEqual(result.toString(), fooFixtureData.slice(40, 80).toString())
          return done()
        }))
      })
    })

    it("should return a Readable stream that spans across files", done => {
      index.readStreamBetweenIndexes("EtBQPcgqTHA", "6fVmv625zfs").then(stream => {
        stream.pipe(concat(result => {
          const barThenFoo = Buffer.concat([barFixtureData, fooFixtureData])
          assert.strictEqual(result.toString(), barThenFoo.slice(20, 140).toString())
          return done()
        }))
      })
    })

    it("should reject when startId comes after endId in different files", done => {
      index.readStreamBetweenIndexes("6fVmv625zfs", "EtBQPcgqTHA").catch(err => {
        assert(err)
        return done()
      })
    })

    it("should reject when startId comes after endId in same file", done => {
      index.readStreamBetweenIndexes("cLlQfumYGlQ", "6fVmv625zfs").catch(err => {
        assert(err)
        return done()
      })
    })

    it("should reject when storage returns an error", done => {
      index.setIndexStorageObject(new ExplodingStorage())
      index.readStreamBetweenIndexes("EtBQPcgqTHA", "6fVmv625zfs").catch(err => {
        assert(err)
        return done()
      })
    })
  })

  describe("insert()", () => {
    it("should emit an error when insertion fails", done => {
      index.setIndexStorageObject(new ExplodingStorage())
      index.insert("foo", "foo.log", 0)
      index.once("error", err => {
        assert(err)
        return done()
      })
    })
  })

  describe("insertLink()", () => {
    it("should emit an error when link insertion fails", done => {
      index.setIndexStorageObject(new ExplodingStorage())
      index.insertLink("foo", "bar")
      index.once("error", err => {
        assert(err)
        return done()
      })
    })
  })
})

class ExplodingStorage {
  get (id) {
    return Promise.reject(new Error("Failed to read A:\\MYDB.DAT"))
  }

  set (id, val) {
    return Promise.reject(new Error("Can't open A:\\MYDB.DAT"))
  }
}
