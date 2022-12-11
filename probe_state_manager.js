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

const rfm = new Rfm69Connector(SPI_NUM, DEVICE_NUM);

const RFM_DATA_EVENT = 'haveData';

const pipeNumbers = {
  2228287: { pipeNum: 4, subnet: SUB_NET, beamMode: true },
  2228289: { pipeNum: 1, subnet: SUB_NET, beamMode: true },
  2883623: { pipeNum: 5, subnet: SUB_NET, reqState: true },
  4587579: { pipeNum: 2, subnet: SUB_NET, beamMode: true },
  4587581: { pipeNum: 3, subnet: SUB_NET, beamMode: true },
};

const pipesStat = {};

function resetPipeState(pipeUID) {
  let addr = pipeNumbers[pipeUID];
  if (!addr) {
    pipeNum = Math.max(...Object.keys(pipeNumbers).map(pA => pA.pipeNum)) || 0;
    pipeNum++;
    addr = pipeNumbers[pipeUID] = { pipeNum, subnet: SUB_NET, beamMode: true };
  }

  pipesStat[addr.pipeNum] = new PipeState(addr, pipeUID, { beamMode: addr.beamMode, reqState: addr.reqState });
  return addr;
}

function updatePipeState(pipeNum, packs) {
  const curPack = packs[0];
  // TODO: check for instant 255 pack exchange
  if (pipeNum == NEW_PIPE_ADDR) {
    if (!curPack.UID) {
      return dhtData.reqUIDPack();
    }
    const pipeAddr = resetPipeState(curPack.UID);
    if (pipeAddr) {
      return dhtData.setAddressPack(pipeAddr.pipeNum, pipeAddr.subnet, curPack.UID);
    }
    return;
  }
  const pipeState = pipesStat[pipeNum];
  // Pipe knows it's number but station doesn't so it was restarted
  if (!pipeState) {
    if (curPack.UID) {
      const pipeAddr = resetPipeState(curPack.UID);
      if (pipeAddr) {
        return dhtData.setAddressPack(pipeAddr.pipeNum, pipeAddr.subnet, curPack.UID);
      }
      return;
    } else {
      return dhtData.reqUIDPack();
    }
  }
  pipeState.update(curPack);
  const task = pipeState.getTask();
  if (task) {
    switch (task.task) {
      case 'checkMode':
        return dhtData.reqSettingsPack();
    }
  }
}

async function dataHandler() {
  try
  {
    let rxData = [];
    await rfm.waitInterfaceFree();
    const pipeNum = await rfm.receive(rxData);
    if (pipeNum)
    {
      const packData = dhtData.processDHTpack(pipeNum, rfm.rssi, rxData);
      let ackPack = updatePipeState(pipeNum, packData);
      if (!ackPack)
      {
        ackPack = dhtData.ackPack();
      }
      if (ackPack == null)
      {
        return;
      }
      await sendACK(pipeNum, ackPack);
    }
  } catch (error)
  {
    console.error('Error on receive:', error);
  }
}

async function station() {
  await rfm.connect(RESET_GPIO_PIN, RX_EV_GPIO_PIN, TX_EV_GPIO_PIN);
  const rfmMode = await rfm.readRegister(0x01);
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

  rfm.on(RFM_DATA_EVENT, dataHandler);
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

try {
	station();
} catch(err) {
	console.error('RFM read error:', err);
}
