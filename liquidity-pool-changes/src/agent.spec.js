const BigNumber = require('bignumber.js');

// pool mocking
const mockToken0Address = '0xFAKETOKEN0ADDRESS'; // .token0()
const mockToken1Address = '0xFAKETOKEN1ADDRESS'; // .token1()
const mockPoolAddress = '0xFAKEPOOLADDRESS'; // .address
const mockToken0Amount = 10000; // token0.balanceOf()
const mockToken1Amount = 5; // token1.balanceOf()
const mockToken0Amount2 = 20000; // token0.balanceOf() to produce a large liquidity change
const mockToken1Amount2 = 10; // token1.balanceOf() to produce a large liquidity change
const mockPoolBalance = 2;
const mockDecimals = 3;

const mockPoolContract = {
  token0: jest.fn().mockResolvedValue(mockToken0Address),
  token1: jest.fn().mockResolvedValue(mockToken1Address),
  balanceOf: jest
    .fn()
    // failure test cases
    .mockReturnValueOnce(mockToken0Amount)
    .mockReturnValueOnce(mockToken1Amount)
    // success test cases
    .mockReturnValueOnce(mockToken0Amount)
    .mockReturnValueOnce(mockToken1Amount)
    .mockReturnValueOnce(mockToken0Amount2)
    .mockReturnValueOnce(mockToken1Amount2),
  decimals: jest.fn().mockResolvedValue(mockDecimals),
  address: mockPoolAddress,
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
    Contract: jest.fn().mockReturnValue(mockPoolContract),
  },
}));

const {
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

// axios mocking
const mockCoinGeckoData = {};
const mockCoinGeckoResponse = {
  data: mockCoinGeckoData,
};

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue(mockCoinGeckoResponse),
}));

const axios = require('axios');

const {
  provideHandleBlock,
  provideInitialize,
} = require('./agent');

// axios mock test
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

// handler tests
describe('large liquidity pool change agent', () => {
  describe('handleBlock', () => {
    let initializeData;
    let handleBlock;

    beforeEach(async () => {
      initializeData = {};

      await provideInitialize(initializeData)();

      handleBlock = provideHandleBlock(initializeData);
    });

    it('returns empty findings if liquidity change is below given threshold', async () => {
      // mock coin gecko response data
      mockCoinGeckoResponse.data = {};
      mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()] = { usd: 1 };
      mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()] = {
        usd: 2000,
      };

      initializeData.liquidityThresholdPercentChange = new BigNumber(10);

      const findings = await handleBlock();

      expect(findings).toStrictEqual([]);
      expect(mockPoolContract.token0).toHaveBeenCalledTimes(1);
      expect(mockPoolContract.token1).toHaveBeenCalledTimes(1);
      expect(mockPoolContract.balanceOf).toHaveBeenCalledTimes(2);
      expect(axios.get).toHaveBeenCalledTimes(1);

      axios.get.mockClear();
      mockPoolContract.token0.mockClear();
      mockPoolContract.token1.mockClear();
      mockPoolContract.balanceOf.mockClear();
    });

    it('returns a finding if liquidity change is above the given threshold', async () => {
      // mock coin gecko response data
      mockCoinGeckoResponse.data = {};
      mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()] = { usd: 1 };
      mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()] = {
        usd: 2000,
      };

      // set threshold percent so it doesn't rely on the config file
      initializeData.liquidityThresholdPercentChange = new BigNumber(10);

      // run handleBlock() to set previous liquidity value for the first time. Should be no findings
      const findings0 = await handleBlock();
      expect(findings0).toStrictEqual([]);

      const prevLiquidity = initializeData.previousLiquidity;

      // run again and the agent should pick up on the changes of liquidity
      const findings = await handleBlock();

      const currentLiquidity = initializeData.previousLiquidity;

      const percentChange = ((currentLiquidity - prevLiquidity) / prevLiquidity) * 100;

      const expectedFindings = [
        Finding.fromObject({
          name: 'Uniswap V3 Large Change in Liquidity',
          description: `Large change in liquidity from pool ${mockPoolAddress}`,
          alertId: 'AE-UNISWAPV3-LARGE-LIQUIDITY-CHANGE',
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          metadata: {
            address: mockPoolAddress,
            previousLiquidity: prevLiquidity.toString(),
            currentLiquidity: currentLiquidity.toString(),
            percentChange: percentChange.toString(),
          },
        }),
      ];

      expect(findings).toStrictEqual(expectedFindings);
      expect(mockPoolContract.token0).toHaveBeenCalledTimes(2);
      expect(mockPoolContract.token1).toHaveBeenCalledTimes(2);
      expect(mockPoolContract.balanceOf).toHaveBeenCalledTimes(4);
      expect(axios.get).toHaveBeenCalledTimes(2);

      mockPoolContract.token0.mockClear();
      mockPoolContract.token1.mockClear();
      mockPoolContract.balanceOf.mockClear();
    });
  });
});
