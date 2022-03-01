const BigNumber = require("bignumber.js");
const {
  Finding,
  FindingSeverity,
  FindingType,
  getJsonRpcUrl,
  ethers,
  getEthersProvider,
} = require("forta-agent");

const config = require("../agent-config.json");

const utils = require("./utils");

// used to store initialization data once you pass it into the provideHandleBlock() function
const initializeData = {};

// use this function to setup all your data. You'll run it as an immediately invoked function to fill your initlaizeData object
function provideInitialize(data) {
  return async function initialize() {
    data.everestId = config.EVEREST_ID;

    // setup ethers.js provider to interact with contracts
    data.provider = getEthersProvider();

    // get contract factory
    data.factoryContract = utils.getContract("UniswapV3Factory", data.provider);

    // get abi
    data.poolAbi = utils.getAbi("UniswapV3Pool.json");

    // get liquidityThresholdPercentChange
    data.liquidityThresholdPercentChange = new BigNumber(
      config.liquidityThresholdPercentChange
    );
  };
}

function provideHandleBlock(data) {
  return async function handleBlock(blockEvent) {
    const {
      poolAbi,
      provider,
      factoryContract,
      everestId,
      liquidityThresholdPercentChange,
    } = data;

    // factory contract creates each factory pool
    // first you want to get the factory pool that you want to scan for
  };
}

function handleBlock(blockEvent) {}

// helper function to create alerts
function createAlert() {}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
