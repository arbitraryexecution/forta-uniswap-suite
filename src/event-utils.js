/* event-utils.js
   Contains helper functions for encoding log data and receipts.
*/

const ethers = require('ethers');

// constant values
const ZERO_ADDRESS = ethers.constants.AddressZero;
const ZERO_HASH = ethers.constants.HashZero;

// default empty log structure
const emptyLog = {
  address: ZERO_HASH,
  logIndex: 0,
  blockNumber: 0,
  blockHash: ZERO_HASH,
  transactionIndex: 0,
  transactionHash: ZERO_HASH,
  removed: false,
};

// function to encode default values
function defaultType(type) {
  switch (type) {
    case 'address':
      return ZERO_ADDRESS;
    case 'bool':
      return false;
    case 'string':
      return '';
    case 'bytes':
      return '';
    case 'array':
      throw new Error('array not implemented');
    case 'tuple':
      throw new Error('tuple not implemented');
    default:
      return 0;
  }
}

// creates log with sparse inputs
function createLog(eventAbi, inputArgs, logArgs) {
  const topics = [];
  const dataTypes = [];
  const dataValues = [];

  // initialize default log and assign passed in values
  const log = { ...emptyLog, ...logArgs };

  // build topics and data fields
  topics.push(ethers.utils.Interface.getEventTopic(eventAbi));

  // parse each input, save into topic or data depending on indexing, may
  // have to skip if param._isParamType is false, does not support dynamic types
  eventAbi.inputs.forEach((param) => {
    const { type } = param;
    const data = inputArgs[param.name] || defaultType(type);
    if (param.indexed) {
      topics.push(ethers.utils.defaultAbiCoder.encode([type], [data]));
    } else {
      dataTypes.push(type);
      dataValues.push(data);
    }
  });

  // assign topic and data
  log.topics = topics;
  log.data = ethers.utils.defaultAbiCoder.encode(dataTypes, dataValues);

  return log;
}

/**
 * Log(address, topics, data, logIndex, blockNumber, blockHash, transactionIndex,
 * transactionHash, removed)
 *
 * Receipt(status, root, gasUsed, cumulativeGasUsed, logsBloom, logs, contractAddress
 * blockNumber, blockHash, transactionIndex, transactionHash)
 */
function createReceipt(logs, contractAddress) {
  return {
    status: null,
    root: null,
    gasUsed: null,
    cumulativeGasUsed: null,
    logsBloom: null,
    logs,
    contractAddress,
    blockHash: null,
    transactionIndex: null,
    transactionHash: null,
    blockNumber: null,
  };
}

module.exports = {
  createLog,
  createReceipt,
};
