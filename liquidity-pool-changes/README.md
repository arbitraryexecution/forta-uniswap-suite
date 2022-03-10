# Large Liquidity Pool Changes Agent

## Description

This agent detects changes in liquidity pools when there is a change greater than 10%.

## Alerts

- AE-UNISWAPV3-LARGE-LIQUIDITY-POOL-CHANGE
  - Fired when the difference in liquidity between 2 blocks is greater than 10% for the USDC/ETH uniswapV3 pool
  - Severity is set to "info"
  - Type is set to "info"
  - Metadata fields contain:
    - Pool address
    - Liquidity during previous block
    - Liquidity during current block
    - Percent change in liquidity between previous block and current block

## Test Data

- Changed the agent config to a very small threshold (i.e ".000000000001") so that it would fire on liquidity changes
- When inputting the threshold percent into your agent-config.json, it is suggested to input the value as a string