# Forta Uniswap V3 Suite

Forta agent suite to monitor Uniswap V3.

## Description

This suite monitors various aspects of Uniswap V3 and currently contains
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

## Test Data

To run all of the tests for this agent, use the following command: `npm run test`

To test admin-events detection of a PoolCreated event:

`npx forta-agent run --tx 0x39a5ace80a5723869e7d825da19ec8afa676cef05bd649282fdfe7f653d997db`
