const piTemp = require('pi-temperature');

module.exports = {
    async getTemp() {
        return new Promise((resolve, reject) => {
            piTemp.measure((err, tempFloat) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(tempFloat);
            });
        });
    }
}
