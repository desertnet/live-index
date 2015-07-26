import {EventEmitter} from "events"
import fs from "fs"

export default class LogFileGenerator extends EventEmitter {
  constructor () {
    super()

    this._writer = null
    this._numberOfLinesToWrite = 5
  }

  createLog (path) {
    this._writer = fs.createWriteStream(path)

    this._writer.on("open", fd => {
      this.emit("created", path)
    })
  }

  writeLog () {
    setImmediate(() => this._writeUntilFlushed())
  }

  _writeUntilFlushed () {
    if (this._numberOfLinesToWrite != 0) {
      this._writer.write("foo:bar\n")
      this._numberOfLinesToWrite -= 1
      setImmediate(() => this._writeUntilFlushed())
    }
    else {
      this.emit("flushed")
    }
  }
}
