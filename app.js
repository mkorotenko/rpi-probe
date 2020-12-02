//Require the pigpio package, this is from https://github.com/fivdi/pigpio
//This is a Node.js wrapper around the native pigpio C library https://github.com/joan2937/pigpio
// Service settings: /etc/systemd/system/fan-driver.service
// sudo systemctl daemon-reload
// sudo systemctl restart fan-driver.service
// sudo node --inspect-brk=192.168.1.200 dev/Probe/app.js

const fanManager = require('./fan_manager');

fanManager.start();
