const {
  FindingType,
  FindingSeverity,
  Finding,
  createBlockEvent,
} = require("forta-agent");

const config = require("../agent-config.json")

const { provideHandleBlock, provideInitialize } = require("./agent");

describe("large liquidity pool change agent", () => {
  // create a block event that changes liquiidty
  let initializeData;
  let handleBlock;

  beforeEach(async () => {
    initializeData = {}

    await (provideInitialize(initializeData))();

    handleBlock = provideHandleBlock(initializeData);

  })

  describe("setup data", () => {
    it("should initialize data", async() => {
      expect(initializeData.everestId).toEqual(config.EVEREST_ID);
    })
  })

  describe("handleBlock", () => {
    it("returns empty findings if liquidity change is below threshold", async () => {
      // mock a block event that doesn't produce a 10% change in liquidity
    });

    it("returns a finding if gas used is above threshold", async () => {
      // mock a block event that produces a change in liquidity over 10%
    });

  });
});
