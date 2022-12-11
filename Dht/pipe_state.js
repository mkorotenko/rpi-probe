const EventEmitter = require('events').EventEmitter;

class PipeState extends EventEmitter {
  constructor(addr, UID, settings) {
    super();

    this.pipeNum = addr.pipeNum;
    this.subnet = addr.subnet;
    this.UID = UID;
    this.settings = settings || {};
    this.tasks = [];
    if (settings.reqState) {
      this.tasks.push({
        task: 'checkMode',
        mode: this.settings.beamMode || false
      });
    }
  }

  update(pack) {
    switch (pack.pack_type)
    {
      case 1:
        break;
      case 2:
        this.dht = pack;
        break;
      case 3:
        this.UID = pack.UID;
        this.version = {
          major: pack.major,
          minor: pack.minor
        }
        break;
      case 4:
        this.ext1 = pack;
        break;
      case 5:
        this.completeTask('checkMode');
        this.state = pack.state;
        break;
    }
  }

  getTask() {
    if (this.tasks.length) {
      return this.tasks[0];
    }
    return null;
  }

  completeTask(task) {
    const index = this.tasks.findIndex(i => i.task === task);
    if (index < 0) {
      return;
    }
    this.tasks.splice(index, 1);
  }
}

module.exports = PipeState;
