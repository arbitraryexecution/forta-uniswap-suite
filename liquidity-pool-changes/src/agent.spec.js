const BigNumber = require("bignumber.js");

// pool mocking
const mockToken0Address = "0xFAKETOKEN0ADDRESS"; // .token0()
const mockToken1Address = "0xFAKETOKEN1ADDRESS"; // .token1()
const mockPoolAddress = "0xFAKEPOOLADDRESS"; // .address
const mockToken0Amount = 10; // token0.balanceOf()
const mockToken1Amount = 20; // token1.balanceOf()
const mockPoolBalance = 2;
const mockDecimals = 0;

const mockPoolContract = {
  token0: jest.fn().mockResolvedValue(mockToken0Address),
  token1: jest.fn().mockResolvedValue(mockToken1Address),
  balanceOf: jest
    .fn()
    .mockReturnValueOnce(mockToken0Amount)
    .mockReturnValueOnce(mockToken1Amount),
  decimals: jest.fn().mockResolvedValue(mockDecimals),
};

// combine the mocked provider and contracts into the ethers import mock
jest.mock("forta-agent", () => ({
  ...jest.requireActual("forta-agent"),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual("ethers"),
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
  createBlockEvent,
  BlockEvent,
} = require("forta-agent");

// axios mocking
const mockCoinGeckoData = {};
const mockCoinGeckoResponse = {
  data: mockCoinGeckoData,
};

jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue(mockCoinGeckoResponse),
}));

const axios = require("axios");

const utils = require("./utils");

const config = require("../agent-config.json");

const { provideHandleBlock, provideInitialize } = require("./agent");

// axios mock test
describe("mock axios GET requests", () => {
  it("should call axios.get and return the mocked response for CoinGecko", async () => {
    mockCoinGeckoResponse.data = { "0xtokenaddress": { usd: 1000 } };
    const response = await axios.get("https://url.url");
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(response.data["0xtokenaddress"].usd).toEqual(1000);

    // reset call count for next test
    axios.get.mockClear();
    expect(axios.get).toHaveBeenCalledTimes(0);
  });
});

// handler tests
describe("large liquidity pool change agent", () => {
  describe("handleBlock", () => {
    let initializeData;
    let handleBlock;

    // create a block event that changes liquiidty

    beforeEach(async () => {
      initializeData = {};

      await provideInitialize(initializeData)();

      handleBlock = provideHandleBlock(initializeData);
      initializeData.provider = {
        getBalance: jest.fn().mockResolvedValue(mockPoolBalance),
      }; // mock provider
    });

    it("returns empty findings if liquidity change is below given threshold", async () => {
      // mock a block event that doesn't produce a 10% change in liquidity
      // mockCoinGeckoResponse.data = {};
      // mockCoinGeckoResponse.data[mockToken0Address.toLowerCase()] = { usd: usdPricePerTokenNum };
      // mockCoinGeckoResponse.data[mockToken1Address.toLowerCase()] = { usd: usdPricePerTokenNum };

      const findings = await handleBlock();

      expect(findings).toStrictEqual([]);
      expect(mockPoolContract.token0).toHaveBeenCalledTimes(1);
      expect(mockPoolContract.token1).toHaveBeenCalledTimes(1);
      expect(mockPoolContract.balanceOf).toHaveBeenCalledTimes(2);
      expect(initializeData.provider.getBalance).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledTimes(1)

      mockPoolContract.token0.mockClear();
      mockPoolContract.token1.mockClear();
      mockPoolContract.balanceOf.mockClear();
      initializeData.provider.getBalance.mockClear();
    });

    it("returns a finding if liquidity change in above the given threshold", async () => {
      // mock a block event that produces a change in liquidity over 10%
    });
  });
});
