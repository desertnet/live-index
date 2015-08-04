import assert from "assert"
import tmp from "tmp"
import path from "path"

import LogFileGenerator from "../mock/LogFileGenerator.js"
import LiveIndex from "../lib/LiveIndex.js"

tmp.setGracefulCleanup()

describe("LiveIndex", () => {
  let index, logGenerator, dir, logPath

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
      index.addIndexer((data, addIndex) => {
        const m = data.toString().match(/[^:]+/);
        if (m) {
          addIndex(m[0], 0)
        }
      })
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
      index.addIndexer((data, addIndex, processedTo) => {
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
})
