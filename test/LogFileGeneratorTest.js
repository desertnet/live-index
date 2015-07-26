import assert from "assert"
import tmp from "tmp"
import path from "path"
import fs from "fs"

import LogFileGenerator from "../mock/LogFileGenerator.js"

tmp.setGracefulCleanup()

describe("LogFileGenerator", () => {
  let generator, dir

  beforeEach(() => {
    generator = new LogFileGenerator()
    dir = tmp.dirSync({ unsafeCleanup: true }).name
  })

  describe("writeLog()", () => {
    let logPath

    beforeEach(() => {
      logPath = path.join(dir, "foo.log")
    })

    it("should create a file at the given path", done => {
      generator.on("created", () => {
        assert(fs.existsSync(logPath))
        return done()
      })

      generator.writeLog(logPath)
    })

    it("should write some entries to file", done => {
      generator.on("flushed", () => {
        const fileData = fs.readFileSync(logPath).toString()
        assert(fileData.match(/:/))
        return done()
      })

      generator.writeLog(logPath)
    })
  })
})
