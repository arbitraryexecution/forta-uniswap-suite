const {
  Finding, FindingType, FindingSeverity, createBlockEvent,
} = require('forta-agent');

/* common.js module mocking */
jest.mock('../common', () => ({
  ...jest.requireActual('ethers'),
  getPoolInformation: jest.fn().mockResolvedValue(),
  latestBlockPromise: jest.fn().mockResolvedValue(),
}));

/* ethers mocking */
// create mock provider for ethers
let mockBlockNumber = 0;
const mockJsonRpcProvider = {
  getBlockNumber: jest.fn().mockResolvedValue(mockBlockNumber),
};

const mockContract = {};
// combine the mocked provider and contract into the ethers import mock
jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  providers: {
    JsonRpcProvider: jest.fn().mockReturnValue(mockJsonRpcProvider),
  },
  Contract: jest.fn().mockReturnValue(mockContract),
}));
const ethers = require('ethers');

/* axios mocking */
// mock response from Alpha Homora V2 API
const mockAlphaHomoraV2Response = {
  data: [],
};

// mock response from CoinGecko API
const mockCoinGeckoResponse = {
  data: {},
};

// mock the axios module for Alpha Homora V2 API and CoinGecko API calls
const axios = require('axios');

jest.mock('axios');
axios.get = jest.fn(async (httpAddress) => {
  if (httpAddress.includes('homora-api')) {
    return mockAlphaHomoraV2Response;
  }
  if (httpAddress.includes('coingecko')) {
    return mockCoinGeckoResponse;
  }
  throw new Error('Unexpected HTTP URL passed to mocked function');
});

/* handler import */
// import the handler code after the mocked modules have been defined
const { provideHandleBlock, provideInitialize } = require('./tvl-liquidity');

/* mock tests */
describe('mock axios GET requests', () => {
  it('should call axios.get and return the mocked response for CoinGecko', async () => {
    mockCoinGeckoResponse.data.ethereum = { eth: 1, usd: 1000000 };
    const response = await axios.get('https://urlcontaining.coingecko.init');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(response.data.ethereum.eth).toEqual(1);
    expect(response.data.ethereum.usd).toEqual(1000000);

    // reset call count for next test
    axios.get.mockClear();
    expect(axios.get).toHaveBeenCalledTimes(0);
  });

  it('should call axios.get and return the mocked response for Alpha Homora V2', async () => {
    mockAlphaHomoraV2Response.data = [
      { name: 'first', exchange: {} },
      { name: 'second', exchange: {} },
    ];
    const response = await axios.get('https://urlcontaining.homora-api.init');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(response.data[0].name).toEqual('first');
    expect(response.data[1].name).toEqual('second');

    // reset call count for next test
    axios.get.mockClear();
    expect(axios.get).toHaveBeenCalledTimes(0);
  });
});

// helper function for constructing mock pool data
function getPool(key, name, wTokenType, wTokenAddress, lpTokenAddress, pid) {
  return {
    key, name, wTokenType, wTokenAddress, lpTokenAddress, pid,
  };
}

