const SeedData = require("./seed-data");
const deepCopy = require("./deep-copy");

module.exports = class SessionPersistence {
  constructor(session) {
    this._todoLists = session.todoLists || deepCopy(SeedData);
    session.todoLists = this._todoLists;
  }

};