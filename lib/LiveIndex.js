import {EventEmitter} from "events"
import Tail from "always-tail"

export default class LiveIndex extends EventEmitter {
  constructor ({pathToWatch, identifierPattern, recordSeparator}) {
    super()

    this._watchPaths = []
    this._identifierPatterns = []
    this._recordSeparator = recordSeparator || "\n"
    this._tails = new Map()

    if (pathToWatch) {
      this.addPathToWatch(pathToWatch)
    }

    if (identifierPattern) {
      this.addIdentifierPattern(identifierPattern)
    }

    if (pathToWatch && identifierPattern) {
      this.watch()
    }
  }

  addPathToWatch (path) {
    this._watchPaths.push(path)
  }

  addIdentifierPattern (pattern) {
    this._identifierPatterns.push(pattern)
  }

  watch () {
    this._watchPaths.forEach(path => {
      const tail = new Tail(path, this._recordSeparator)
      tail.on("line", data => this._evaluateRecord(path, data))
      tail.watch()
      console.log("watching %s", path)
      this._tails.set(path, tail)
    })
  }

  _evaluateRecord (path, record) {
    console.log(path, record)
  }
}
