const ethers = require('ethers');
const {
  Finding, FindingType, FindingSeverity, createTransactionEvent,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./admin-events');

// retrieve a contract by name from the list of initialized contracts
function getContractByName(contracts, name) {
  let index = 0;
  while (index < contracts.length && contracts[index].name !== name) {
    index++;
  }
  const contract = contracts[index];
  return contract;
}

// tests
describe('admin event monitoring', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let handleTransaction;

    beforeEach(async () => {
      initializeData = {};

      // initialize the handler
      await (provideInitialize(initializeData))();
      handleTransaction = provideHandleTransaction(initializeData);
    });

    it('returns empty findings if contract address does not match', async () => {
      // logs data for test case:  no address match + no topic match
      const logsNoMatchAddress = [
        {
          address: ethers.constants.AddressZero,
          topics: [
            ethers.constants.HashZero,
          ],
        },
      ];

      // build transaction event
      const txEvent = createTransactionEvent({
        receipt: { logs: logsNoMatchAddress },
        addresses: { [ethers.constants.AddressZero]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but not event', async () => {
      const { contracts } = initializeData;

      // retrieve the Object corresponding to the SafeBoxETH contract
      const governorBravoContract = getContractByName(contracts, 'GovernorBravo');

      // logs data for test case: address match + no topic match
      const logsNoMatchEvent = [
        {
          address: governorBravoContract.address,
          topics: [
            governorBravoContract.iface.getEventTopic('VoteCast'),
            ethers.constants.HashZero, // voter address
          ],
          // create a large dummy array to give ethers.parseLog() something to decode
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      // build transaction event
      const txEvent = createTransactionEvent({
        receipt: { logs: logsNoMatchEvent },
        addresses: { [governorBravoContract.address]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a target contract emits an event from its watchlist', async () => {
      const { contracts } = initializeData;

      // retrieve the Object corresponding to the UniswapV3Factory contract
      const uniswapV3FactoryContract = getContractByName(contracts, 'UniswapV3Factory');

      // logs data for test case: address match + topic match (should trigger a finding)
      const logsMatchEvent = [
        {
          address: uniswapV3FactoryContract.address.toLowerCase(),
          topics: [
            uniswapV3FactoryContract.iface.getEventTopic('OwnerChanged'),
            `${(ethers.constants.HashZero).slice(0, -1)}1`, // old owner address  0x0000...0001
            `${(ethers.constants.HashZero).slice(0, -1)}2`, // new owner address  0x0000...0002
          ],
          // create a large dummy array to give ethers.parselog() something to decode
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      // build transaction event
      const txEvent = createTransactionEvent({
        receipt: { logs: logsMatchEvent },
        addresses: { [uniswapV3FactoryContract.address]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // create expected finding
      const testFindings = [Finding.fromObject({
        name: 'Uniswap V3 Admin Event',
        description: 'The OwnerChanged event was emitted by the UniswapV3Factory contract',
        alertId: 'AE-UNISWAPV3-ADMIN-EVENT',
        type: FindingType.Suspicious,
        severity: FindingSeverity.High,
        everestId: '0xa2e07f422b5d7cbbfca764e53b251484ecf945fa',
        protocol: 'Uniswap V3',
        metadata: {
          contractName: 'UniswapV3Factory',
          contractAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
          eventName: 'OwnerChanged',
          eventArgs: {
            oldOwner: '0x0000000000000000000000000000000000000001',
            newOwner: '0x0000000000000000000000000000000000000002',
          },
        },
      })];

      expect(findings).toStrictEqual(testFindings);
    });
  });
});
