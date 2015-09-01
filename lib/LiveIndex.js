import {EventEmitter} from "events"
import TailFollow from "tail-follow"
import {resolve} from "path"
import CatTail from "cat-tail"
import isString from "lodash.isstring"
import isPromise from "is-promise"
import StorageProxy from "./StorageProxy.js"
import maybe from "./maybe.js"

export default class LiveIndex extends EventEmitter {
  constructor ({pathToWatch, indexer, tailChunkSize, rotationPollInterval} = {}) {
    super()

    this._watchPath = null
    this._indexer = null
    this._tail = null
    this._files = new Map()
    this._unprocessedChunks = new WeakMap()
    this._tailChunkSize = tailChunkSize
    this._rotationPollInterval = rotationPollInterval

    this.setIndexStorageObject(new Map())

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
      tailChunkSize: this._tailChunkSize,
      fileRenamePollingInterval: this._rotationPollInterval
    })

    this._tail
      .on("error", err => this.emit("error", err))
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

    const addIndex = (identifier, posOrLink) => {
      if (isString(posOrLink)) {
        const link = posOrLink
        this.insertLink(identifier, link)
      }
      else {
        const positionInChunk = posOrLink
        this.insert(identifier, path, pos + positionInChunk)
      }
    }

    indexer(chunk, addIndex, processedTo)
  }

  insert (identifier, filePath, position) {
    const file = this._files.get(filePath)
    return this._index.set(identifier, {file, position})
      .then(() => { this.emit("insert", identifier) })
  }

  insertLink (identifier, destinationId) {
    return this._index.set(identifier, destinationId)
      .catch(err => this.emit("error", err))
  }

  fileAndPositionForIdentifier (identifier, cb) {
    return maybe(cb, new Promise(resolve => {
      this._index.get(identifier).then(result => {
        if (isString(result)) {
          // Strings are link entries, so resolve them
          return resolve(this._recursivelyResolveLinkEntry(result, [identifier]))
        }
        else {
          return resolve(processRawIndexEntry(result))
        }
      })
    }))
  }

  _recursivelyResolveLinkEntry (id, seen) {
    return new Promise (resolve => {
      if (seen.indexOf(id) !== -1) {
        const trail = seen.concat(id).join(" -> ")
        throw new Error(`Attempt to retrieve circular link: ${trail}`)
      }
      else {
        return resolve(this._index.get(id).then(result => {
          if (isString(result)) {
            seen = seen.concat(id)
            return this._recursivelyResolveLinkEntry(result, seen)
          }
          else {
            return processRawIndexEntry(result)
          }
        }))
      }
    })
  }

  addStaticDataFile (path, cb = function () {}) {
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

  setIndexStorageObject (store) {
    this._index = new StorageProxy(store)
  }

  readStreamBetweenIndexes (startId, endId, cb) {
    return maybe(cb, Promise.all([
      this.fileAndPositionForIdentifier(startId),
      this.fileAndPositionForIdentifier(endId)
    ]).then(([startIndex, endIndex]) => {
      if (startIndex === undefined) {
        return undefined
      }

      if (endIndex === undefined) {
        return undefined
      }

      return new CatTail(this._filesBetween(startIndex.file, endIndex.file), {
        start: startIndex.position,
        end: endIndex.position - 1
      })
    }))
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
    return files.slice(startFileIndex, endFileIndex + 1)
  }
}

class File {
  constructor (path) {
    this.path = path
  }
}

function processRawIndexEntry (entry) {
  if (entry === undefined) {
    return undefined
  }
  else {
    return {
      position: entry.position,
      file: entry.file.path
    }
  }
}
