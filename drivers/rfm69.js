'use strict';
const Gpio = require('pigpio').Gpio;
const spi = require('spi-device');
const EventEmitter = require('events').EventEmitter;

const SUB_NET = 0x48;

const rfm69_base_config = [
  [0x01, 0x04], // RegOpMode: Standby Mode
  [0x02, 0x00], // RegDataModul: Packet mode, FSK, no shaping
  //    [0x03, 0x0C], // RegBitrateMsb: 10 kbps
  //    [0x04, 0x80], // RegBitrateLsb
  [0x03, 0x03], // RegBitrateMsb: 38.4 kbps
  [0x04, 0x41], // RegBitrateLsb
  [0x05, 0x01], // RegFdevMsb: 20 kHz
  [0x06, 0x48], // RegFdevLsb
  [0x07, 0xD9], // RegFrfMsb: 868,15 MHz
  [0x08, 0x09], // RegFrfMid
  [0x09, 0x9A], // RegFrfLsb
  [0x18, 0x88], // RegLNA: 200 Ohm impedance, gain set by AGC loop
  [0x19, 0x4C], // RegRxBw: 25 kHz
  //[0x25, 0x04], // DIO2 = 0x01
  [0x2C, 0x00], // RegPreambleMsb: 3 bytes preamble
  [0x2D, 0x03], // RegPreambleLsb
  [0x2E, 0x88], // RegSyncConfig: Enable sync word, 2 bytes sync word
  [0x2F, 0x41], // RegSyncValue1: 0x4148
  [0x30, SUB_NET], // RegSyncValue2
  [0x37, 0xD0 | 0x02], // RegPacketConfig1: Variable length, CRC on, whitening
  [0x38, 0x40], // RegPayloadLength: 64 bytes max payload
  //[ REG_NODEADRS, nodeID ]
  [0x3C, 0x8F], // RegFifoThresh: TxStart on FifoNotEmpty, 15 bytes FifoLevel
  [0x58, 0x1B], // RegTestLna: Normal sensitivity mode
  [0x6F, 0x30], // RegTestDagc: Improved margin, use if AfcLowBetaOn=0 (default)
];

const RFM69_MODE_SLEEP = 0,
  RFM69_MODE_STANDBY = 1,
  RFM69_MODE_FS = 2,
  RFM69_MODE_TX = 3,
  RFM69_MODE_RX = 4;

const RFM69_ADDR = 255;

const RFM69_SPI_Hz = 12000000;

const RFM69_MAX_PAYLOAD = 64; ///< Maximum bytes payload

const REG_NODEADRS = 0x39;

const RFM69_NOISE_FILTER = 50; // ms

const CSMA_RSSI_THRESHOLD = -85;


class Rfm69Connector extends EventEmitter {

  constructor(bus, device) {
    super();
    this.bus = bus;
    this.device = device;
    this.opened = false;
    this.onFifoNE = this.onFifoNE.bind(this);
  }

  chipSelect() {
    if (this.selected) {
      return false;
    }
    this.nss.digitalWrite(0);
    this.selected = true;
    return true;
  }

  chipUnselect() {
    if (this.selected) {
      this.nss.digitalWrite(1);
      this.selected = false;
      return true;
    }
    return false;
  }

  async init(nss, rst, event) {
    this.busy = false;
    this.selected = true;

    this.nssPin = nss;
    this.nss = new Gpio(this.nssPin, { mode: Gpio.OUTPUT });
    this.rstPin = rst;
    this.rst = new Gpio(this.rstPin, { mode: Gpio.OUTPUT });
  
    this.eventPin = event;
    this.event = new Gpio(this.eventPin, {
      mode: Gpio.INPUT,
      pullUpDown: Gpio.PUD_DOWN,
      edge: Gpio.EITHER_EDGE
    });

    this.fifoNE = false;
    this.filterTO = 0;
    this.event.on('interrupt', this.onFifoNE);

    this.TXeventPin = 23;
    this.TXevent = new Gpio(this.TXeventPin, {
      mode: Gpio.INPUT,
      pullUpDown: Gpio.PUD_DOWN,
      edge: Gpio.RISING_EDGE
    });
    this.TXevent.on('interrupt', () => {
      this.emit('isSent');
    });

    this.nodeAddr = RFM69_ADDR;
    this.subNet = SUB_NET;
    this.rssi = 0;

    this.highPower = false;
    this.highPowerDevice = true;

    this.chipUnselect();

    await this.reset();

    await new Promise((resolve, reject) => {
      this.spi = spi.open(this.bus, this.device, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.opened = true;
        resolve();
      });
    })

