import {EventEmitter} from "events"
import fs from "fs"

export default class LogFileGenerator extends EventEmitter {
  writeLog (path) {
    const writer = fs.createWriteStream(path)
    writer.on("open", fd => {
      this.emit("created", path)
    })
  }
}
