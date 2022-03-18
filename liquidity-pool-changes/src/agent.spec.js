const BigNumber = require('bignumber.js');

// pool mocking
const mockToken0Address = '0xFAKETOKEN0ADDRESS'; // .token0()
const mockToken1Address = '0xFAKETOKEN1ADDRESS'; // .token1()
const mockPoolAddress = '0xFAKEPOOLADDRESS'; // .address
const mockDecimals = 3;

const mockPoolContract = {
  // balanceOf gets mocked within each test case for modularity
  token0: jest.fn().mockResolvedValue(mockToken0Address),
  token1: jest.fn().mockResolvedValue(mockToken1Address),
  decimals: jest.fn().mockResolvedValue(mockDecimals),
  address: mockPoolAddress,
};

// combine the mocked provider and contracts into the ethers import mock
jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: jest.fn().mockReturnValue(mockPoolContract),
  },
}));

const { FindingType, FindingSeverity, Finding } = require('forta-agent');

// axios mocking
const mockCoinGeckoData = {};
const mockCoinGeckoResponse = {
  data: mockCoinGeckoData,
};

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue(mockCoinGeckoResponse),
}));

const axios = require('axios');

const { provideHandleBlock, provideInitialize } = require('./agent');

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
      const mockToken0Amount = new BigNumber(10);
      const mockToken1Amount = new BigNumber(5);
      const mockToken0Amount2 = new BigNumber(10);
      const mockToken1Amount2 = new BigNumber(5);

      // used to scale response
      const decimalScaling = (new BigNumber(10)).pow(mockDecimals);

      // mock coin gecko response data
      mockCoinGeckoResponse.data = {};
      mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()] = { usd: new BigNumber(1) };
      mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()] = {
        usd: new BigNumber(2),
      };

      // set threshold percent so it doesn't rely on the config file
      initializeData.liquidityThresholdPercentChange = new BigNumber(10);

      // set token amounts so that it doesn't trigger a liquiidty threshold change
      mockPoolContract.balanceOf = jest
        .fn()
        .mockResolvedValueOnce(mockToken0Amount)
        .mockResolvedValueOnce(mockToken1Amount)
        .mockResolvedValueOnce(mockToken0Amount2)
        .mockResolvedValueOnce(mockToken1Amount2);

      // run handleBlock() to set previous liquidity value for the first time. Should be no findings
      const findings0 = await handleBlock();
      expect(findings0).toStrictEqual([]);

      // make sure that the liquidity was calculated correctly
      const prevLiquidity = initializeData.previousLiquidity;
      const prevLiquidityScaled = prevLiquidity.times(decimalScaling);

      const token0Usd = mockToken0Amount
        .times(mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()].usd);
      const token1Usd = mockToken1Amount
        .times(mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()].usd);

      const expectedPrevLiquidity = token0Usd.plus(token1Usd);
      expect(prevLiquidityScaled).toEqual(expectedPrevLiquidity);

      // run again
      // should be no findings because liquidity has not changed above min threshold
      const findings = await handleBlock();
      expect(findings).toStrictEqual([]);

      // make sure that the liquidity was calculated correctly
      const currentLiquidity = initializeData.previousLiquidity;
      const currentLiquidityScaled = currentLiquidity.times(decimalScaling);

      const token0Usd2 = mockToken0Amount2
        .times(mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()].usd);
      const token1Usd2 = mockToken1Amount2
        .times(mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()].usd);

      const expectedCurerentLiquidity = token0Usd2.plus(token1Usd2);
      expect(currentLiquidityScaled).toEqual(expectedCurerentLiquidity);

      expect(mockPoolContract.token0).toHaveBeenCalledTimes(2);
      expect(mockPoolContract.token1).toHaveBeenCalledTimes(2);
      expect(mockPoolContract.balanceOf).toHaveBeenCalledTimes(4);
      expect(axios.get).toHaveBeenCalledTimes(2);

      axios.get.mockClear();
      mockPoolContract.token0.mockClear();
      mockPoolContract.token1.mockClear();
      mockPoolContract.balanceOf.mockClear();
    });

    it('returns a finding if liquidity change is above the given threshold', async () => {
      const mockToken0Amount = new BigNumber(10);
      const mockToken1Amount = new BigNumber(5);
      const mockToken0Amount2 = new BigNumber(20);
      const mockToken1Amount2 = new BigNumber(10);

      // scale response
      const decimalScaling = (new BigNumber(10)).pow(mockDecimals);

      // mock coin gecko response data
      mockCoinGeckoResponse.data = {};
      mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()] = { usd: new BigNumber(1) };
      mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()] = {
        usd: new BigNumber(2),
      };

      // set threshold percent so it doesn't rely on the config file
      initializeData.liquidityThresholdPercentChange = new BigNumber(10);

      // set token amounts so that is does trigger a liquidity threshold change
      mockPoolContract.balanceOf = jest
        .fn()
        .mockResolvedValueOnce(mockToken0Amount)
        .mockResolvedValueOnce(mockToken1Amount)
        .mockResolvedValueOnce(mockToken0Amount2)
        .mockResolvedValueOnce(mockToken1Amount2);

      // run handleBlock() to set previous liquidity value for the first time. Should be no findings
      const findings0 = await handleBlock();
      expect(findings0).toStrictEqual([]);

      // make sure that liquidity was calculated correctly
      const prevLiquidity = initializeData.previousLiquidity;
      const prevLiquidityScaled = prevLiquidity.times(decimalScaling);

      const token0Usd = mockToken0Amount
        .times(mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()].usd);
      const token1Usd = mockToken1Amount
        .times(mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()].usd);

      const expectedPrevLiquidity = token0Usd.plus(token1Usd);
      expect(prevLiquidityScaled).toEqual(expectedPrevLiquidity);

      // run again
      // agent should pick up on finding because liquidity changed above min threshold
      const findings = await handleBlock();

      // make sure that liquidity was calculated correctly
      const currentLiquidity = initializeData.previousLiquidity;
      const currentLiquidityScaled = currentLiquidity.times(decimalScaling);

      const token0Usd2 = mockToken0Amount2
        .times(mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()].usd);
      const token1Usd2 = mockToken1Amount2
        .times(mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()].usd);

      const expectedCurrentLiquidity = token0Usd2.plus(token1Usd2);
      expect(currentLiquidityScaled).toEqual(expectedCurrentLiquidity);

      let percentChange = currentLiquidity
        .minus(prevLiquidity)
        .div(prevLiquidity)
        .times(100);
      percentChange = percentChange.absoluteValue();

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
