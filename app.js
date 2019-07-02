//Require the pigpio package, this is from https://github.com/fivdi/pigpio
//This is a Node.js wrapper around the native pigpio C library https://github.com/joan2937/pigpio
const Rfm69Connector = require('./rfm69');
const piTemp = require('pi-temperature');
const EventEmitter = require('events').EventEmitter;

const RFM69_MAX_ATTEMPTS = 6;
const RFM69_ATTEMPT_DELAY = 80;

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

async function getTemp() {
  return new Promise((resolve, reject) => {
    piTemp.measure((err, tempFloat) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(tempFloat);
    })
  })
}

//Initialize the LED pin for output (GPIO5, GPIO Header Pin 29) 
// let led = new Gpio(5, { mode: Gpio.OUTPUT });
// //and drive it low (off) initially...
// led.digitalWrite(1);
// let i;
// setInterval(() => {
//   if (i) {
//     led.digitalWrite(1);
//     i=0;
//   } else {
//     led.digitalWrite(0);
//     i=1;
//   }
// }, 500);
const haveData = new EventEmitter();

const rfm = new Rfm69Connector(0,0); 
rfm.init(24, 18, 25)
.then(() => {
  rfm.readRegister(0x01)
  .then(async (reg) => {
    console.info('RFM69 reg 0x01:', reg);
    await rfm.setPower(15);
    await rfm.setAddress(0x04);
    await rfm.setMode(0x04);//receive

//    const len = await rfm.receive([]);
    rfm.on('isData', async () => {
      let buf = [];
      try {
        const len = await rfm.receive(buf);
        if (len) {
          console.info('Have data:', rfm.rssi, buf);
          haveData.emit('isData', len);
        }
      } catch (error) {
        console.info('Error on receive:', error);
      }
    });

    setInterval(async () => {

      let buf = [ 1, 0, 0, 0, 239, 1, 230, 0 ];

      let temp = 0;
      try {
        temp = await getTemp();
        temp = Math.round(temp * 10);
      } catch(error) {
        console.info('Get temp error:', error);
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
          if (!attempt) {
            console.info('Sending...', rfm.rssi);
          } else {
            console.info(`Retry ${attempt}...`, rfm.rssi);
          }
          await sendData(buf);
          break;
        } catch (error) {
          attempt++;
        }  
      }
    }, 10000);
  })
  .catch(err => console.error('RFM read error:', err))
})
.catch(err => console.error('RFM init error:', err))

async function sendData(buf) {
  return new Promise(async (resolve, reject) => {
    try {
      const rssi = await rfm.readRSSI();
      // console.info('Sending...', rssi);
      await rfm.send(0x01, buf);
      await rfm.awaitSend();
      await rfm.setMode(4);
      // console.info('Listening...', rssi);
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
      console.info('Send error:', error);
      reject(error);
    }
  })
}
//Initialize the Button pin for input (GPIO6, GPIO Header Pin 31) 
//Use the internal pull down resistor, and have it trigger interrupts
//on both the rising (button pushed) and falling (button released) edges.
// let button = new Gpio(6, {
//   mode: Gpio.INPUT,
//   pullUpDown: Gpio.PUD_DOWN,
//   edge: Gpio.EITHER_EDGE
// });

//When the button interrupt is triggered
//(that could be either when it is turned on or off)
//take in the level of the button (1 or 0)
// button.on('interrupt', function (level) {

//   if (debouncing) {
//     //console.log('Ignoring change. Previous change is debouncing');
//     return;
//   }

// });
