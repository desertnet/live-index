export default function maybe (cb, promise) {
  if (cb) {
    promise.then(result => cb(null, result), err => cb(err))
  }
  else {
    return promise
  }
}
