const BigNumber = require("bignumber.js");
const {
  Finding,
  FindingSeverity,
  FindingType,
  ethers,
  getEthersProvider,
} = require("forta-agent");

// load agent configurations
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
    data.erc20Abi = utils.getAbi("ERC20.json");

    // get liquidityThresholdPercentChange
    data.liquidityThresholdPercentChange = new BigNumber(
      config.liquidityThresholdPercentChange
    );
  };
}

// keep state of liquidity during previous block
let previousLiquidity;

function provideHandleBlock(data) {
  return async function handleBlock(blockEvent) {
    // destructure params from initialized data
    const {
      poolAbi,
      erc20Abi,
      provider,
      factoryContract,
      everestId,
      liquidityThresholdPercentChange,
    } = data;

    // make sure that data is initialized first
    if (!provider) throw new Error("handleBlock called before initialization");

    let poolContract = utils.getContract("Usdc/EthPool", provider);
    let token0Address = await poolContract.functions.token0();
    let token1Address = await poolContract.functions.token1();

    let token0Contract = new ethers.Contract(token0Address, erc20Abi, provider);
    let token1Contract = new ethers.Contract(token1Address, erc20Abi, provider);

    token0Contract = token0Contract.attach(token0Address);
    token1Contract = token1Contract.attatch(token1Address);

    // get a block and filter it through to test it out
  };
}

// helper function to create alerts
function createAlert() {}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
