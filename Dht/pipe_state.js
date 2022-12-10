const EventEmitter = require('events').EventEmitter;

class PipeState extends EventEmitter {
  constructor(addr, UID, settings) {
    super();

    this.pipeNum = addr.pipeNum;
    this.subnet = addr.subnet;
    this.UID = UID;
    this.settings = settings || {};
    this.tasks = [
      {
        task: 'checkMode',
        mode: this.settings.beamMode || false
      }
    ];
  }

  update(pack) {
    switch (pack.pack_type)
    {
      case 1:
        break;
      case 2:
        this.dht = pack;
        break;
      case 4:
        this.ext1 = pack;
        break;
      case 5:
        console.info('Got settings', this.pipeNum, pack);
        this.completeTask('checkMode');
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
    
  }
}

module.exports = PipeState;
