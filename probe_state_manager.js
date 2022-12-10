//Require the pigpio package, this is from https://github.com/fivdi/pigpio
//This is a Node.js wrapper around the native pigpio C library https://github.com/joan2937/pigpio
// sudo node --inspect-brk=raspberrypi.local dev/Probe/probe_state_manager.js

const Rfm69Connector = require('./drivers/rfm69_driver');
const dhtData = require('./Dht/data_processing');
const PipeState = require('./Dht/pipe_state');
Date.prototype.format = function() {
  var mm = this.getMonth() + 1;
  var dd = this.getDate();
  var hh = this.getHours();
  var MM = this.getMinutes();
  var ss = this.getSeconds();
  var ms = this.getMilliseconds();

  var dateStr = [this.getFullYear(),
          (mm>9 ? '' : '0') + mm,
          (dd>9 ? '' : '0') + dd
         ].join('-');
  var timeStr = [
    (hh>9 ? '' : '0') + hh,
    (MM>9 ? '' : '0') + MM,
    (ss>9 ? '' : '0') + ss
  ].join(':');
  if (ms<10) {
    ms = `00${ms}`
  } else if (ms<100) {
    ms = `0${ms}`
  }
  return `${dateStr}T${timeStr}.${ms}`;
};

const SUB_NET = 0x35;
const STATION_ADDR = 0x00;
const NEW_PIPE_ADDR = 0xff;

const SPI_NUM = 0;
const DEVICE_NUM = 0;
const NSS_GPIO_PIN = 22;
const RESET_GPIO_PIN = 24;
const RX_EV_GPIO_PIN = 25;
const TX_EV_GPIO_PIN = 23;

const RFM_DATA_EVENT = 'haveData';

const pipeNumbers = {
  2228287: { pipeNum: 4, subnet: SUB_NET, beamMode: true },
  2228289: { pipeNum: 1, subnet: SUB_NET, beamMode: true },
  2883623: { pipeNum: 5, subnet: SUB_NET },
  4587579: { pipeNum: 2, subnet: SUB_NET, beamMode: true },
  4587581: { pipeNum: 3, subnet: SUB_NET, beamMode: true },
};

const pipesStat = {};

function resetPipeState(pipeUID) {
  let addr = pipeNumbers[pipeUID];
  if (!addr) {
    pipeNum = Math.max(...Object.keys(pipeNumbers).map(pA => pA.pipeNum)) || 0;
    pipeNum++;
    pipeNumbers[pipeUID] = { pipeNum, subnet: SUB_NET };
  }

  pipesStat[addr.pipeNum] = new PipeState(addr, pipeUID);
}

function updatePipeState(pipeNum, packs) {
  const curPack = packs[0];
  if (pipeNum == NEW_PIPE_ADDR || curPack.pack_type == 1) {
    resetPipeState(curPack.UID);
    return;
  }
  const pipeState = pipesStat[pipeNum];
  // Pipe knows it's number but station doesn't so it was restarted
  if (!pipeState) {
    return dhtData.reqUIDPack();
  }
  pipeState.update(curPack);
}

// setInterval(async() => {

// }, STATE_CHECK_S * 1000);

const rfm = new Rfm69Connector(SPI_NUM, DEVICE_NUM); 
rfm.connect(RESET_GPIO_PIN, RX_EV_GPIO_PIN, TX_EV_GPIO_PIN)
  .then(() => {
    rfm.readRegister(0x01)
    .then(async reg => (await station(reg)))
    .catch(err => console.error('RFM read error:', err))
  })
  .catch(err => console.error('RFM init error:', err));

async function station(rfmMode) {
  console.info('RFM69 mode:', rfmMode);
  await rfm.setPower(15);
  await rfm.setAddress(STATION_ADDR, SUB_NET);
  await rfm.setMode(0x04);//receive

  setInterval(async () => {
    let mode;
    // Some kind of reset mode: set 1 and then to 4
    await rfm.waitInterfaceFree();
    await rfm.writeRegister(0x01, 0x04);
    await rfm.writeRegister(0x01, 0x10);

    mode = await rfm.readRegister(0x01);
    console.info('MODE: ', mode >> 2);
  }, 5000);

  // setInterval(async () => {
  //   await rfm.waitInterfaceFree();
  //   console.info('Sending to 5 pipe...');
  //   await rfm.send(0x05, [14, 0]);
  //   await rfm.awaitSend();
  //   await rfm.setMode(4);
  // }, 8000)

  rfm.on(RFM_DATA_EVENT, async () => {
    try {
      let rxData = [];
      await rfm.waitInterfaceFree();
      const pipe = await rfm.receive(rxData);
      if (pipe) {
        const packData = dhtData.processDHTpack(pipe, rfm.rssi, rxData);
        let ackPack = updatePipeState(pipe, packData);
        if (!ackPack) {
          ackPack = getPipeAckData(pipeNum, packData);
        }
        if (ackPack == null) {
          return;
        }
        await sendACK(pipe, ackPack);
      }
    } catch (error) {
      console.error('Error on receive:', error);
    }
  });
}

async function sendACK(pipeNum, ackData) {
  return new Promise(async (resolve, reject) => {
    try {
      await rfm.waitInterfaceFree();
      await rfm.send(pipeNum, ackData);
      await rfm.awaitSend();
      await rfm.setMode(4);
      resolve();
    } catch (error) {
      console.error('Send ACK error:', error);
      reject(error);
    }
  })
}

function getPipeAckData(pipe, packData) {
  if (packData.pack_type == 1) {
      const pipeAddr = pipeNumbers[packData.UID];
      if (pipeAddr) {
          return dhtData.setAddressPack(pipeAddr.pipeNum, pipeAddr.subnet, packData.UID);
      }
  // If pipe sent 20 - ACK
  // } else if (packData.pack_type == 20 || packData.pack_type == 21) {
  //     return null;
  } else if (pipe == 255) {
      return dhtData.reqUIDPack();
  }
  // Simple ACK
  return dhtData.ackPack();
}
