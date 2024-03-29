const Buffer = require('buffer').Buffer;

const EXT1_V_k = 12.44/2020;

function decodeDate(zipDate) {
    let s, m, h, dd, mm, yy;
    s = zipDate & 63;
    zipDate = zipDate >> 6;
    m = zipDate & 63;
    zipDate = zipDate >> 6;
    h = zipDate & 31;
    zipDate = zipDate >> 5;
    dd = zipDate & 31;
    zipDate = zipDate >> 5;
    mm = zipDate & 15;
    zipDate = zipDate >> 4;
    yy = zipDate & 63;
    return new Date(Date.UTC(2000 + yy, mm - 1, dd, h, m, s));
}

function encodeDate(date) {
    let zipDate;
    zipDate = date.getUTCFullYear() - 2000;
    zipDate = zipDate << 4;
    zipDate += date.getUTCMonth() + 1;
    zipDate = zipDate << 5;
    zipDate += date.getUTCDate();
    zipDate = zipDate << 5;
    zipDate += date.getUTCHours();
    zipDate = zipDate << 6;
    zipDate += date.getUTCMinutes();
    zipDate = zipDate << 6;
    zipDate += date.getUTCSeconds();
    return zipDate;
}

function dataSize(indexContainer, size) {
    const shift = indexContainer.index;
    indexContainer.index += size;
    return shift;
}

function UINT_8(buffer, indexContainer) {
    return buffer.readUInt8(dataSize(indexContainer, 1));
}
function INT_8(buffer, indexContainer) {
    return buffer.readInt8(dataSize(indexContainer, 1));
}
function UINT_16(buffer, indexContainer) {
    return buffer.readUInt16LE(dataSize(indexContainer, 2));
}
function INT_16(buffer, indexContainer) {
    return buffer.readInt16LE(dataSize(indexContainer, 2));
}
function UINT_32(buffer, indexContainer) {
    return buffer.readUInt32LE(dataSize(indexContainer, 4));
}
function DATE_TIME(buffer, indexContainer) {
    const zipDate = UINT_32(buffer, indexContainer);
    return decodeDate(zipDate);
}
function current_date_time() {
    return new Date();
}
function dataProcess(type, mul, div) {
    return function (buffer, indexContainer) {
        let result = type(buffer, indexContainer) || 0;
        if (mul != null) {
            result = result * mul;
        }
        if (div) {
            result = result / div;
        }
        return result;
    }
}
function probeState(buffer, indexContainer) {
    const encData = UINT_16(buffer, indexContainer);
    return decodeStruct(encData, settingsFlag);
}
function probeErrors(buffer, indexContainer) {
    let stateDate = UINT_32(buffer, indexContainer);
    const res = {};
    ErrorFlags.forEach(flag => {
        if (stateDate & 1) {
            res[flag] = true;
        }
        stateDate = stateDate >> 1;
    });
    res.count = stateDate;
    return res;
}
function probeCustomPack(buffer, indexContainer) {
    const res = {};
    const shift = indexContainer.index;
    const packSize = UINT_8(buffer, indexContainer);
    res.packSize = packSize;
    let dataTypes = UINT_16(buffer, indexContainer);
    res.dataTypes = dataTypes;
    settingsFlag.forEach(key => {
        if (dataTypes & 1) {
            res[key] = flagsProcessing[key](buffer, indexContainer);
        }
        dataTypes = dataTypes >> 1;
    });
    return res;
}

const HEADStruct = {
    // pipe: UINT_8,
    // rssi: INT_8,
    pack_type: UINT_8,
    num: UINT_8,
    serverDate: current_date_time
}
const DHTStruct = {
    temp: dataProcess(INT_16, undefined, 10),
    hum: dataProcess(UINT_16, undefined, 10),
    date: DATE_TIME,
    bat_v: dataProcess(UINT_8, undefined, 10),
    core_t: UINT_8
}
const UIDStruct = {
    UID: UINT_32,
}
const UID_ExtStruct = {
    UID: UINT_32,
    major: UINT_8,
    minor: UINT_8,
}
const ACKStruct = {
    taskNum: UINT_8
}
const ErrorsStruct = {
    errors: probeErrors,
}
const Ext1Struct = {
    data: probeCustomPack
    // packSize: UINT_8,
    // dataTypes: UINT_16,
    // bat_v: dataProcess(UINT_16, undefined, 10),
    // core_t: UINT_16,
    // ext1_v: UINT_16,
}
const RunStateStruct = {
    packSize: UINT_8,
    dataTypes: UINT_16,
    state: probeState
}

const TYPES_MAP = {
    1: UIDStruct,
    2: DHTStruct,
    3: UID_ExtStruct,
    4: Ext1Struct,
    5: RunStateStruct,
    10: ErrorsStruct,
    20: ACKStruct
}

const settingsFlag = [
    'PROBE_V_BAT',
    'PROBE_V_REF',
    'PROBE_CORE_TEMP',
    'PROBE_DHT_TEMP',
    'PROBE_DHT_HUM',
    'PROBE_EXT1_V',
    'PROBE_EXT2_OUT',
    'PROBE_BEAM_MODE'
];

