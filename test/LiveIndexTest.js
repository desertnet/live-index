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
      index = new LiveIndex({
        pathToWatch: logPath,
        recordIdentifier: record => { const m = record.toString().match(/[^:]+/); return m ? m[0] : undefined; }
      })
      return done()
    })
  })

  describe("fileAndPositionForIdentifier()", () => {
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
  })
})
