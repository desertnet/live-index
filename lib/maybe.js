// Helper function for providing an API that takes either a Node-style
// error-first callback API or a callback that returns a Promise.
export default function maybe (cb, promise) {
  if (cb) {
    promise.then(result => cb(null, result), err => cb(err))
  }
  else {
    return promise
  }
}
