import {EventEmitter} from "events"
import TailFollow from "tail-follow"
import MatchStream from "match-stream"

export default class LiveIndex extends EventEmitter {
  constructor ({pathToWatch, recordIdentifier, recordSeparator}) {
    super()

    this._watchPaths = []
    this._recordIdentifiers = []
    this._recordSeparator = recordSeparator || "\n"
    this._tails = new Map()
    this._index = new Map()

    if (pathToWatch) {
        this.addPathToWatch(pathToWatch)
    }

    if (recordIdentifier) {
      this.addRecordIdentifier(recordIdentifier)
    }

    if (pathToWatch && recordIdentifier) {
      this.watch()
    }
  }

  addPathToWatch (path) {
    this._watchPaths.push(path)
  }

  addRecordIdentifier (evaluator) {
    this._recordIdentifiers.push(evaluator)
  }

  watch () {
    this._watchPaths.forEach(path => {
      let accumulator = new Buffer(0)
      const tail = new TailFollow(path, { surviveRotation: true })
      const ms = new MatchStream({ pattern: this._recordSeparator }, (buf, matched) => {
        accumulator = Buffer.concat([accumulator, buf])
        if (matched) {
          this._evaluateRecord(path, accumulator)
          accumulator = new Buffer(0)
        }
      })
      this._tails.set(path, tail)
      tail.pipe(ms)
    })
  }

  _evaluateRecord (path, record) {
    this._recordIdentifiers.forEach(recordIdentifier => {
      const identifier = recordIdentifier(record)
      if (identifier) {
        this.insert(identifier, path, 0)
      }
    })
  }

  insert (identifier, file, position) {
    this._index.set(identifier, {file, position})
    this.emit("insert", identifier)
  }

  fileAndPositionForIdentifier (identifier) {
    return this._index.get(identifier)
  }
}
