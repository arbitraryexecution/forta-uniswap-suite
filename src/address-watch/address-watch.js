const ethers = require('ethers');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// load any agent configuration parameters
const config = require('../../agent-config.json');

// load contract and oracle addresses
const contractAddresses = require('../../contract-addresses.json');
const addressList = Object.values(contractAddresses).map((address) => {
    return address.toLowerCase();
});

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// helper function to fetch abi
function getAbi(abiName) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../../abi/${abiName}`);
  return abi;
}

// helper function to filter logs based on contract addresses and event names
function filterAndParseLogs(logs, address, iface, eventNames) {
  // collect logs only from the contracts of interest
  const contractLogs = logs.filter((log) => log.address === address);
  if (contractLogs.length === 0) {
    return [];
  }

  // decode logs and filter on the ones we are interested in
  const parse = (log) => iface.parseLog(log);
  const filter = (log) => eventNames.indexOf(log.name) !== -1;
  const parsedLogs = contractLogs.map(parse).filter(filter);

  return parsedLogs;
}

// helper function to create alerts
function createAlert(
  address,
  tx,
  everestId,
  protocolName,
  protocolAbbreviation,
  lowSeverity
) {
  let type, severity;
  if(lowSeverity){
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
    type: type,
    severity: severity,
    everestId,
    protocol: `${protocolName}`,
    metadata: {
      address,
      tx,
    },
  });
}

// helper function to update the key protocol addresses
async function getKeyAddresses(data){
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
    const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

    // store contracts as callable ethers Contract objects
    data.contracts = [];
    Object.keys(contractAddresses).forEach((contract) => {
      const addr = contractAddresses[contract];
      const abi = getAbi(contract);
      data.contracts.push(new ethers.Contract(addr, abi, provider));
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
      contracts, everestId, protocolName, protocolAbbreviation
    } = data;

    if (!contracts) throw new Error('handleTransaction called before initialization');

    // check if this tx changed any of the admins
    contracts.forEach((contract) => {
      const parsedLogs = filterAndParseLogs(txEvent.logs, contract.address, contract.interface,
        ['MinterChanged', 'NewAdmin', 'OwnerChanged', 'OwnershipTransferred', 'AdminChanged']);
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
        const lowSeverity = addressList.includes(txEvent.to.toLowerCase()) || addressList.includes(txEvent.from.toLowerCase());
        findings.push(createAlert(
          address,
          txEvent.hash,
          everestId,
          protocolName,
          protocolAbbreviation,
          lowSeverity
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
