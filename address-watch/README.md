# Address Watch Agent

## Alerts

<!-- -->
- AE-UNISWAPV3-ADDRESS-WATCH
  - Fired when any address that is a 'minter', 'owner', or 'admin' is involved in a transaction
  - Severity is set to "info" if the transaction involves a protocol contract, otherwise severity is set to "medium"
  - Type is set to "info" if the transaction involves a protocol contract, otherwise type is set to "suspicious"
  - Metadata field contains the address involved in the transaction

## Test Data

To run all of the tests for this agent, use the following command: `npm run test`

To test address-watch detection of a transaction involving a key protocol address:

`npx forta-agent run --tx 0x74245e831640e09dd60cddeeea25d726a65eabb80b5896441ae4e68e646c6eb9`