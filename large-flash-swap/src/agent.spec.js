const BigNumber = require('bignumber.js');

/* ethers mocking */
// uniswap v3 factory contract mock and pool mock
const mockToken0Address = '0xFAKETOKEN0ADDRESS'; // .token0()
const mockToken1Address = '0xFAKETOKEN1ADDRESS'; // .token1()
const mockFee = 0; // .fee()
const mockPoolAddress = '0xFAKEPOOLADDRESS';
const mockDecimals = 3;
const mockContract = {
  getPool: jest.fn().mockResolvedValue(mockPoolAddress),
  token0: jest.fn().mockResolvedValue(mockToken0Address),
  token1: jest.fn().mockResolvedValue(mockToken1Address),
  fee: jest.fn().mockResolvedValue(mockFee),
  decimals: jest.fn().mockResolvedValue(mockDecimals),
};

// combine the mocked provider and contracts into the ethers import mock
jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    providers: {
      JsonRpcBatchProvider: jest.fn(),
    },
    Contract: jest.fn().mockReturnValue(mockContract),
  },
}));
const {
  Finding, FindingType, FindingSeverity, ethers, TransactionEvent,
} = require('forta-agent');

/* axios mocking */
const mockCoinGeckoData = {};
const mockCoinGeckoResponse = {
  data: mockCoinGeckoData,
};
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue(mockCoinGeckoResponse),
}));
const axios = require('axios');

const utils = require('./utils');

mockContract.interface = new ethers.utils.Interface(utils.getAbi('UniswapV3Pool'));

const poolCreatedTopic = ethers.utils.id('PoolCreated(address,address,uint24,int24,address)');
const flashSwapTopic = ethers.utils.id('Flash(address,address,uint256,uint256,uint256,uint256)');

const { EVEREST_ID } = require('../agent-config.json');

/* handler import */
// import the handler code after the mocked modules have been defined
const { provideHandleTransaction, provideInitialize } = require('./agent');

/* axios mock test */
describe('mock axios GET requests', () => {
  it('should call axios.get and return the mocked response for CoinGecko', async () => {
    mockCoinGeckoResponse.data = { '0xtokenaddress': { usd: 1000 } };
    const response = await axios.get('https://url.url');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(response.data['0xtokenaddress'].usd).toEqual(1000);

    // reset call count for next test
    axios.get.mockClear();
    expect(axios.get).toHaveBeenCalledTimes(0);
  });
});

