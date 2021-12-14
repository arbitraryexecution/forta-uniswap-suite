const {
  Finding, FindingSeverity, FindingType, ethers, getEthersProvider,
} = require('forta-agent');
const { getAbi, filterAndParseLogs } = require('../common');

// load any agent configuration parameters
const config = require('../../agent-config.json');

// load contract and oracle addresses
const contractAddresses = require('../../contract-addresses.json');

const addressList = Object.values(contractAddresses).map((item) => item.address.toLowerCase());

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// helper function to create alerts
function createAlert(
  address,
  everestId,
  protocolName,
  protocolAbbreviation,
  lowSeverity,
) {
  let type; let
    severity;
  if (lowSeverity) {
    type = FindingType.Info;
    severity = FindingSeverity.Info;
  } else {
    type = FindingType.Suspicious;
    severity = FindingSeverity.Medium;
  }
  return Finding.fromObject({
    name: `${protocolName} Address Watch Notification`,
    description: 'Key protocol address involved in a transaction',
    alertId: `AE-${protocolAbbreviation}-ADDRESS-WATCH`,
    type,
    severity,
    everestId,
    protocol: `${protocolName}`,
    metadata: {
      address,
    },
  });
}

// helper function to update the key protocol addresses
async function getKeyAddresses(data) {
  // iterate over each contract name to get the key addresses
  const addresses = await Promise.all(data.contracts.map(async (contract) => {
    /* eslint-disable no-prototype-builtins */
    let address;
    if (contract.hasOwnProperty('minter')) {
      // get the minter address for a contract that has it
      address = await contract.minter();
    } else if (contract.hasOwnProperty('owner')) {
      // get the owner address for a contract that has it
      address = await contract.owner();
    } else if (contract.hasOwnProperty('admin')) {
      // get the admin address for a contract that has it
      address = await contract.admin();
    }
    if (address) {
      return address.toLowerCase();
    }
    return address;
    /* eslint-enable no-prototype-builtins */
  }));

  // filter out undefined entries and then remove duplicates
  return [...new Set(addresses.filter((address) => address !== undefined))];
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.everestId = config.EVEREST_ID;
    data.protocolName = config.PROTOCOL_NAME;
    data.protocolAbbreviation = config.PROTOCOL_ABBREVIATION;

    // initialize a provider object to set up callable contract objects
    const provider = getEthersProvider();

    // store contracts as callable ethers Contract objects
    data.contracts = [];
    Object.keys(contractAddresses).forEach((name) => {
      const { address, abiFile } = contractAddresses[name];
      const abi = getAbi(abiFile);
      data.contracts.push(new ethers.Contract(address, abi, provider));
    });

    data.addresses = await getKeyAddresses(data);

    // no need to check again until there is a change event
    data.check = false;
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    /* eslint-disable no-param-reassign */
    const {
      contracts, everestId, protocolName, protocolAbbreviation,
    } = data;

    if (!contracts) throw new Error('handleTransaction called before initialization');

    // check if this tx changed any of the admins
    contracts.forEach((contract) => {
      const parsedLogs = filterAndParseLogs(
        txEvent.logs, contract.address.toLowerCase(), contract.interface,
        ['MinterChanged', 'NewAdmin', 'OwnerChanged', 'OwnershipTransferred', 'AdminChanged'],
      );
      data.check = data.check || (parsedLogs.length > 0);
    });

    if (data.check) { // there was an admin change, pull current admin addresses
      data.addresses = await getKeyAddresses(data);
      data.check = false;
      /* eslint-enable no-param-reassign */
    }

    // get all addresses involved in tx
    const txAddrs = Object.keys(txEvent.addresses);

    const findings = [];

    data.addresses.forEach((address) => {
      if (txAddrs.includes(address)) {
        // if interacting with a known protocol contract, set low severity alert
        const lowSeverity = addressList.includes(txEvent.to.toLowerCase())
            || addressList.includes(txEvent.from.toLowerCase());
        findings.push(createAlert(
          address,
          everestId,
          protocolName,
          protocolAbbreviation,
          lowSeverity,
        ));
      }
    });

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
  createAlert,
  getAbi,
};
