import {EventEmitter} from "events"
import TailFollow from "tail-follow"
import {resolve} from "path"
import CatTail from "cat-tail"

export default class LiveIndex extends EventEmitter {
  constructor ({pathToWatch, indexer, tailChunkSize} = {}) {
    super()

    this._watchPath = null
    this._indexer = null
    this._tail = null
    this._files = new Map()
    this._index = new Map()
    this._unprocessedChunks = new WeakMap()
    this._tailChunkSize = tailChunkSize

    if (pathToWatch) {
      this.setPathToWatch(pathToWatch)
    }

    if (indexer) {
      this.setIndexer(indexer)
    }

    if (pathToWatch && indexer) {
      this.watch()
    }
  }

  setPathToWatch (path) {
    this._watchPath = resolve(path)
  }

  setIndexer (evaluator) {
    this._indexer = evaluator
  }

  watch () {
    const path = this._watchPath
    this.addDataFileWithoutIndexing(path)

    this._tail = new TailFollow(path, {
      surviveRotation: true,
      objectMode: true,
      tailChunkSize: this._tailChunkSize
    })

    this._tail
      .on("data", chunk => this._evaluateChunk(path, this._tail, chunk))
      .on("rename", (oldPath, newPath) => {
        const renamedFile = this._files.get(oldPath)
        renamedFile.path = newPath
        this._files.set(newPath, renamedFile)
        this._files.set(oldPath, new File(oldPath))
      })
  }

  _evaluateChunk (path, tail, chunk) {
    const indexer = this._indexer
    let pos = tail.positionForChunk(chunk)

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

  addStaticDataFile (path, cb) {
    this.addDataFileWithoutIndexing(path)
    const tail = new TailFollow(resolve(path), {
      follow: false,
      objectMode: true,
      tailChunkSize: this._tailChunkSize
    })
    
    tail
      .once("error", err => cb(err))
      .on("data", chunk => this._evaluateChunk(path, tail, chunk))
      .once("end", () => cb(null))
  }

  addDataFileWithoutIndexing (path) {
    const resolvedPath = resolve(path)
    this._files.set(resolvedPath, new File(resolvedPath))
  }

  setIndexStorageObject (obj) {
    this._index = obj
  }

  readStreamBetweenIndexes (startId, endId) {
    const startIndex = this.fileAndPositionForIdentifier(startId)
    if (startIndex === undefined) {
      return undefined
    }

    const endIndex = this.fileAndPositionForIdentifier(endId)
    if (endIndex === undefined) {
      return undefined
    }

    return new CatTail(this._filesBetween(startIndex.file, endIndex.file), {
      start: startIndex.position,
      end: endIndex.position - 1
    })
  }

  get files () {
    const files = []
    const fileIterator = this._files.entries()
    while (true) {
      const entry = fileIterator.next()
      if (entry.done) { break }
      files.push(entry.value)
    }
    return files.map(f => f[1].path)
  }

  _filesBetween (startFile, endFile) {
    const files = this.files
    const startFileIndex = files.indexOf(startFile)
    const endFileIndex = files.indexOf(endFile)
    if (startFileIndex > endFileIndex) {
      throw new Error(`Nonsensical attempt to find files between ${startFile} and ${endFile}. (Did you use a start index as your end index?)`)
    }
    // assert startFileIndex <= endFileIndex
    return files.slice(startFileIndex, endFileIndex + 1)
  }
}

class File {
  constructor (path) {
    this.path = path
  }
}