/* handler tests */
describe('total value locked monitoring', () => {
  describe('handleBlock', () => {
    let initializeData;
    let handleBlock;
    const mockLpTokenAddress0 = '0xLPTOKENADDRESS0';
    const mockLpTokenAddress1 = '0xLPTOKENADDRESS1';

    const decimals18 = ethers.BigNumber.from(10).pow(18);

    // NOTE:
    // balance of 1, LP token ether price 0 (2**112)*(10**18) and usd/ether of 1000
    // should result in a TVL calculation of $1,000,000 USD
    const mockWTokenBalance0 = ethers.BigNumber.from(1);
    const mockWTokenBalance1 = ethers.BigNumber.from(1);
    let mockLpTokenEthPrice0 = ethers.BigNumber.from(2).pow(112).mul(decimals18);
    let mockLpTokenEthPrice1 = ethers.BigNumber.from(2).pow(112).mul(20000000000000);
    let pool0;
    let pool1;

    beforeEach(async () => {
      initializeData = {};

      // mock the Coin Gecko response
      mockCoinGeckoResponse.data.ethereum = { eth: 1, usd: 1000 };

      pool0 = getPool('key0', 'name0', 'WERC20', '0xWTOKEN0ADDRESS', mockLpTokenAddress0, 0);
      pool1 = getPool('key1', 'name1', 'WMasterChef', '0xWTOKEN1ADDRESS', mockLpTokenAddress1, 1);
      pool1.exchange = {
        stakingAddress: '0xSTAKING1ADDRESS',
      };
      // mock the Alpha Homora V2 API pool response
      mockAlphaHomoraV2Response.data = [pool0, pool1];

      // only expect this to be called for the mocked WERC20 wTokenType
      mockContract.balanceOf = jest.fn(async () => mockWTokenBalance0);

      // only expect this to be called for the mocked WMasterChef wTokenType
      mockContract.userInfo = jest.fn(async () => [mockWTokenBalance1, undefined]);

      // this will be called for both mocked pools
      mockContract.decimals = jest.fn(async () => 18);

      // this will be called for both mocked pools
      mockContract.getSafeETHPx = jest.fn(async (lpTokenAddress) => {
        if (lpTokenAddress === mockLpTokenAddress0) {
          return [mockLpTokenEthPrice0];
        }
        if (lpTokenAddress === mockLpTokenAddress1) {
          return [mockLpTokenEthPrice1];
        }
        throw new Error('Unexpected lpTokenAddress passed to mocked function');
      });

      // initialize the handler
      await (provideInitialize(initializeData))();
      handleBlock = provideHandleBlock(initializeData);
    });

    it('returns empty findings if not enough blocks have been seen', async () => {
      // get the minimum number of blocks necessary to create a finding
      const { minElements } = initializeData.config;

      // generate blocks until we are at 2 fewer than the minimum
      let mockBlockEvent;
      let findings;
      mockBlockNumber = 1;
      while (mockBlockNumber < (minElements - 2)) {
        mockBlockEvent = createBlockEvent({ block: { mockBlockNumber } });
        // eslint-disable-next-line no-await-in-loop
        findings = await handleBlock(mockBlockEvent);
        expect(findings).toStrictEqual([]);
        mockBlockNumber++;
      }

      // now generate one block with a vastly different value for the different fields
      // the math should meet the criteria for generating a finding
      // but because enough blocks have not been received, no finding should be generated
      mockLpTokenEthPrice0 = mockLpTokenEthPrice0.mul(1000);
      mockLpTokenEthPrice1 = mockLpTokenEthPrice1.mul(1000);

      mockBlockEvent = createBlockEvent({ block: { mockBlockNumber } });
      findings = await handleBlock(mockBlockEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if threshold is not exceeded', async () => {
      // get the minimum number of blocks necessary to create a finding
      const { minElements } = initializeData.config;

      // generate blocks until we are over the minimum number
      // this will continue to use the default values of the token prices and amounts
      let mockBlockEvent;
      let findings;
      mockBlockNumber = 1;
      while (mockBlockNumber < (minElements + 2)) {
        mockBlockEvent = createBlockEvent({ block: { mockBlockNumber } });
        // eslint-disable-next-line no-await-in-loop
        findings = await handleBlock(mockBlockEvent);
        expect(findings).toStrictEqual([]);
        mockBlockNumber++;
      }

      // ensure that the number of blocks is greater than the minimum required for alerts
      const dataset0 = initializeData.rollingLiquidityData[mockLpTokenAddress0].tvl;
      expect(dataset0.getNumElements()).toBeGreaterThan(minElements);

      const dataset1 = initializeData.rollingLiquidityData[mockLpTokenAddress1].tvl;
      expect(dataset1.getNumElements()).toBeGreaterThan(minElements);
    });

    it('returns findings if threshold is exceeded and enough blocks have been seen', async () => {
      // get the minimum number of blocks necessary to create a finding
      const { minElements } = initializeData.config;

      // generate blocks until we are at 1 fewer than the number required for triggering an alert
      let mockBlockEvent;
      let findings;
      mockBlockNumber = 1;
      while (mockBlockNumber < minElements + 1) {
        mockBlockEvent = createBlockEvent({ block: { mockBlockNumber } });
        // eslint-disable-next-line no-await-in-loop
        findings = await handleBlock(mockBlockEvent);
        expect(findings).toStrictEqual([]);
        mockBlockNumber++;
      }

      // now generate one block with a vastly different value for the different fields
      // the math should meet the criteria for generating a finding
      // enough blocks have been seen that an alert should be generated
      mockLpTokenEthPrice0 = mockLpTokenEthPrice0.mul(10);
      mockBlockEvent = createBlockEvent({ block: { mockBlockNumber } });
      findings = await handleBlock(mockBlockEvent);

      // ensure that the number of blocks is greater than the minimum required for alerts
      const dataset = initializeData.rollingLiquidityData[mockLpTokenAddress0].tvl;
      expect(dataset.getNumElements()).toBeGreaterThan(minElements);

      // create the finding we expect
      // the price for all previous blocks was $1M USD
      // the price for this block is $10M USD
      // therefore, we expect the delta over the threshold to be $10M - $1M = $9M USD
      const expectedFinding = Finding.fromObject({
        name: 'Alpha Finance TVL Agent',
        description: `Alpha-Homora V2 pool ${pool0.name} has a large change in TVL`,
        alertId: 'AE-ALPHAFI-TVL-LIQUIDITY-EVENT',
        type: FindingType.Degraded,
        severity: FindingSeverity.Low,
        everestId: initializeData.everestId,
        protocol: 'Alpha Finance',
        metadata: {
          key: pool0.key,
          lpTokenAddress: pool0.lpTokenAddress,
          wTokenAddress: pool0.wTokenAddress,
          wTokenType: pool0.wTokenType,
          threshold: '0',
          deltaOverThreshold: '9000000',
        },
      });

      // assert the finding
      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
