const BigNumber = require('bignumber.js');
const axios = require('axios');

const {
  Finding,
  FindingSeverity,
  FindingType,
  ethers,
  getEthersProvider,
} = require('forta-agent');

// load agent configurations
const config = require('../agent-config.json');

const utils = require('./utils');

// used to store initialization data once you pass it into the provideHandleBlock() function
const initializeData = {};

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // setup ethers.js provider to interact with contracts
    data.provider = getEthersProvider();

    // get abi
    data.erc20Abi = utils.getAbi('ERC20.json');

    // get liquidityThresholdPercentChange
    data.liquidityThresholdPercentChange = new BigNumber(
      config.liquidityThresholdPercentChange,
    );

    // initalize previousLiquidity to undefined
    data.previousLiquidity = undefined;
    /* eslint-disable no-param-reassign */
  };
}

async function getTokenPrices(token0Address, token1Address) {
  const coingeckoApiUrl = 'https://api.coingecko.com/api/v3/simple/token_price/ethereum?';
  const addressQuery = `contract_addresses=${token0Address},${token1Address}`;
  const vsCurrency = '&vs_currencies=usd';

  const url = coingeckoApiUrl + addressQuery + vsCurrency;
  const { data } = await axios.get(url);

  // parse response to convert to BigNumber.js
  const usdPerToken0 = new BigNumber(data[token0Address.toLowerCase()].usd);
  const usdPerToken1 = new BigNumber(data[token1Address.toLowerCase()].usd);

  return { token0Price: usdPerToken0, token1Price: usdPerToken1 };
}

// amountBN is the amount of tokens in the liquidity pool in BigNumber.js format
async function getTokenUSDValue(amountBN, tokenPrice, tokenContract) {
  // get the decimal scaling for this token
  let decimals;
  try {
    decimals = await tokenContract.decimals();
  } catch {
    return undefined;
  }
  decimals = new BigNumber(decimals.toString()); // convert from ether.js BigNumber to BigNumber.js
  const denominator = new BigNumber(10).pow(decimals);

  // multiply by the price and divide out decimal places
  return amountBN.times(tokenPrice).div(denominator);
}

function provideHandleBlock(data) {
  return async function handleBlock() {
    const { erc20Abi, provider, liquidityThresholdPercentChange } = data;

    // make sure that data is initialized first
    if (!liquidityThresholdPercentChange) throw new Error('handleBlock called before initialization');

    const findings = [];

    const poolContract = utils.getContract('Usdc/Eth', provider);

    let token0Address;
    let token1Address;
    try {
      token0Address = await poolContract.token0();
      token1Address = await poolContract.token1();
    } catch {
      // asume its not a Uniswap V3 pool if contract calls fail
      return [];
    }

    const token0Contract = new ethers.Contract(
      token0Address,
      erc20Abi,
      provider,
    );
    const token1Contract = new ethers.Contract(
      token1Address,
      erc20Abi,
      provider,
    );

    // get the # amount of each tokens in the liquidity pool
    const tokenBalance0 = await token0Contract.balanceOf(poolContract.address);
    const tokenBalance1 = await token1Contract.balanceOf(poolContract.address);

    // convert # amount of each tokens in the liquidity pool from ethers BigNumber to BigNumber.js
    const tokenBalance0BN = new BigNumber(tokenBalance0.toString());
    const tokenBalance1BN = new BigNumber(tokenBalance1.toString());

    // this returns the token prices in usd of each token (without accounting for decimals)
    let tokenPrices;
    try {
      tokenPrices = await getTokenPrices(token0Address, token1Address);
    } catch (error) {
      // if coingecko call fails
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
        token0Contract,
      );
    }

    if (tokenBalance1BN.gt(0)) {
      token1ValueUSD = await getTokenUSDValue(
        tokenBalance1BN,
        tokenPrices.token1Price,
        token1Contract,
      );
    }

    // calculate the total liquidity value of the pool at current block
    if (token0ValueUSD === undefined) {
      token0ValueUSD = new BigNumber(0);
    }

    if (token1ValueUSD === undefined) {
      token1ValueUSD = new BigNumber(0);
    }

    // eslint-disable-next-line prefer-const
    currentLiquidity = token0ValueUSD.plus(token1ValueUSD);

    // should only be true the first time this handler is ran
    if (data.previousLiquidity === undefined) {
      data.previousLiquidity = currentLiquidity;
      return findings;
    }

    // create findings if currentLiquidity - prevLiquidity > min threshold percentage
    let percentChange = currentLiquidity
      .minus(data.previousLiquidity)
      .div(data.previousLiquidity)
      .times(100);
    percentChange = percentChange.absoluteValue();

    if (percentChange.gt(liquidityThresholdPercentChange)) {
      const finding = Finding.fromObject({
        name: 'Uniswap V3 Large Change in Liquidity',
        description: `Large change in liquidity from pool ${poolContract.address}`,
        alertId: 'AE-UNISWAPV3-LARGE-LIQUIDITY-CHANGE',
        severity: FindingSeverity.Info,
        type: FindingType.Info,
        metadata: {
          address: poolContract.address,
          previousLiquidity: data.previousLiquidity.toString(),
          currentLiquidity: currentLiquidity.toString(),
          percentChange: percentChange.toString(),
        },
      });
      findings.push(finding);
    }
    // set previous liquidity value so its accurate the next time this agent runs on the next block
    data.previousLiquidity = currentLiquidity;

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
