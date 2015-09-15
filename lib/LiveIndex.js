import {EventEmitter} from "events"
import TailFollow from "tail-follow"
import {resolve as resolvePath} from "path"
import CatTail from "cat-tail"
import isString from "lodash.isstring"
import StorageProxy from "./StorageProxy.js"
import DataFileList from "./DataFileList.js"
import maybe from "call-me-maybe"

export default class LiveIndex extends EventEmitter {
  constructor ({pathToWatch, indexer, tailChunkSize, rotationPollInterval} = {}) {
    super()

    this._watchPath = null
    this._indexer = null
    this._tail = null
    this._fileList = null
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
    this._watchPath = resolvePath(path)
  }

  setIndexer (evaluator) {
    this._indexer = evaluator
  }

  watch () {
    const path = this._watchPath

    this._tail = new TailFollow(path, {
      surviveRotation: true,
      objectMode: true,
      tailChunkSize: this._tailChunkSize,
      fileRenamePollingInterval: this._rotationPollInterval
    })

    this._fileList = new DataFileList({
      tail: this._tail,
      store: this._store
    })

    this._tail
      .on("error", err => this.emit("error", err))
      .on("data", chunk => this._evaluateChunk(path, this._tail, chunk))
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
    return this._fileList.identifierForPath(filePath)
      .then(fileId => this._store.set(identifier, {fileId, position}))
      .then(() => { this.emit("insert", identifier) })
      .catch(err => { this.emit("error", err) })
  }

  insertLink (identifier, destinationId) {
    return this._store.set(identifier, destinationId)
      .catch(err => this.emit("error", err))
  }

  fileAndPositionForIdentifier (identifier, cb) {
    return maybe(cb, this._store.get(identifier)
      .then(result => {
        if (isString(result)) {
          // Strings are link entries, so resolve them
          return this._recursivelyResolveLinkEntry(result, [identifier])
        }
        else {
          return this._deserializeIndexEntry(result)
        }
      })
    )
  }

  _recursivelyResolveLinkEntry (id, seen) {
    if (seen.indexOf(id) !== -1) {
      const trail = seen.concat(id).join(" -> ")
      throw new Error(`Attempt to retrieve circular link: ${trail}`)
    }

    return this._store.get(id)
      .then(result => {
        if (isString(result)) {
          seen = seen.concat(id)
          return this._recursivelyResolveLinkEntry(result, seen)
        }
        else {
          return this._deserializeIndexEntry(result)
        }
      })
  }

  addStaticDataFile (path, cb) {
    return maybe(cb, new Promise((resolve, reject) => {
      this.addDataFileWithoutIndexing(path)
      const tail = new TailFollow(resolvePath(path), {
        follow: false,
        objectMode: true,
        tailChunkSize: this._tailChunkSize
      })

      tail
        .once("error", err => reject(err))
        .on("data", chunk => this._evaluateChunk(path, tail, chunk))
        .once("end", () => resolve())
    }))
  }

  addDataFileWithoutIndexing (path) {
    const resolvedPath = resolvePath(path)
    this._fileList.addFile(resolvedPath)
  }

  setIndexStorageObject (store) {
    this._store = new StorageProxy(store)
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

      const files = this._fileList.between(startIndex.file, endIndex.file)
      return new CatTail(files, {
        start: startIndex.position,
        end: endIndex.position - 1
      })
    }))
  }

  _deserializeIndexEntry (entry) {
    if (entry === undefined || entry.fileId === undefined) {
      return Promise.resolve(undefined)
    }
    else {
      return this._fileList.pathForIdentifier(entry.fileId).then(path => {
        if (path === undefined) {
          return undefined
        }
        else {
          return {
            position: entry.position,
            file: path
          }
        }
      })
    }
  }
}
