//Require the pigpio package, this is from https://github.com/fivdi/pigpio
//This is a Node.js wrapper around the native pigpio C library https://github.com/joan2937/pigpio
// sudo node --inspect-brk=192.168.1.200 dev/Probe/rfm69_manager.js

const Rfm69Connector = require('./drivers/rfm69_driver');
const core = require('./drivers/core_driver');
const EventEmitter = require('events').EventEmitter;
const dhtData = require('./Dht/data_processing');

const SUB_NET = 0x35;
const STATION_ADDR = 0x00;
const PROBE_ADDR = 0x06;

const SPI_NUM = 0;
const DEVICE_NUM = 0;
const NSS_GPIO_PIN = 22;
const RESET_GPIO_PIN = 24;
const RX_EV_GPIO_PIN = 25;
const TX_EV_GPIO_PIN = 23;

const RFM69_MAX_ATTEMPTS = 1;
const RFM69_ATTEMPT_DELAY = 180;
const sendPeriodMS = 10000;

const HAVE_DATA_EVENT = 'haveData';

const mode = 'station';
const stationListenOnly = false;

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

function packDate(d) {
  let res = 0;
  res = res | (d.getFullYear() - 2000);
  res = res << 4;
  res = res | (d.getMonth() + 1);
  res = res << 5;
  res = res | d.getDate();
  res = res << 5;
  res = res | d.getHours();
  res = res << 6;
  res = res | d.getMinutes();
  res = res << 6;
  res = res | d.getSeconds();
   
  return res;
}

const haveData = new EventEmitter();

const rfm = new Rfm69Connector(SPI_NUM, DEVICE_NUM); 
rfm.connect(RESET_GPIO_PIN, RX_EV_GPIO_PIN, TX_EV_GPIO_PIN)
.then(() => {
  rfm.readRegister(0x01)
  .then(async (reg) => {
    switch (mode) {
      case 'fakeACK':
        await fakeACK();
        break
      case 'probe':
        await probe(reg);
        break;
      case 'station':
        await station(reg);
        break;
    }
  })
  .catch(err => console.error('RFM read error:', err))
})
.catch(err => console.error('RFM init error:', err))

async function probe(rfmMode) {
  console.info('RFM69 mode:', rfmMode);
  await rfm.setPower(15);
  await rfm.setAddress(PROBE_ADDR, SUB_NET);
  await rfm.setMode(0x04);//receive

  rfm.on(HAVE_DATA_EVENT, async () => {
    let buf = [];
    try {
      const len = await rfm.receive(buf);
      if (len) {
        haveData.emit(HAVE_DATA_EVENT, len);
      }
    } catch (error) {
      console.error('Error on receive:', error);
    }
  });

  setInterval(async () => {
    let buf = [ 1, 0, 0, 0, 239, 1, 230, 0 ];

    let temp = 0;
    try {
      temp = await core.getTemp();
      temp = Math.round(temp * 10);
    } catch(error) {
      console.error('Get temp error:', error);
    }
    buf[2] = temp & 255;
    temp = temp >> 8;
    buf[3] = temp & 255;

    const date = new Date();
    let packed = packDate(date);
    buf.push(packed & 255);
    packed = packed >> 8;
    buf.push(packed & 255);
    packed = packed >> 8;
    buf.push(packed & 255);
    packed = packed >> 8;
    buf.push(packed & 255);

    let attempt = 0;

    for (let att of '0'.repeat(RFM69_MAX_ATTEMPTS)) {
      try {
        // if (!attempt) {
        //   console.info('Sending...', rfm.rssi);
        // } else {
        //   console.info(`Retry ${attempt}...`, rfm.rssi);
        // }
        await sendData(buf);
        break;
      } catch (error) {
        attempt++;
      }  
    }
  }, sendPeriodMS);
}

async function fakeACK() {
  console.info('RFM69 reg 0x01');
  await rfm.setPower(15);
  await rfm.setAddress(STATION_ADDR, SUB_NET);
  await rfm.setMode(0x04);//receive

  setInterval(async () => {
    await sendACK(255);
    console.info(`${(new Date()).format()} data sent`);
  }, sendPeriodMS);
}

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

  setInterval(async () => {
    await rfm.waitInterfaceFree();
    console.info('Sending to 5 pipe...');
    await rfm.send(0x05, [20]);
    await rfm.awaitSend();
    await rfm.setMode(4);
  }, 8000)

  rfm.on(HAVE_DATA_EVENT, async () => {
    try {
      let rxData = [];
      await rfm.waitInterfaceFree();
      const pipe = await rfm.receive(rxData);
      if (pipe) {
        haveData.emit(HAVE_DATA_EVENT, pipe);
        const packData = dhtData.processDHTpack(pipe, rfm.rssi, rxData);
        if (!stationListenOnly) {
          await rfm.waitInterfaceFree();
          await sendACK(pipe, packData[0]);
        }
      }
    } catch (error) {
      console.error('Error on receive:', error);
    }
  });
}

async function sendData(buf) {
  return new Promise(async (resolve, reject) => {
    try {
      await rfm.waitInterfaceFree();
      await rfm.send(0x01, buf);
      await rfm.awaitSend();
      await rfm.setMode(4);
      let listenTO;
      const dataHandler = () => {
        haveData.off(HAVE_DATA_EVENT, dataHandler);
        clearTimeout(listenTO);
        resolve();
      };
      haveData.once(HAVE_DATA_EVENT, dataHandler);
      listenTO = setTimeout(() => {
        haveData.off(HAVE_DATA_EVENT, dataHandler);
        reject('No responce');
      }, RFM69_ATTEMPT_DELAY);
    } catch (error) {
      console.error('Send data error:', error);
      reject(error);
    }
  })
}

async function sendACK(addr, packData) {
  return new Promise(async (resolve, reject) => {
    try {
      const ackData = dhtData.getPipeAckData(addr, packData);
      await rfm.waitInterfaceFree();
      await rfm.send(addr, ackData);
      await rfm.awaitSend();
      await rfm.setMode(4);
      resolve();
    } catch (error) {
      console.error('Send ACK error:', error);
      reject(error);
    }
  })
}
