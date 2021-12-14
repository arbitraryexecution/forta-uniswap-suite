const { Finding, FindingSeverity, FindingType, ethers } = require('forta-agent');
const { getAbi, filterAndParseLogs, extractEventArgs } = require('../common');

// load any agent configuration parameters
const config = require('../../agent-config.json');

// load contract addresses
const contractAddresses = require('../../contract-addresses.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// get the Array of events for a given contract
function getEvents(contractName, adminEvents) {
  const events = adminEvents[contractName];
  if (events === undefined) {
    return {}; // no events for this contract
  }
  return events;
}

// helper function to create alerts
function createAlert(
  eventName,
  contractName,
  contractAddress,
  eventType,
  eventSeverity,
  args,
  everestId,
  protocolName,
  protocolAbbreviation,
) {
  const eventArgs = extractEventArgs(args);
  return Finding.fromObject({
    name: `${protocolName} Admin Event`,
    description: `The ${eventName} event was emitted by the ${contractName} contract`,
    alertId: `AE-${protocolAbbreviation}-ADMIN-EVENT`,
    type: FindingType[eventType],
    severity: FindingSeverity[eventSeverity],
    everestId,
    protocol: protocolName,
    metadata: {
      contractName,
      contractAddress,
      eventName,
      eventArgs,
    },
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.adminEvents = config.adminEvents;
    data.everestId = config.EVEREST_ID;
    data.protocolName = config.PROTOCOL_NAME;
    data.protocolAbbreviation = config.PROTOCOL_ABBREVIATION;

    // get the contract names that have events that we wish to monitor
    const contractNames = Object.keys(data.adminEvents);

    // load the contract addresses, abis, and ethers interfaces
    data.contracts = contractNames.map((name) => {
      const { address, abiFile } = contractAddresses[name];
      if (address === undefined) {
        throw new Error(`No address found in contract-addresses.json for '${name}'`);
      }

      if (abiFile === undefined) {
        throw new Error(`No ABI file found in contract-addresses.json for '${name}'`);
      }

      const abi = getAbi(abiFile);
      const iface = new ethers.utils.Interface(abi);

      const contract = {
        name,
        address,
        iface,
      };

      return contract;
    });

    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      adminEvents, contracts, everestId, protocolName, protocolAbbreviation,
    } = data;
    if (!contracts) throw new Error('handleTransaction called before initialization');

    const findings = [];

    // iterate over each contract name to get the address and events
    contracts.forEach((contract) => {
      // for each contract look up the events of interest
      const events = getEvents(contract.name, adminEvents);
      const eventNames = Object.keys(events);

      // filter down to only the events we want to alert on
      const parsedLogs = filterAndParseLogs(
        txEvent.logs,
        contract.address.toLowerCase(),
        contract.iface,
        eventNames,
      );

      // alert on each item in parsedLogs
      parsedLogs.forEach((parsedLog) => {
        findings.push(createAlert(
          parsedLog.name,
          contract.name,
          contract.address,
          events[parsedLog.name].type,
          events[parsedLog.name].severity,
          parsedLog.args,
          everestId,
          protocolName,
          protocolAbbreviation,
        ));
      });
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
};