/* handler tests */
describe('large flash swap monitoring', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let handleTransaction;

    // log with an event other than a FlashSwap event
    const logsNoMatchEvent = [{ topics: [poolCreatedTopic] }];

    // log that matches a FlashSwap event from a non-uniswap address
    const amount0 = 100;
    const amount0Hex64 = amount0.toString(16).padStart(64, '0');
    const hashZero = (ethers.constants.HashZero).slice(2);
    const logsMatchFlashSwapEventInvalidAddress = [{
      address: '0xINVALIDUNISWAPV3POOLADDRESS',
      topics: [
        flashSwapTopic,
        ethers.constants.HashZero,
        ethers.constants.HashZero,
      ],
      data: `0x${amount0Hex64}${hashZero}${hashZero}${hashZero}`,
    }];

    // log that matches a FlashSwap event from a uniswap v3 pool address
    const logsMatchFlashSwapEventAddressMatch = [{
      address: '0xFAKEPOOLADDRESS',
      topics: [
        flashSwapTopic,
        ethers.constants.HashZero,
        ethers.constants.HashZero,
      ],
      data: `0x${amount0Hex64}${hashZero}${hashZero}${hashZero}`,
    }];

    beforeEach(async () => {
      initializeData = {};

      // initialize the handler
      // this will create the mock provider and mock factory contract
      await (provideInitialize(initializeData))();

      handleTransaction = provideHandleTransaction(initializeData);
    });

    it('returns empty findings if no flash swaps occurred', async () => {
      const receipt = {
        logs: logsNoMatchEvent,
      };
      const txEvent = new TransactionEvent(null, null, null, receipt, [], [], null);

      const findings = await handleTransaction(txEvent);

      expect(findings).toStrictEqual([]);
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(mockContract.token0).toHaveBeenCalledTimes(0);
    });

    it('returns empty findings a FlashSwap event occurred for a non-Uniswap V3 pool ', async () => {
      const receipt = {
        logs: logsMatchFlashSwapEventInvalidAddress,
      };
      const txEvent = new TransactionEvent(null, null, null, receipt, [], [], null);

      const findings = await handleTransaction(txEvent);

      expect(findings).toStrictEqual([]);
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(mockContract.token0).toHaveBeenCalledTimes(1);
      expect(mockContract.token1).toHaveBeenCalledTimes(1);
      expect(mockContract.fee).toHaveBeenCalledTimes(1);
      mockContract.token0.mockClear();
      mockContract.token1.mockClear();
      mockContract.fee.mockClear();
    });

    it('returns empty findings for a FlashSwap event lower than the threshold', async () => {
      const receipt = {
        logs: logsMatchFlashSwapEventAddressMatch,
      };
      const txEvent = new TransactionEvent(null, null, null, receipt, [], [], null);

      // set up the mocked response from axios to return the price of the token
      // intentionally set the price low enough that the threshold is not exceeded
      const threshold = initializeData.flashSwapThresholdUSD;

      const decimalScaling = (new BigNumber(10)).pow(mockDecimals);
      const amount0Scaled = (new BigNumber(amount0)).div(decimalScaling);
      const usdPricePerToken = threshold.minus(1).div(amount0Scaled);
      const usdPricePerTokenNum = parseInt(usdPricePerToken.toString(), 10);

      // set up the coin gecko response to return a value that will not cause a finding
      mockCoinGeckoResponse.data = {};
      mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()] = { usd: usdPricePerTokenNum };
      mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()] = { usd: usdPricePerTokenNum };

      // this will determine that the FlashSwap included an amount of 256 tokens of token0
      const findings = await handleTransaction(txEvent);

      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(findings).toStrictEqual([]);
      axios.get.mockClear();
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(mockContract.token0).toHaveBeenCalledTimes(1);
      expect(mockContract.token1).toHaveBeenCalledTimes(1);
      expect(mockContract.fee).toHaveBeenCalledTimes(1);
      mockContract.token0.mockClear();
      mockContract.token1.mockClear();
      mockContract.fee.mockClear();
    });

    it('returns a finding for a FlashSwap event over the threshold', async () => {
      const receipt = {
        logs: logsMatchFlashSwapEventAddressMatch,
      };
      const txEvent = new TransactionEvent(null, null, null, receipt, [], [], null);

      // set up the mocked response from axios to return the price of the token
      // intentionally set the price just over the threshold for a finding
      const threshold = initializeData.flashSwapThresholdUSD;

      const decimalScaling = (new BigNumber(10)).pow(mockDecimals);
      const amount0Scaled = (new BigNumber(amount0)).div(decimalScaling);
      const usdPricePerToken = threshold.plus(1).div(amount0Scaled);
      const usdPricePerTokenNum = parseInt(usdPricePerToken.toString(), 10);

      // set up the coin gecko response to the appropriate price to cause a finding
      mockCoinGeckoResponse.data = {};
      mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()] = { usd: usdPricePerTokenNum };
      mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()] = { usd: usdPricePerTokenNum };

      // this will determine that the FlashSwap included an amount of 256 tokens of token0
      const findings = await handleTransaction(txEvent);

      const expectedFindings = [
        Finding.fromObject({
          name: 'Uniswap V3 Large Flash Swap',
          description: `Large Flash Swap from pool ${mockPoolAddress}`,
          alertId: 'AE-UNISWAPV3-LARGE-FLASH-SWAP',
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          protocol: 'UniswapV3',
          everestId: EVEREST_ID,
          metadata: {
            address: mockPoolAddress,
            token0Amount: amount0.toString(),
            token1Amount: '0',
            sender: ethers.constants.AddressZero,
            token0EquivalentUSD: (threshold.plus(1)).toString(),
            token1EquivalentUSD: '0',
            flashSwapThresholdUSD: (threshold.toString()),
          },
        }),
      ];

      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(findings).toStrictEqual(expectedFindings);
      axios.get.mockClear();
      expect(axios.get).toHaveBeenCalledTimes(0);
    });
  });
});
