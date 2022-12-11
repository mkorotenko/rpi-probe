const EventEmitter = require('events').EventEmitter;

class PipeState extends EventEmitter {
  constructor(addr, UID, settings) {
    super();

    this.pipeNum = addr.pipeNum;
    this.subnet = addr.subnet;
    this.UID = UID;
    this.settings = settings || {};
    this.tasks = [];
  }

  async update(pack) {
    return new Promise(async (resolve, reject) => {
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
          if (this.version.major >= 1) {
            this.addTask('checkMode', { PROBE_BEAM_MODE: this.settings.beamMode || false });
          }
          break;
        case 4:
          this.ext1 = pack;
          break;
        case 5:
          this.completeTask('checkMode');
          this.state = pack.state;
          this.checkMode();
          break;
      }
      resolve();
    });
  }

  getTask() {
    if (this.tasks.length) {
      return this.tasks[0];
    }
    return null;
  }

  addTask(task, data) {
    this.tasks.push({
      task,
      data
    })
  }

  completeTask(task) {
    const index = this.tasks.findIndex(i => i.task === task);
    if (index < 0) {
      return;
    }
    this.tasks.splice(index, 1);
  }

  checkMode() {
    const beamMode = Boolean(this.settings.beamMode);
    const modeSettings = {...this.state};
    if (beamMode != Boolean(this.state.PROBE_BEAM_MODE)) {
      modeSettings.PROBE_BEAM_MODE = beamMode;
      // this.addTask('setMode', {...this.state, PROBE_BEAM_MODE: beamMode});
    }
    if (this.settings.measures.PROBE_EXT1_V != this.state.PROBE_EXT1_V) {
      modeSettings.PROBE_EXT1_V = this.settings.measures.PROBE_EXT1_V;
    }
    if (Object.keys(modeSettings).length) {
      this.addTask('setMode', modeSettings);
    }
  }
}

module.exports = PipeState;
