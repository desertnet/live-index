import {EventEmitter} from "events"
import TailFollow from "tail-follow"

export default class LiveIndex extends EventEmitter {
  constructor ({pathToWatch, indexer}) {
    super()

    this._watchPaths = []
    this._indexers = []
    this._tails = new Map()
    this._index = new Map()

    if (pathToWatch) {
        this.addPathToWatch(pathToWatch)
    }

    if (indexer) {
      this.addIndexer(indexer)
    }

    if (pathToWatch && indexer) {
      this.watch()
    }
  }

  addPathToWatch (path) {
    this._watchPaths.push(path)
  }

  addIndexer (evaluator) {
    this._indexers.push(evaluator)
  }

  watch () {
    this._watchPaths.forEach(path => {
      const tail = new TailFollow(path, {
        surviveRotation: true,
        objectMode: true
      })
      this._tails.set(path, tail)
      tail.on("data", chunk => {
        const pos = tail.positionForChunk(chunk)
        this._evaluateChunk(path, pos, chunk)
      })
    })
  }

  _evaluateChunk (path, pos, chunk) {
    this._indexers.forEach(indexer => {
      const addIndex = (identifier, positionInChunk) => {
        this.insert(identifier, path, pos + positionInChunk)
      }
      indexer(chunk, addIndex)
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
