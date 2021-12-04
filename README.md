# Forta Uniswap V3 Suite

Forta agent suite to monitor Uniswap V3.

## Description

This agent monitors various aspects of Uniswap V3.  The suite currently contains
the following handlers:

 - admin-events
 - address-watch
 - large-flash-swap

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-UNISWAPV3-ADMIN-EVENT
 - Fired on any event in the 'adminEvents' section of agent-config.json
 - Severity and Type are set to the corresponding values in agent-config.json
 - Metadata field contains contract name, contract address, event name, and event arguments

<!-- -->
- AE-UNISWAPV3-ADDRESS-WATCH
 - Fired when any address that is a 'minter', 'owner', or 'admin' is involved in a transaction
 - Severity is set to "info" if the transaction involves a protocol contract, otherwise severity is set to "medium"
 - Type is set to "info" if the transaction involves a protocol contract, otherwise type is set to "suspicious"
 - Metadata field contains the address involved in the transaction

<!-- -->
- AE-UNISWAPV3-LARGE-FLASH-SWAP
 - Fired on any Flash event from a Uniswap V3 Pool contract with USD value exceeding the threshold specified in agent-config.json
 - Severity is always set to "info"
 - Type is always set to "info"
 - Metadata field contains:
    - Pool address
    - Amount of token 0 involved in swap
    - Amount of token 1 involved in swap
    - Sender's address
    - USD value of token 0 amount involved in swap
    - USD value of token 1 amount involved in swap
    - Flash swap threshold

## Test Data

To run all of the tests for this agent, use the following command: `npm run test`

To test admin-events detection of a PoolCreated event:

`npx forta-agent run --tx 0x39a5ace80a5723869e7d825da19ec8afa676cef05bd649282fdfe7f653d997db`

To test address-watch detection of a transaction involving a key protocol address:

`npx forta-agent run --tx 0x74245e831640e09dd60cddeeea25d726a65eabb80b5896441ae4e68e646c6eb9`

To test large-flash-swap detection of a Flash event with high USD value:

`npx forta-agent run --tx 0x8c97790e8a16b71968b7d194892966b86e3d898c7d166086d4d8831ed3fbaff3`