const flagsProcessing = {
    PROBE_V_BAT: dataProcess(UINT_16, undefined, 10),
    PROBE_V_REF: UINT_16,
    PROBE_CORE_TEMP: UINT_16,
    PROBE_DHT_TEMP: dataProcess(INT_16, undefined, 10),
    PROBE_DHT_HUM: dataProcess(UINT_16, undefined, 10),
    PROBE_EXT1_V: UINT_16,
    PROBE_EXT2_OUT: UINT_8,
    PROBE_BEAM_MODE: UINT_8
}

function decodeStruct(encData, flags) {
    const res = {};
    flags.forEach(key => {
        res[key] = Boolean(encData & 1);
        encData = encData >> 1;
    })
    return res;
}

function encodeStruct(data, flags) {
    let res = 0;
    flags.slice().reverse().forEach(key => {
        res = res << 1;
        if (data[key]) {
            res |= 1;
        }
    })
    return res;
}

function getBody(buffer, result, dataType, indexContainer) {
    if (dataType) {
        Object.keys(dataType).forEach(key => {
            result[key] = dataType[key](buffer, indexContainer);
        });
    }
}

function getData(buffer, indexContainer) {
    const data = {};
    const startIndex = indexContainer.index;
    getBody(buffer, data, HEADStruct, indexContainer);
    const packHandler = TYPES_MAP[data.pack_type];
    // console.info('HANDLER:', data.pack_type)
    if (packHandler) {
        getBody(buffer, data, packHandler, indexContainer);
    }
    if (data.packSize) {
        indexContainer.index = startIndex + data.packSize + 3;
    }
    return data;
}

function pipePad(pipe, size) {
    var sign = Math.sign(pipe) === -1 ? '-' : '';
    return sign + new Array(size).concat([Math.abs(pipe)]).join('0').slice(-size);
}

function getPackTitle(packData) {
    let result = `${packData.serverDate.toJSON()} | NUM: ${packData.num} | Pipe: ${pipePad(packData.pipe, 3)} | RSSI: ${packData.rssi} | TYPE: ${packData.pack_type}`;
    switch (packData.pack_type) {
        case 1:
            result = `${result} | UID: ${packData.UID}`;
            break;
        case 2:
            result = `${result} | BAT: ${packData.bat_v.toFixed(1)} | CORE: ${pipePad(packData.core_t, 2)} | TEMP: ${packData.temp.toFixed(1)} | HUM: ${packData.hum.toFixed(1)}`;
            break;
        case 3:
            result = `${result} | UID: ${packData.UID} | Version: ${packData.major}.${packData.minor}`;
            break;
        case 4:
            result = `${result} | BAT: ${packData.data.PROBE_V_BAT.toFixed(1)} | SIZE: ${packData.data.packSize} | TYPES: ${packData.data.dataTypes} | CORE: ${pipePad(packData.data.PROBE_CORE_TEMP, 2)} | EXT1: ${((packData.data.PROBE_EXT1_V || 0)*EXT1_V_k).toFixed(2)}`;
            break;
        case 5:
            result = `${result} | SIZE: ${packData.packSize} | TYPES: ${packData.dataTypes} | STATE: ${packData.state}`;
            break;
        case 20:
            result = `${result} | TASK: ${packData.taskNum}`;
            break;
    }
    return `${result} %s`;
}

function setAddressPack(address, subnet, core_UID) {
    // task(8), last(8), addr(16), data(32)
    let uid_sig = (core_UID & 0xffff) + ((core_UID >> 16) & 0xffff);
    return [6, 0, uid_sig & 0xff, (uid_sig >> 8) & 0xff, address, subnet, 0, 0];
}

function reqUIDPack() {
    // Req extended UID
    return [2, 0, 0, 0, 1, 0, 0, 0];
}

function setSettingsPack(setStruct) {
    const settings = encodeStruct(setStruct, settingsFlag);
    return [12, 0, 0, 0, settings, 0, 0, 0];
}

function reqSettingsPack() {
    return [13, 0];
}

function ackPack() {
    return [20, 0];
}

function processDHTpack(pipe, rssi, dataArray) {
    let comData = [];
    const buffer = Buffer.from(dataArray);
    const bufferStep = { index: 0 };

    while (bufferStep.index < buffer.length) {
        const packData = getData(buffer, bufferStep);
        packData.pipe = pipe;
        packData.rssi = rssi;
        console.log(getPackTitle(packData), '');
        comData.push(packData);
    }
    return comData;
}

function getPipeAckData(pipe, packData) {
    if (packData.pack_type == 1) {
        const pipeNum = pipeNumbers[packData.UID];
        if (pipeNum) {
            return setAddressPack(pipeNum.addr, pipeNum.subnet, packData.UID);
        }
    // If pipe sent 20 - ACK
    // } else if (packData.pack_type == 20 || packData.pack_type == 21) {
    //     return null;
    } else if (pipe == 255) {
        return reqUIDPack();
    }
    // Simple ACK
    return [20, 0];
}

module.exports = {
    processDHTpack,
    setAddressPack,
    reqUIDPack,
    setSettingsPack,
	reqSettingsPack,
    ackPack,
    // Obsolete
    getPipeAckData
}
