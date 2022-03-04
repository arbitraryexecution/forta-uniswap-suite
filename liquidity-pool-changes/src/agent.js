const BigNumber = require("bignumber.js"); // always convert ethers.js bignumber to javascript bignumber
const axios = require("axios");

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

    // get abi
    data.erc20Abi = utils.getAbi("ERC20.json");

    // get liquidityThresholdPercentChange
    data.liquidityThresholdPercentChange = new BigNumber(
      config.largeLiquidityChange.liquidityThresholdPercentChange
    );
  };
}

let previousLiquidity; // keep state of liquidity during previous block
let counter = 0; // to instantiate the first previousLiquidity amount the first time this agent is ran

function provideHandleBlock(data) {
  return async function handleBlock() {
    const {
      erc20Abi,
      provider,
      everestId,
      liquidityThresholdPercentChange,
    } = data;

    // make sure that data is initialized first
    if (!provider) throw new Error("handleBlock called before initialization");

    const findings = [];

    const poolContract = utils.getContract("Usdc/Eth", provider);

    let token0Address;
    let token1Address;
    try {
      token0Address = await poolContract.token0();
      token1Address = await poolContract.token1();
    } catch {
      // asume its not a Uniswap V3 pool if contract calls fail
      return undefined;
    }

    const token0Contract = new ethers.Contract(token0Address, erc20Abi, provider);
    const token1Contract = new ethers.Contract(token1Address, erc20Abi, provider);

    // get amount of eth in the pool if applicable (note if the pool is using WETH, then this value is 0)
    const poolEthBalance = await provider.getBalance(poolContract.address);

    // get the # amount of each tokens in the liquidity pool
    const tokenBalance0 = await token0Contract.balanceOf(poolContract.address);
    const tokenBalance1 = await token1Contract.balanceOf(poolContract.address);

    // convert # amount of each tokens in the liquidity pool from ethers BigNumber to BigNumber.js
    const tokenBalance0BN = new BigNumber(tokenBalance0.toString());
    const tokenBalance1BN = new BigNumber(tokenBalance1.toString());
    const poolEthBalanceBN = new BigNumber(poolEthBalance.toString());

    // this returns the token prices in usd of each token (without accounting for decimals)
    let tokenPrices;
    try {
      tokenPrices = await getTokenPrices(token0Address, token1Address);
    } catch (error) {
      // if coingecko call fails
      console.log("coingecko error:", error)
      return findings;
    }

    // multiply the amount of tokens in the pool by usd value, adjusting for decimals
    let token0ValueUSD;
    let token1ValueUSD;
    let currentLiquidity;

    if (tokenBalance0BN.gt(0)) {
      token0ValueUSD = await getTokenUSDValue(
        tokenBalance0BN,
        tokenPrices.token0Price,
        token0Address,
        provider
      );
    }

    if (tokenBalance1BN.gt(0)) {
      token1ValueUSD = await getTokenUSDValue(
        tokenBalance1BN,
        tokenPrices.token1Price,
        token1Address,
        provider
      );
    }

    // calculate the total liquidity value of the pool at current block
    // @dev for sanity check, liquidity should be close to the one here for usdc/eth pool https://etherscan.io/address/0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8
    if (token0ValueUSD !== undefined && token1ValueUSD !== undefined) {
      counter === 0
        ? (previousLiquidity = token0ValueUSD.plus(token1ValueUSD))
        : (currentLiquidity = token0ValueUSD.plus(token1ValueUSD));
    } else if (token0ValueUSD !== undefined && poolEthBalanceBN.gt(0)) {
      counter === 0
        ? (previousLiquidity = token0ValueUSD.plus(poolEthBalanceBN))
        : (currentLiquidity = token0ValueUSD.plus(poolEthBalanceBN));
    } else if (token1ValueUSD !== undefined && poolEthBalanceBN.gt(0)) {
      counter === 0
        ? (previousLiquidity = token1ValueUSD.plus(poolEthBalanceBN))
        : (currentLiquidity = token1ValueUSD.plus(poolEthBalanceBN));
    }

    // increment counter to signal that the agent has already ran on a previous block before
    counter = 1;

    // return no findings the first time this agent is ran
    if (currentLiquidity === undefined) {
      return findings;
    }

    // create findings if currentLiquidity - prevLiquidity > 10%
    let percentChange = currentLiquidity
      .minus(previousLiquidity)
      .div(previousLiquidity)
      .times(100);
    percentChange = percentChange.absoluteValue();

    if (percentChange.gt(liquidityThresholdPercentChange)) {
      const finding = Finding.fromObject({
        name: "Uniswap V3 Large Change in Liquidity",
        description: `Large change in liquidity from pool ${poolContract.address}`,
        alertId: "AE-UNISWAPV3-LAREGE-LIQUIDITY-CHANGE",
        severity: FindingSeverity.Info,
        type: FindingType.Info,
        everestId,
        metadata: {
          address: poolContract.address,
          previousLiquidity: previousLiquidity.toString(),
          currentLiquidity: currentLiquidity.toString(),
          percentChange,
        },
      });
      findings.push(finding);
    }
    // set previous liquidity value so its accurate the next time this agent runs on the next block
    previousLiquidity = currentLiquidity;

    return findings;
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

// amountBN is the amount of tokens in the liquidity pool in BigNumber.js format
async function getTokenUSDValue(amountBN, tokenPrice, tokenAddress, provider) {
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

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
