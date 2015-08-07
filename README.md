# live-index

Maintain an index into a log file as it is appended to and rotated

## Installation

```
npm install live-index
```

## API

```javascript
var LiveIndex = require("live-index")
```

### Constructor `LiveIndex([options])`

Instantiates a `LiveIndex` instance. The `options` object takes the following properties:

  - `pathToWatch`: The path to a log file you want to watch and index.
  - `indexer`: A function you define to update the index. See the `indexer` callback documentation below for what gets passed to this function.

If both `pathToWatch` and `indexer` are defined, then `.watch()` is automatically called for you.

### Method `setIndexer(indexer)`

Sets `indexer` as the indexer callback. See the `indexer` callback documentation below for what gets passed to this function.

### Method `setIndexStorageObject(obj)`

Sets the object to be used for in memory storage of index identifiers and file positions. This overrides the default `Map` instance.

The object specified by the `obj` parameter must have standard `.get(id)` and `.set(id, val)` methods. A good object to use here might be an [lru-cache](https://npmjs.com/package/lru-cache) instance.

### Method `addPathToWatch(path)`

Adds `path` to the list of files to watch once `.watch()` is called.

### Method `watch()`

Begin watching the files that have been added to the index.

### Callback `indexer(chunk, addIndex, processedTo)`

Your `indexer` callback must handle these parameters:

  - `chunk`: The `Buffer` object containing the data your indexer will look at to create indexes.
  - `addIndex`: A callback to create an index. Takes two parameters: an `identifier` string or object, and `postionInChunk` specifying the offset in the chunk where the index should point to.
  - `processedTo`: A callback you can call to indicate how much of the chunk you were able to process. Calling this with an offset in the chunk means that your next chunk will include what you were unable to process.

## Contributing

Patches are welcome! This module is written in ES2015. Use `npm run compile` to compile the source. All changes should include a test case or modification to an existing test case. Use `npm test` to run the tests.
