const EventEmitter = require('events').EventEmitter;

class PipeState extends EventEmitter {

    constructor(addr, UID) {
      super();

      this.addr = addr;
      this.UID = UID;
    }
}