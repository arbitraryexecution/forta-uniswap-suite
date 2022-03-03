const BigNumber = require("bignumber.js");

// pool mocking
const mockToken0Address = "0xFAKETOKEN0ADDRESS"; // .token0()
const mockToken1Address = "0xFAKETOKEN1ADDRESS"; // .token1()
const mockPoolAddress = "0xFAKEPOOLADDRESS";
const mockDecimals = 3;
const mockContract = {
  getPool: jest.fn().mockResolvedValue(mockPoolAddress),
  token0: jest.fn().mockResolvedValue(mockToken0Address),
  token1: jest.fn().mockResolvedValue(mockToken1Address),
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
    Contract: jest.fn().mockReturnValue(mockContract),
  },
}));

const {
  FindingType,
  FindingSeverity,
  Finding,
  createBlockEvent,
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
    });
    it("returns empty findings if liquidity change is below threshold", async () => {
      // mock a block event that doesn't produce a 10% change in liquidity
    });

    it("returns a finding if gas used is above threshold", async () => {
      // mock a block event that produces a change in liquidity over 10%
    });
  });
});
