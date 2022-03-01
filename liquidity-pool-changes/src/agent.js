const BigNumber = require("bignumber.js"); // always convert ethers.js bignumber to javascript bignumber
const axios = require("axios").default;

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

const DECIMALS_ABI = ["function decimals() view returns (uint8)"];

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

    const findings = [];

    let poolContract = utils.getContract("Usdc/EthPool", provider);
    let token0Address = await poolContract.token0();
    let token1Address = await poolContract.token1();

    let token0Contract = new ethers.Contract(token0Address, erc20Abi, provider);
    let token1Contract = new ethers.Contract(token1Address, erc20Abi, provider);

    // attatch erc20 methods so you can check the erc20 token balances of each token for the given pool
    token0Contract = token0Contract.attach(token0Address);
    token1Contract = token1Contract.attach(token1Address);

    let balance = await token0Contract.balanceOf(poolContract.address);
    // factoryContract.getPool(token0Address, token1Address, )

    // get a block and filter it through to test it out
    let result = await getTokenPrices(token0Address, token1Address);

    // return findings at the end
    return findings
  };
}

async function getTokenPrices(token0Address, token1Address) {
  const coingeckoApiUrl =
    "https://api.coingecko.com/api/v3/simple/token_price/ethereum?";
  const addressQuery = `contract_addresses=${token0Address},${token1Address}`;
  const vsCurrency = "&vs_currencies=usd";

  const url = coingeckoApiUrl.concat(addressQuery.concat(vsCurrency));
  const { data } = await axios.get(url);

  // parse response to convert to BigNumber.js
  const usdPerToken0 = new BigNumber(data[token0Address.toLowerCase()].usd);
  const usdPerToken1 = new BigNumber(data[token1Address.toLowerCase()].usd);

  return { token0Price: usdPerToken0, token1Price: usdPerToken1 };
}

async function getSwapTokenUSDValue() {
  // get the decimal scaling for this token
  const contract = new ethers.Contract(tokenAddress, DECIMALS_ABI, provider);
  let decimals;
  try {
    // calling .decimals() may fail for a vyper contract
    decimals = await contract.decimals();
  } catch {
    return undefined;
  }
  const denominator = new BigNumber(10).pow(decimals);

  // multiply by the price and divide out decimal places
  return amountBN.times(tokenPrice).div(denominator);
}

// helper function to create alerts
function createAlert() {}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
