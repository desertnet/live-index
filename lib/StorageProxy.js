import denodeify from "denodeify"

export default class StorageProxy {
  constructor (store) {
    this._store = store

    this.get = store.get.length >= 2 ?
      denodeify(store.get.bind(store)) :
      (id) => Promise.resolve(store.get(id))

    this.set = store.set.length >= 3 ?
      denodeify(store.set.bind(store)) :
      (id, val) => Promise.resolve(store.set(id, val))
  }
}
