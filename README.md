# live-index

Maintain an index into a log file as it is appended to and rotated

## Installation

```
npm install --save live-index
```

## API

```javascript
var LiveIndex = require("live-index")
```

### Constructor `LiveIndex([options])`

Instantiates a `LiveIndex` instance. The `options` object takes the following properties:

  - `pathToWatch`: The path to a log file you want to watch and index.
  - `indexer`: A function you define to update the index. See the `indexer` delegagte documentation below for what gets passed to this function.
  - `tailChunkSize`: Set the size in bytes that should be read at a time from the data files. You can use this to control the maximum size of the chunks dispatched to your indexer function.
  - `rotationPollInterval`: Poll for data file rotation every specified number of milliseconds, instead of relying on `fs.watch()` rename events. Try this if indexing stops after a rotation.

If both `pathToWatch` and `indexer` are defined, then `.watch()` is automatically called for you.

### Method `setIndexer(indexer)`

Sets `indexer` as the indexer delegate. See the `indexer` delegate documentation below for what gets passed to this function.

### Method `setIndexStorageObject(obj)`

Sets the object to be used for in memory storage of index identifiers and file positions. This overrides the default `Map` instance.

The object specified by the `obj` parameter must have standard `.get(id)` and `.set(id, val)` methods. A good object to use here might be an [lru-cache](https://npmjs.com/package/lru-cache) instance.

### Method `setPathToWatch(path)`

Set the `path` of the file to watch once `.watch()` is called.

### Method `watch()`

Begin watching the files that have been added to the index.

### Method `addStaticDataFile(path, callback)`

Appends a file given by `path` to the list of data files and indexes it. Calls the callback once indexing is complete.

### Method `readStreamBetweenIndexes(startIdentifier, endIdentifier)`

Returns a `Readable` stream starting from the data file and position specified by `startIdentifier` and ends at the data file and position specified by `endIdentifier`. This stream will automatically span across multiple data files. If any or both of the identifiers are not in the index, then `undefined` is returned instead of a stream object. If the index for `endIdentifier` comes before `startIdentifier`, an error is thrown.

### Delegate `indexer(chunk, addIndex, processedTo)`

Your `indexer` function must handle these parameters:

  - `chunk`: The `Buffer` object containing the data your indexer will look at to create indexes.
  - `addIndex`: A callback to create an index entry or link.
  - `processedTo`: A callback you can optionally call to indicate how much of the chunk you were able to process.

#### Callback: `addIndex(identifier, location)`

Call the `addIndex()` function from your indexer to add entries to the index. There are two ways to call this function. In the first form, `location` is an integer specifying the byte offset in the `chunk` that the index entry represents.

In the second form, `location` is a string, specifying another identifier that this index should link to. When you look up `identifier` later, it will automatically be resolved to the index entry specified by `location`.

#### Callback: `processedTo(positionInChunk)`

Calling this in your indexer function to tell the LiveIndex how much of the chunk you were able to process. The next time your indexer function is called, the passed `chunk` will contain what you were unable to process.

## Contributing

Patches are welcome! This module is written in ES2015. Use `npm run compile` to compile the source. All changes should include a test case or modification to an existing test case. Use `npm test` to run the tests.