    await this.initDevice();

    await this.clearFifo();
  }

  onFifoNE(level) {
    const curLevel = !!level;

    if (curLevel) {
      if (!this.filterTO) {
        this.filterTO = setTimeout(() => {
          this.filterTO = 0;
          this.fifoNE = true;
          this.emit('isData');
        }, RFM69_NOISE_FILTER);
      }
    } else {
      this.fifoNE = false;
      if (this.filterTO) {
        clearTimeout(this.filterTO);
        this.filterTO = 0;
      }
    }

  }

  async reset() {
    return new Promise((resolve, reject) => {
      this.rst.digitalWrite(1);
      setTimeout(() => {
        this.rst.digitalWrite(0);
        resolve();
      }, 1);
    })
  }

  async readRegister(reg) {
    return new Promise((resolve, reject) => {
      if (!this.opened) {
        reject('Not opened');
        return;
      }

      if (this.busy) {
        reject('Interface is busy');
        return;
      }

      if (reg > 0x7f) {
        reject('Wrong register');
        return;
      }

      if (!this.chipSelect()) {
        reject('Chip already selected');
        return;
      }

      const message = [{
        sendBuffer: Buffer.from([reg, 0]),
        receiveBuffer: Buffer.alloc(2),
        byteLength: 2,
        speedHz: RFM69_SPI_Hz
      }];

      this.busy = true;

      this.spi.transfer(message, (err, message) => {
        this.chipUnselect();
        this.busy = false;
        if (err) {
          reject(err);
          return;
        }
        resolve(message[0].receiveBuffer[1]);
      });

    })
  }

  async writeRegister(reg, value) {
    return new Promise((resolve, reject) => {
      if (!this.opened) {
        reject('Not opened');
        return;
      }

      if (this.busy) {
        reject('Interface is busy');
        return;
      }

      if (reg > 0x7f) {
        reject('Wrong register');
        return;
      }

      if (!this.chipSelect()) {
        reject('Chip already selected');
        return;
      }

      const message = [{
        sendBuffer: Buffer.from([reg | 0x80, value]),
        receiveBuffer: Buffer.alloc(2),
        byteLength: 2,
        speedHz: RFM69_SPI_Hz
      }];

      this.busy = true;

      this.spi.transfer(message, (err, message) => {
        this.chipUnselect();
        this.busy = false;
        if (err) {
          reject(err);
          return;
        }
        resolve(message[0].receiveBuffer[1]);
      });

    })
  }

  async initDevice() {
    for (const item of rfm69_base_config) {
      await this.writeRegister(item[0], item[1]);
    }
  }

  async clearFifo() {
    return this.writeRegister(0x28, 0x10);
  }

  async setMode(mode) {
    return this.writeRegister(0x01, mode * 4);
  }

  async setAddress(addr, subNet) {
    await this.writeRegister(REG_NODEADRS, addr);
    await this.writeRegister(0x30, subNet || SUB_NET);
    
    this.nodeAddr = addr;
  }

  async awaitModeReady() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, 1);
    })
  }

  async receive(buf) {
    const stat = await this.readRegister(0x01);
    if (stat != 0x10) {
      await this.setMode(RFM69_MODE_RX);
      await this.awaitModeReady();
    }

    const payloadReady = await this.readRegister(0x28);
    if (payloadReady & 0x04) {
      await this.setMode(RFM69_MODE_STANDBY); // RFM69_MODE_STANDBY

      const dataLength = await this.readRegister(0);
      await this.readRegister(0); // addr to
      let addr = await this.readRegister(0); // pipe addr

      let payloadLength = 0;

      //just sync loop
      for (const t of '0'.repeat(dataLength)) {
        const reg = await this.readRegister(0x28);
        if (reg & 0x40) {
          buf[payloadLength] = await this.readRegister(0);
          payloadLength++;
        } else {
          break;
        }
      }

      //is RSSI is most accurate as the packet comes
      this.rssi = await this.readRSSI();

      await this.setMode(RFM69_MODE_RX);

      return addr;
    }

    return 0;
  }

  async send(addr, buf) {
    const stat = await this.readRegister(0x01);
    if (stat != 0x04) {
      await this.setMode(RFM69_MODE_STANDBY);
      await this.awaitModeReady();
    }

    await this.clearFifo();

    const transfBuf = buf.slice();
    // limit max payload
    if (transfBuf.length > RFM69_MAX_PAYLOAD) {
      transfBuf.length = RFM69_MAX_PAYLOAD;
    }

    // payload must be available
    if (0 == transfBuf.length) {
      return 0;
    }

    this.chipSelect();

    this.busy = true;

    try {
      const header = [
        0x80,
        transfBuf.length + 2,
        addr,
        this.nodeAddr,
      ]
      await this.transfer(header.concat(transfBuf), header.length + transfBuf.length);
    } catch (error) {
      this.busy = false;
      throw error;
    }

    this.chipUnselect();
    this.busy = false;

    await this.setMode(RFM69_MODE_TX);

    return transfBuf.length;
  }

  async awaitSend(ms) {
    return new Promise((resolve, reject) => {
      let sendTO;
      const sentHandler = () => {
        if (sendTO) {
          clearTimeout(sendTO);
        }
        this.off('isSent', sentHandler);
        resolve();
      }
      if (ms) {
        sendTO = setTimeout(() => {
          this.off('isSent', sentHandler);
          reject();
        }, ms)
      }
      this.once('isSent', sentHandler);
    })
  }

  async transfer(buf, receiveLength) {
    return new Promise((resolve, reject) => {
      const message = [{
        sendBuffer: Buffer.from(buf),
        receiveBuffer: Buffer.alloc(receiveLength || 1),
        byteLength: buf.length,
        speedHz: RFM69_SPI_Hz
      }];
  
      this.spi.transfer(message, (err, message) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(message);
      })
    })
  }

  async setPower(dBm) {
    if (dBm < -18 || dBm > 20)
      return -1;

    // if (!this.highPowerDevice && dBm > 13)
    //   return -1;

    // if (this.highPowerDevice && dBm < -2)
    //   return -1;

    let powerLevel = 0;

    if (dBm >= -2 && dBm <= 13)
    {
      // use PA1 on pin PA_BOOST
      powerLevel = dBm + 18;

      // enable PA1 only
      await this.writeRegister(0x11, 0x40 | powerLevel);

      // disable high power settings
      this.highPower = false;
      await this.setHighPower(this.highPower);
    }
    else if (dBm > 13 && dBm <= 17)
    {
      // use PA1 and PA2 combined on pin PA_BOOST
      powerLevel = dBm + 14;

      // enable PA1+PA2
      await this.writeRegister(0x11, 0x60 | powerLevel);

      // disable high power settings
      this.highPower = false;
      await this.setHighPower(this.highPower);
    }
    else
    {
      // output power from 18 dBm to 20 dBm, use PA1+PA2 with high power settings
      powerLevel = dBm + 11;

      // enable PA1+PA2
      await this.writeRegister(0x11, 0x60 | powerLevel);

      // enable high power settings
      this.highPower = true;
      this.setHighPower(this.highPower);
    }
  }

  async setHighPower(enable) {
    if (enable === true && !this.highPowerDevice) {
      enable = false;
    }

    await this.writeRegister(0x5A, enable ? 0x5D : 0x55);
    await this.writeRegister(0x5C, enable ? 0x7C : 0x70);
  }

  async readRSSI() {
    const rssi = await this.readRegister(0x24)/2;
    return -rssi;
  }
}


module.exports = Rfm69Connector;
