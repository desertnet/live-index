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
    it("should create a file at the given path", done => {
      const logPath = path.join(dir, "foo.log")

      generator.on("created", () => {
        assert(fs.existsSync(logPath))
        return done()
      })

      generator.writeLog(logPath)
    })
  })
})
