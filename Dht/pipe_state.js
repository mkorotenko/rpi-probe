const EventEmitter = require('events').EventEmitter;

class PipeState extends EventEmitter {
  constructor(addr, UID) {
    super();

    this.pipeNum = addr.pipeNum;
    this.subnet = addr.subnet;
    this.UID = UID;
  }

  update(pack) {
    switch (pack.pack_type) {
      case 1:
        break;
      case 2:
        this.dht = pack;
        break;
      case 4:
        this.ext1 = pack;
        break;
    }
  }
}

module.exports = PipeState;
