const ethers = require('ethers');
const {
  Finding, FindingType, FindingSeverity, createTransactionEvent,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize, getAbi } = require('./address-watch');
const { Uni: uniAddress } = require('../../contract-addresses.json');

const testAddr = `0x1${'0'.repeat(39)}`;
const testAddr2 = `0x2${'0'.repeat(39)}`;
const mockContract = {
  minter: jest.fn().mockResolvedValue(testAddr2),
  address: testAddr2,
  interface: new ethers.utils.Interface(getAbi('Uni')),
};

// tests
describe('key protocol address watch handler', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let handleTransaction;

    beforeEach(async () => {
      initializeData = {};

      // initialize the handler
      await (provideInitialize(initializeData))();
      initializeData.addresses = [testAddr];
      initializeData.contracts = [mockContract];
      handleTransaction = provideHandleTransaction(initializeData);
    });

    it('returns empty findings if key address is not involved in transaction', async () => {
      // build transaction event
      const addresses = {};
      addresses[testAddr2] = true;

      const logsNoMatchEvent = [
        {
          address: ethers.constants.AddressZero,
          topics: [
            ethers.constants.HashZero,
          ],
        },
      ];

      const txEvent = createTransactionEvent({
        addresses,
        transaction: {
          hash: ethers.constants.HashZero,
          to: uniAddress,
        },
        receipt: { logs: logsNoMatchEvent },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if key address is involved in transaction', async () => {
      // build transaction event
      const addresses = {};
      addresses[testAddr] = true;

      const logsNoMatchEvent = [
        {
          address: ethers.constants.AddressZero,
          topics: [
            ethers.constants.HashZero,
          ],
        },
      ];

      const txEvent = createTransactionEvent({
        addresses,
        transaction: {
          hash: ethers.constants.HashZero,
          to: uniAddress,
        },
        receipt: { logs: logsNoMatchEvent },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'Uniswap V3 Address Watch Notification',
          description: 'Key protocol address involved in a transaction',
          alertId: 'AE-UNISWAPV3-ADDRESS-WATCH',
          type: FindingType.Info,
          severity: FindingSeverity.Info,
          everestId: initializeData.everestId,
          protocol: 'Uniswap V3',
          metadata: {
            address: testAddr          },
        }),
      ]);
    });

    it('ignores minter change event if not on a watched contract address', async () => {
      // build transaction event
      const addresses = {};
      addresses[testAddr2] = true;

      const logsEventMatch = [
        {
          address: testAddr, // handler is watching for testAddr2
          topics: [
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MinterChanged(address,address)')),
          ],
          // create a large dummy array to give ethers.parseLog() something to decode
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      const txEvent = createTransactionEvent({
        addresses,
        transaction: {
          hash: ethers.constants.HashZero,
          to: uniAddress,
        },
        receipt: { logs: logsEventMatch },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('with a minter change event, reads new minter address and returns a finding if involved in transaction', async () => {
      // build transaction event
      const addresses = {};
      addresses[testAddr2] = true;

      const logsEventMatch = [
        {
          address: testAddr2,
          topics: [
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MinterChanged(address,address)')),
          ],
          // create a large dummy array to give ethers.parseLog() something to decode
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      const txEvent = createTransactionEvent({
        addresses,
        transaction: {
          hash: ethers.constants.HashZero,
          to: uniAddress,
        },
        receipt: { logs: logsEventMatch },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'Uniswap V3 Address Watch Notification',
          description: 'Key protocol address involved in a transaction',
          alertId: 'AE-UNISWAPV3-ADDRESS-WATCH',
          type: FindingType.Info,
          severity: FindingSeverity.Info,
          everestId: initializeData.everestId,
          protocol: 'Uniswap V3',
          metadata: {
            address: testAddr2
          },
        }),
      ]);
    });
  });
});
