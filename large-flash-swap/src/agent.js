// example flash swap: 0x8c97790e8a16b71968b7d194892966b86e3d898c7d166086d4d8831ed3fbaff3
// example flash swap: 0x1cd2db6d7da6459585c4af8e217ff65cf645aa40a75a381596615fd3e0e3f8ea
const BigNumber = require('bignumber.js');
const axios = require('axios');

const {
  Finding, FindingType, FindingSeverity, ethers, getEthersProvider,
} = require('forta-agent');

// load any agent configuration parameters
const config = require('../agent-config.json');

const utils = require('./utils');

const DECIMALS_ABI = ['function decimals() view returns (uint8)'];
const FLASH_SIGNATURE = 'event Flash(address indexed sender, address indexed recipient, '
+ 'uint256 amount0, uint256 amount1, uint256 paid0, uint256 paid1)';

// set up a variable to hold initialization data used in the handler
const initializeData = {};

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    data.everestId = config.EVEREST_ID;

    data.provider = getEthersProvider();

    data.factoryContract = utils.getContract('UniswapV3Factory', data.provider);

    data.flashSwapThresholdUSD = new BigNumber(config.largeFlashSwap.thresholdUSD);

    data.poolAbi = utils.getAbi('UniswapV3Pool.json');
    /* eslint-enable no-param-reassign */
  };
}

async function getTokenPrices(token0Address, token1Address) {
  const coingeckoApiUrl = 'https://api.coingecko.com/api/v3/simple/token_price/ethereum?';
  const addressQuery = `contract_addresses=${token0Address},${token1Address}`;
  const vsCurrency = '&vs_currencies=usd';

  const url = coingeckoApiUrl.concat(addressQuery.concat(vsCurrency));
  const { data } = await axios.get(url);

  // parse the response and convert the prices to BigNumber.js type
  const usdPerToken0 = new BigNumber(data[token0Address.toLowerCase()].usd);
  const usdPerToken1 = new BigNumber(data[token1Address.toLowerCase()].usd);

  return { token0Price: usdPerToken0, token1Price: usdPerToken1 };
}

async function getSwapTokenUSDValue(amountBN, tokenPrice, tokenAddress, provider) {
  // get the decimal scaling for this token
  const contract = new ethers.Contract(tokenAddress, DECIMALS_ABI, provider);
  let decimals;
  try {
    // calling .decimals() may fail for a vyper contract
    decimals = await contract.decimals();
  } catch {
    return undefined;
  }
  const denominator = (new BigNumber(10)).pow(decimals);

  // multiply by the price and divide out decimal places
  return amountBN.times(tokenPrice).div(denominator);
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      poolAbi,
      provider,
      factoryContract,
      everestId,
      flashSwapThresholdUSD,
    } = data;

    if (!factoryContract) throw new Error('handleTransaction called before initialization');

    const findings = [];

    // check for flash swaps on any addresses
    // if there are any matches, check against the array of pool addresses
    const flashSwaps = txEvent.filterLog(FLASH_SIGNATURE);

    if (flashSwaps.length > 0) {
      const flashSwapPromises = flashSwaps.map(async (flashSwapEvent) => {
        // parse the information from the flash swap
        const { address } = flashSwapEvent;
        const { sender, amount0, amount1 } = flashSwapEvent.args;

        // check the flash swap against the factory contract to verify that it belongs to
        // uniswap v3
        const poolContract = new ethers.Contract(address, poolAbi, provider);

        let token0;
        let token1;
        try {
          // get the tokens and fee that define the Uniswap V3 pool
          token0 = await poolContract.token0();
          token1 = await poolContract.token1();
          const fee = await poolContract.fee();

          // for the given tokens and fee, get the correlated pool address from the factory contract
          const expectedAddress = await factoryContract.getPool(token0, token1, fee);

          if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
            // if the contract addresses do not match, this is not a uniswap v3 pool
            return undefined;
          }
        } catch {
          // if an error was encountered calling contract methods
          // assume that this is not a Uniswap V3 Pool
          return undefined;
        }

        let tokenPrices;
        try{
          tokenPrices = await getTokenPrices(token0, token1);
        } catch {
          // coingecko call may fail
          return findings;
        }

        // convert from ethers.js bignumber to bignumber.js
        const amount0BN = new BigNumber(amount0.toHexString());
        const amount1BN = new BigNumber(amount1.toHexString());

        const flashSwapInfo = {
          address,
          amount0: amount0BN,
          amount1: amount1BN,
          sender,
          token0EquivalentUSD: new BigNumber(0),
          token1EquivalentUSD: new BigNumber(0),
        };

        if (amount0BN.gt(0)) {
          const token0Value = await getSwapTokenUSDValue(
            amount0BN,
            tokenPrices.token0Price,
            token0,
            provider,
          );
          if (token0Value !== undefined) {
            flashSwapInfo.token0EquivalentUSD = flashSwapInfo.token0EquivalentUSD.plus(token0Value);
          }
        }

        if (amount1BN.gt(0)) {
          const token1Value = await getSwapTokenUSDValue(
            amount1BN,
            tokenPrices.token1Price,
            token1,
            provider,
          );
          if (token1Value !== undefined) {
            flashSwapInfo.token1EquivalentUSD = flashSwapInfo.token1EquivalentUSD.plus(token1Value);
          }
        }

        return flashSwapInfo;
      });

      // settle the promises
      let flashSwapResults = await Promise.all(flashSwapPromises);

      // filter out undefined entries in the results
      flashSwapResults = flashSwapResults.filter((result) => result !== undefined);

      // check the flash swaps for any that exceeded the threshold value
      flashSwapResults.forEach((result) => {
        const {
          address,
          amount0,
          amount1,
          sender,
          token0EquivalentUSD,
          token1EquivalentUSD,
        } = result;

        if (token0EquivalentUSD.plus(token1EquivalentUSD).gt(flashSwapThresholdUSD)) {
          const finding = Finding.fromObject({
            name: 'Uniswap V3 Large Flash Swap',
            description: `Large Flash Swap from pool ${address}`,
            alertId: 'AE-UNISWAPV3-LARGE-FLASH-SWAP',
            severity: FindingSeverity.Info,
            type: FindingType.Info,
            protocol: 'UniswapV3',
            everestId,
            metadata: {
              address,
              token0Amount: amount0.toString(),
              token1Amount: amount1.toString(),
              sender,
              token0EquivalentUSD: token0EquivalentUSD.toString(),
              token1EquivalentUSD: token1EquivalentUSD.toString(),
              flashSwapThresholdUSD: flashSwapThresholdUSD.toString(),
            },
          });
          findings.push(finding);
        }
      });
    }

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
