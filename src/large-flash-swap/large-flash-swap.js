// example flash swap: 0x2099b13dd16b631f57b1e76df5ee36b3d22ca2665df2a30e6531f74e083c5db7
// example flash swap: 0x6b5c38dd208c7b1f30176743b789c8dde9ffb4cf4fb107b94445044199b326df
// example pool creation: 0xf1f0431ffc589a8f278aaf8ce8aa682dd099574529a0f2d8e53dc622ed8bbc51
const ethers = require('ethers');

const {
  Finding, FindingType, FindingSeverity,
} = require('forta-agent');

// load any agent configuration parameters
const config = require('../../agent-config.json');

const utils = require('../utils');
const common = require('../common');

const FLASH_SIGNATURE = 'Flash(address,address,uint256,uint256,uint256,uint256)';

// set up a variable to hold initialization data used in the handler
const initializeData = {};

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */

    data.everestId = config.UNISWAP_V3_EVEREST_ID;

    data.flashSwapThresholdUSDC = ethers.BigNumber.from(config.largeFlashSwap.thresholdUSDC);

    data.provider = common.provider;
    data.poolInformation = common.poolInformation;
    data.factoryContract = common.factoryContract;
    data.POOL_CREATED_SIGNATURE = common.POOL_CREATED_SIGNATURE;

    data.poolAbi = utils.getAbi('UniswapV3Pool');

    data.upToDate = false;

    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      poolAbi,
      provider,
      factoryContract,
      poolInformation,
      everestId,
      POOL_CREATED_SIGNATURE,
      flashSwapThresholdUSDC,
    } = data;

    if (!poolInformation) throw new Error('handleTransaction called before initialization');

    const findings = [];

    // check if any new pools were created
    const poolCreated = txEvent.filterEvent(
      POOL_CREATED_SIGNATURE,
      factoryContract.address,
    );
    if (poolCreated.length > 0) {
      poolCreated.forEach((poolCreatedEvent) => {
        const { data: eventData, topics } = poolCreatedEvent;
        const {
          args: {
            token0,
            token1,
            fee,
            tickSpacing,
            pool: newPoolAddress,
          },
        } = factoryContract.interface.parseLog({ data: eventData, topics });

        // add the pool information
        const finding = Finding.fromObject({
          name: 'Uniswap V3 New Pool Created',
          description: `New Pool created at ${newPoolAddress} for tokens: ${token0} - ${token1}`,
          alertId: 'AE-UNISWAPV3-NEW-POOL',
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          protocol: 'UniswapV3',
          everestId,
          metadata: {
            address: newPoolAddress,
            token0,
            token1,
            fee,
            tickSpacing,
          },
        });
        findings.push(finding);
      });
    }

    // check for flash swaps on any addresses
    // if there are any matches, check against the array of pool addresses
    const flashSwaps = txEvent.filterEvent(FLASH_SIGNATURE);

    if (flashSwaps.length > 0) {
      const flashSwapPromises = flashSwaps.map(async (flashSwapEvent) => {
        const { address, data: eventData, topics } = flashSwapEvent;

        if ((Object.keys(poolInformation)).indexOf(address) === -1) {
          return undefined;
        }

        const poolContract = new ethers.Contract(address, poolAbi, provider);
        const {
          args: {
            sender,
            amount0,
            amount1,
          },
        } = poolContract.interface.parseLog({ data: eventData, topics });

        const flashSwapInfo = {
          address,
          amount0,
          amount1,
          sender,
          token0EquivalentUSDC: ethers.BigNumber.from(0),
          token1EquivalentUSDC: ethers.BigNumber.from(0),
        };

        if (amount0.gt(0)) {
          const convert0Arrays = poolInformation[address].token0Conversion;
          if (convert0Arrays) {
            const conversion0Promises = convert0Arrays.map((arr) => arr[1](arr[0]));
            const results0 = await Promise.all(conversion0Promises);
            results0.unshift(amount0);
            const value0USDC = results0.reduce((product, value) => product.mul(value));
            flashSwapInfo.token0EquivalentUSDC = flashSwapInfo.token0EquivalentUSDC.add(value0USDC);
          }
        }

        if (amount1.gt(0)) {
          const convert1Arrays = poolInformation[address].token1Conversion;
          if (convert1Arrays) {
            const conversion1Promises = convert1Arrays.map((arr) => arr[1](arr[0]));
            const results1 = await Promise.all(conversion1Promises);
            results1.unshift(amount1);
            const value1USDC = results1.reduce((product, value) => product.mul(value));
            flashSwapInfo.token1EquivalentUSDC = flashSwapInfo.token1EquivalentUSDC.add(value1USDC);
          }
        }
        return flashSwapInfo;
      });

      let flashSwapResults = await Promise.all(flashSwapPromises);
      flashSwapResults = flashSwapResults.filter((result) => result !== undefined);

      flashSwapResults.forEach((result) => {
        const {
          address,
          amount0,
          amount1,
          sender,
          token0EquivalentUSDC,
          token1EquivalentUSDC,
        } = result;

        if (token0EquivalentUSDC.add(token1EquivalentUSDC).gt(flashSwapThresholdUSDC)) {
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
              token0EquivalentUSDC: token0EquivalentUSDC.toString(),
              token1EquivalentUSDC: token1EquivalentUSDC.toString(),
              flashSwapThresholdUSDC: flashSwapThresholdUSDC.toString(),
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
