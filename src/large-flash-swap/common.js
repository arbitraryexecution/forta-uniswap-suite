const ethers = require('ethers');

const { getJsonRpcUrl } = require('forta-agent');

const utils = require('../utils');

const config = require('../../agent-config.json');

const POOL_CREATED_SIGNATURE = 'PoolCreated(address,address,uint24,int24,address)';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

async function getPoolInformation(provider, factoryContract, fromBlock, toBlock, poolInformation) {
  // from the infura documentation, ref: https://infura.io/docs/ethereum/json-rpc/eth-getLogs
  //
  // LIMITATIONS
  // To prevent queries from consuming too many resources, eth_getLogs requests are currently
  // limited by two constraints:
  //  - A max of 10,000 results can be returned by a single query
  //  - Query duration must not exceed 10 seconds
  //  - If a query returns too many results or exceeds the max query duration, one of the
  //    following errors is returned:
  const filter = {
    address: factoryContract.address,
    fromBlock,
    toBlock,
    topics: [factoryContract.interface.getEventTopic(POOL_CREATED_SIGNATURE)],
  };
  const logs = await provider.getLogs(filter);

  // extract pool addresses and pool information
  const blockNumbers = [];
  logs.forEach((log) => {
    blockNumbers.push(log.blockNumber);

    const { args } = factoryContract.interface.parseLog(log);

    // destructure indexed topics by name for token addresses and fee
    const { token0, token1, fee } = args;

    // extract non-indexed topics
    const tickSpacing = args[3];
    const poolAddress = args[4];

    // eslint-disable-next-line no-param-reassign
    poolInformation[poolAddress.toLowerCase()] = {
      token0, token1, fee, tickSpacing,
    };
  });

  // return the last block that had a pool creation event
  return Math.max(blockNumbers);
}

async function getRatio(poolContract) {
  // token0Price = token1 / token0
  const { sqrtPriceX96 } = await poolContract.slot0();
  // ref: https://docs.uniswap.org/sdk/guides/fetching-prices#understanding-sqrtprice
  return sqrtPriceX96.pow(2).div(ethers.BigNumber.from(2).pow(192));
}

async function getReciprocalRatio(poolContract) {
  // token1Price = token0 / token1
  const ratio = await getRatio(poolContract);
  return (ethers.BigNumber.from(1)).div(ratio);
}

async function getUnity() {
  return ethers.BigNumber.from(1);
}

/* eslint-disable no-param-reassign */
// create a graph that allows conversion from various tokens to equivalent USDC, even when there are
// no pools directly containing the token(s) in question and USDC
function createConversionGraph(poolInformation) {
  // for each pool contract, store an array of pool addresses and callbacks necessary for converting
  // from each token into USDC
  let poolsWithoutUSDC = [];
  const tokenMapping = {};
  tokenMapping[USDC_ADDRESS] = {};
  (Object.keys(poolInformation)).forEach((poolAddress) => {
    const { token0, token1 } = poolInformation[poolAddress];
    // if token0 is USDC, amount0 is its value
    //  - token1 value is amount1 * getReciprocalRatio()
    // if token1 is USDC, amount1 is its value
    //  - token0 value is amount0 * getRatio()
    // if neither token is USDC, store the address and iterate again
    if (token0 === USDC_ADDRESS) {
      poolInformation[poolAddress].token0Conversion = [[poolAddress, getUnity]];
      poolInformation[poolAddress].token1Conversion = [[poolAddress, getReciprocalRatio]];
      tokenMapping[USDC_ADDRESS][token1] = [[poolAddress, getReciprocalRatio]];
    } else if (token1 === USDC_ADDRESS) {
      poolInformation[poolAddress].token0Conversion = [[poolAddress, getRatio]];
      poolInformation[poolAddress].token1Conversion = [[poolAddress, getUnity]];
      tokenMapping[USDC_ADDRESS][token0] = [[poolAddress, getRatio]];
    } else {
      poolsWithoutUSDC.push(poolAddress);
    }
  });

  // by this point, everything in tokenMapping is a ratio of the form: (USDC / token)
  // iterate over the pools that do not have USDC in them, building the graph back to USDC
  let addressesToRemove = [];
  let lastLength = 0;
  while (poolsWithoutUSDC.length > 0) {
    // if we have made no progress on mapping additional tokens, stop trying
    if (lastLength === poolsWithoutUSDC.length) {
      break;
    }

    lastLength = poolsWithoutUSDC.length;
    addressesToRemove = poolsWithoutUSDC.map((poolAddress) => {
      const { token0, token1 } = poolInformation[poolAddress];
      if ((Object.keys(tokenMapping[USDC_ADDRESS])).indexOf(token0) !== -1) {
        // token0 has a mapping back to USDC, now map token1 back to USDC
        poolInformation[poolAddress].token0Conversion = [
          [poolAddress, getUnity],
          ...tokenMapping[USDC_ADDRESS][token0],
        ];
        poolInformation[poolAddress].token1Conversion = [
          [poolAddress, getReciprocalRatio],
          ...tokenMapping[USDC_ADDRESS][token0],
        ];
        tokenMapping[USDC_ADDRESS][token1] = [
          [poolAddress, getReciprocalRatio],
          ...tokenMapping[USDC_ADDRESS][token0],
        ];
        return poolAddress;
      } if ((Object.keys(tokenMapping[USDC_ADDRESS])).indexOf(token1) !== -1) {
        // token1 has a mapping back to USDC, now map token0 back to USDC
        poolInformation[poolAddress].token0Conversion = [
          [poolAddress, getRatio],
          ...tokenMapping[USDC_ADDRESS][token1],
        ];
        poolInformation[poolAddress].token1Conversion = [
          [poolAddress, getRatio],
          ...tokenMapping[USDC_ADDRESS][token1],
        ];
        tokenMapping[USDC_ADDRESS][token0] = [
          [poolAddress, getRatio],
          ...tokenMapping[USDC_ADDRESS][token1],
        ];
        return poolAddress;
      }
      return undefined;
    });
    // eslint-disable-next-line no-loop-func
    poolsWithoutUSDC = poolsWithoutUSDC.filter((addr) => addressesToRemove.indexOf(addr) === -1);
    addressesToRemove = [];
  }
}
/* eslint-enable no-param-reassign */

module.exports = {
  getPoolInformation,
  createConversionGraph,
  POOL_CREATED_SIGNATURE,
};
