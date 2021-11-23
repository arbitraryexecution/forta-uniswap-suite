const common = require('./common');

//
// transaction handlers
const largeFlashSwap = require('./large-flash-swap/large-flash-swap');

// block handlers

const txHandlers = [
  largeFlashSwap,
];

const blockHandlers = [
];

const initializeData = {};

async function updatePoolInformation(blockNumber) {
  // if the pools have not been updated once since the initialize() function was called, update
  // them now
  if (blockNumber > initializeData.latestBlock + 1) {
    initializeData.latestBlock = await common.getPoolInformation(
      common.provider,
      common.factoryContract,
      initializeData.latestBlock + 1,
      blockNumber - 1,
      common.poolInformation,
    );
  }

  // determine the conversion from each token to USDC
  common.createConversionGraph(common.poolInformation);

  // set the variable so this code does not run again
  initializeData.upToDate = true;
}

// returns findings over all txHandler's handleTransaction functions
function provideHandleTransaction(agents) {
  return async function handleTransaction(txEvent) {
    // eslint-disable-next-line no-cond-assign
    if (initializeData.upToDate === false && (initializeData.upToDate = true)) {
      await updatePoolInformation(txEvent.blockNumber);
    }
    const findings = (
      await Promise.all(
        agents.map((agent) => agent.handleTransaction(txEvent)),
      )
    ).flat();

    return findings;
  };
}

// returns findings over all blockHandler's handleBlock functions
function provideHandleBlock(agents) {
  return async function handleBlock(blockEvent) {
    // eslint-disable-next-line no-cond-assign
    if (initializeData.upToDate === false && (initializeData.upToDate = true)) {
      await updatePoolInformation(blockEvent.blockNumber);
    }
    const findings = (
      await Promise.all(
        agents.map((agent) => agent.handleBlock(blockEvent)),
      )
    ).flat();

    return findings;
  };
}

// returns a promise of all the async initialize calls
function provideInitialize(agents) {
  return async function initialize() {
    // get all of the data for the Uniswap V3 pools
    initializeData.latestBlock = await common.latestBlockPromise;
    initializeData.upToDate = false;
    return Promise.all(agents.map(async (agent) => {
      if (typeof agent.initialize === 'function') {
        return agent.initialize();
      }
      return Promise.resolve();
    }));
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize([...txHandlers, ...blockHandlers]),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(txHandlers),
  provideHandleBlock,
  handleBlock: provideHandleBlock(blockHandlers),
};
