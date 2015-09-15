import uuid from "uuid"

function wrap (key) {
  return `--live-index:${key}`
}

class File {
  constructor ({id, path} = {}) {
    this.id = id || uuid.v4()
    this.path = path || null
  }
}

export default class DataFileList {
  constructor ({store, tail}) {
    this.store = store
    this.tail = tail
    this.tailFile = new File()
    this.cache = Object.create(null)
    this._paths = []

    this.tail.on("rename", (_, newPath) => this.handleTailRename(newPath))
  }

  get paths () {
    return this._paths.concat(this.tail.filePath)
  }

  identifierForTailFile () {
    return this.tailFile.id
  }

  handleTailRename (newPath) {
    this._paths.push(newPath)
    this._set(this.tailFile.id, newPath)
    this._set(newPath, this.tailFile.id)
    this.tailFile = new File()
  }

  pathForIdentifier (id) {
    if (id === this.identifierForTailFile()) {
      return Promise.resolve(this.tail.filePath)
    }
    else {
      return this._get(id)
    }
  }

  identifierForPath (path) {
    if (path === this.tail.filePath) {
      return Promise.resolve(this.identifierForTailFile())
    }
    else {
      return this._get(path)
    }
  }

  addFile (path) {
    return this._get(path).then(id => {
      if (id === undefined) {
        const file = new File({path})
        this._paths.push(path)
        return Promise.all([
          this._set(file.id, file.path),
          this._set(file.path, file.id)
        ])
      }
    })
  }

  between (startFile, endFile) {
    const files = this.paths
    const startFileIndex = files.indexOf(startFile)
    const endFileIndex = files.indexOf(endFile)
    if (startFileIndex > endFileIndex) {
      throw new Error(`Nonsensical attempt to find files between ${startFile} and ${endFile}. (Did you use a start index as your end index?)`)
    }
    return files.slice(startFileIndex, endFileIndex + 1)
  }

  _set (id, val) {
    id = wrap(id)
    this.cache[id] = val
    this.store.set(id, val)
  }

  _get (id) {
    id = wrap(id)
    return this.cache[id] !== undefined ?
      Promise.resolve(this.cache[id]) :
      this.store.get(id).then(val => this.cache[id] = val)
  }
}
