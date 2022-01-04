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

To test large-flash-swap detection of a Flash event with high USD value:

`npx forta-agent run --tx 0x8c97790e8a16b71968b7d194892966b86e3d898c7d166086d4d8831ed3fbaff3`
