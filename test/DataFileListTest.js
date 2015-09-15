import assert from "assert"
import {EventEmitter} from "events"
import uuid from "uuid"

import MockIndexStorage from "../mock/MockIndexStorage.js"
import DataFileList from "../lib/DataFileList.js"

describe("DataFileList", () => {
  let fileList, tail, store

  beforeEach(() => {
    tail = new MockTailFollow()
    store = new MockIndexStorage()
    fileList = new DataFileList({tail, store})
  })

  describe("identifierForTailFile()", () => {
    it("should return a string that is a UUID", () =>
      assertIsUUID(fileList.identifierForTailFile())
    )

    it("should return a new identifier when file is rotated", () => {
      const firstId = fileList.identifierForTailFile()
      return tail.mimicRename().then(() => {
        const secondId = fileList.identifierForTailFile()
        assert(firstId != secondId, `${firstId} is same`)
      })
    })
  })

  describe("pathForIdentifier()", () => {
    let id

    beforeEach(() => {
      id = fileList.identifierForTailFile()
      return tail.mimicRename()
    })

    it("should return a promise that resolves to the expected path", () =>
      fileList.pathForIdentifier(id).then(path => {
        assert.strictEqual(path, tail.lastRotatedFilePath)
      })
    )

    it("should get data from storage", () => {
      fileList = new DataFileList({store, tail})
      return fileList.pathForIdentifier(id).then(path => {
        assert.strictEqual(path, tail.lastRotatedFilePath)
      })
    })

    it("should return the tail path if it matches that id", () =>
      fileList.identifierForPath(tail.filePath)
        .then(id => fileList.pathForIdentifier(id))
        .then(path => assert.strictEqual(path, tail.filePath))
    )
  })

  describe("identifierForPath()", () => {
    let id, path

    beforeEach(() => {
      id = fileList.identifierForTailFile()
      return tail.mimicRename().then(() => {
        path = tail.lastRotatedFilePath
      })
    })

    it("should return a promise that resolves to the id for the path", () =>
      fileList.identifierForPath(path).then(result => {
        assert.strictEqual(result, id)
      })
    )

    it("should resolve to the id for the tail file if given the tail path", () =>
      fileList.identifierForPath(tail.filePath).then(id => {
        assert.strictEqual(id, fileList.identifierForTailFile())
      })
    )
  })

  describe("addFile()", () => {
    it("should create a new identifier for the path", () =>
      fileList.addFile("/foo/baaz").then(() => {
        fileList.identifierForPath("/foo/baaz").then(id => {
          assert(id)
        })
      })
    )

    it("should use stored identifier if path exists in store", () =>
      fileList.addFile("/foo/baaz").then(() =>
        fileList.identifierForPath("/foo/baaz").then(id1 => {
          fileList = new DataFileList({tail, store})
          return fileList.addFile("/foo/baaz").then(() =>
            fileList.identifierForPath("/foo/baaz").then(id2 => {
              assert.strictEqual(id1, id2)
            })
          )
        })
      )
    )
  })

  describe("paths", () => {
    it("should return all the files that have been added", () =>
      fileList
        .addFile("/foo/baaz")
        .then(() => fileList.addFile("/foo/quux"))
        .then(() => {
          const expected = ["/foo/baaz", "/foo/quux", tail.filePath]
          assert.deepEqual(fileList.paths, expected)
        })
    )

    it("should return all the files that have been renamed via tail", () =>
      tail
        .mimicRename()
        .then(() => tail.mimicRename())
        .then(() => tail.mimicRename())
        .then(() => {
          const expected = [
            MockTailFollow.pathForRenameIteration(1),
            MockTailFollow.pathForRenameIteration(2),
            MockTailFollow.pathForRenameIteration(3),
            tail.filePath
          ]
          assert.deepEqual(fileList.paths, expected)
        })
    )
  })
})

class MockTailFollow extends EventEmitter {
  constructor () {
    super()
    this._fileRenameCounter = 0
  }

  get filePath () {
    return "/foo/bar"
  }

  get lastRotatedFilePath () {
    return MockTailFollow.pathForRenameIteration(this._fileRenameCounter)
  }

  static pathForRenameIteration (i) {
    return `/foo/bar-${i}`
  }

  mimicRename () {
    return new Promise(resolve => {
      this._fileRenameCounter += 1
      this.emit("rename", this.filePath, this.lastRotatedFilePath)
      setImmediate(() => resolve())
    })
  }
}

function assertIsUUID (str) {
  const parsed = uuid.parse(str)
  assert(uuid.unparse(parsed) === str, `"${str}" not a UUID`)
}
