//Require the pigpio package, this is from https://github.com/fivdi/pigpio
//This is a Node.js wrapper around the native pigpio C library https://github.com/joan2937/pigpio
// Service settings: /etc/systemd/system/fan.service
// systemctl daemon-reload
// systemctl restart fan.service
const Rfm69Connector = require('./drivers/rfm69');
const piTemp = require('./drivers/cpu_temperature');
const EventEmitter = require('events').EventEmitter;
const fanManager = require('./fan_manager');

const RFM69_MAX_ATTEMPTS = 1;
const RFM69_ATTEMPT_DELAY = 180;
const sendPeriodMS = 10000;

const mode = 'probe';
const stationListen = true;

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

const rfm = new Rfm69Connector(0,0); 
rfm.init(24, 18, 25)
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

fanManager.start();

async function probe(reg) {
  console.info('RFM69 reg 0x01:', reg);
  await rfm.setPower(15);
  await rfm.setAddress(0x06, 0x30);
  await rfm.setMode(0x04);//receive

  rfm.on('isData', async () => {
    let buf = [];
    try {
      const len = await rfm.receive(buf);
      if (len) {
        // console.info('Have data:', rfm.rssi, buf);
        haveData.emit('isData', len);
      }
    } catch (error) {
      console.error('Error on receive:', error);
    }
  });

  setInterval(async () => {

    let buf = [ 1, 0, 0, 0, 239, 1, 230, 0 ];

    let temp = 0;
    try {
      temp = await piTemp.getTemp();
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
  await rfm.setAddress(0x01, 0x30);
  await rfm.setMode(0x04);//receive

  setInterval(async () => {
    await sendACK(255);
    console.info(`${(new Date()).format()} data sent`);
  }, sendPeriodMS);
}

async function station(reg) {
  console.info('RFM69 reg 0x01:', reg);
  await rfm.setPower(15);
  await rfm.setAddress(0x01, 0x30);
  await rfm.setMode(0x04);//receive

  rfm.on('isData', async () => {
    let buf = [];
    try {
      const pipe = await rfm.receive(buf);
      if (pipe) {
        // console.info(`${(new Date()).format()} ${pipe} data:`, Math.round(rfm.rssi), buf);
        haveData.emit('isData', pipe);
        if (!stationListen) {
          await sendACK(pipe);
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
      //const rssi = await rfm.readRSSI();
      await rfm.send(0x01, buf);
      await rfm.awaitSend();
      await rfm.setMode(4);
      let listenTO;
      const dataHandler = () => {
        haveData.off('isData', dataHandler);
        clearTimeout(listenTO);
        resolve();
      };
      haveData.once('isData', dataHandler);
      listenTO = setTimeout(() => {
        haveData.off('isData', dataHandler);
        reject('No responce');
      }, RFM69_ATTEMPT_DELAY);
    } catch (error) {
      console.error('Send error:', error);
      reject(error);
    }
  })
}

async function sendACK(addr) {
  return new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      try {
        //const rssi = await rfm.readRSSI();
        //await rfm.send(addr, [5,0,0,0,7,0,0,0]);
        await rfm.send(addr, [20]);
        await rfm.awaitSend();
        await rfm.setMode(4);
        // console.info(`${(new Date()).format()} ACK sent`, addr);
        resolve();
      } catch (error) {
        console.error('Send error:', error);
        reject(error);
      }
    }, 2);
  })
}
