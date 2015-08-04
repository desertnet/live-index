import {EventEmitter} from "events"
import TailFollow from "tail-follow"
import {resolve} from "path"

export default class LiveIndex extends EventEmitter {
  constructor ({pathToWatch, indexer}) {
    super()

    this._watchPaths = []
    this._indexers = []
    this._tails = new Map()
    this._files = new Map()
    this._index = new Map()
    this._unprocessedChunks = new WeakMap()

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
    this._watchPaths.push(resolve(path))
  }

  addIndexer (evaluator) {
    this._indexers.push(evaluator)
  }

  watch () {
    this._watchPaths.forEach(path => {
      const file = new File(path)
      this._files.set(path, file)

      const tail = new TailFollow(path, {
        surviveRotation: true,
        objectMode: true
      })
      this._tails.set(path, tail)

      tail
        .on("data", chunk => {
          const pos = tail.positionForChunk(chunk)
          this._evaluateChunk(tail, path, pos, chunk)
        })
        .on("rename", (oldPath, newPath) => {
          const renamedFile = this._files.get(oldPath)
          renamedFile.path = newPath
          this._files.set(newPath, renamedFile)
          this._files.set(oldPath, new File(oldPath))
        })
    })
  }

  _evaluateChunk (tail, path, pos, chunk) {
    this._indexers.forEach(indexer => {
      const unprocessedChunk = this._unprocessedChunks.get(tail)
      if (unprocessedChunk) {
        chunk = Buffer.concat([unprocessedChunk, chunk])
        pos = pos - unprocessedChunk.length
        this._unprocessedChunks.delete(tail)
      }

      const processedTo = processedPos => {
        this._unprocessedChunks.set(tail, chunk.slice(processedPos))
      }

      const addIndex = (identifier, positionInChunk) => {
        this.insert(identifier, path, pos + positionInChunk)
      }

      indexer(chunk, addIndex, processedTo)
    })
  }

  insert (identifier, filePath, position) {
    const file = this._files.get(filePath)
    this._index.set(identifier, {file, position})
    this.emit("insert", identifier)
  }

  fileAndPositionForIdentifier (identifier) {
    const result = this._index.get(identifier)
    if (result === undefined) { return undefined }
    return {
      position: result.position,
      file: result.file.path
    }
  }
}

class File {
  constructor (path) {
    this.path = path
  }
}
