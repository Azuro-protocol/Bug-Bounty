# AzuroV1 Bug Bounty 

# ****Program Overview****

Azuro Protocol - decentralized betting protocol. Azuro utilizes smart-contracts to build a decentralized betting protocol deploying an innovative solution for liquidity provision and allocation. Unlike existing and most new projects, Azuro is the first to introduce pooled liquidity to scale prediction markets. As a result betting becomes transparent and trustless, while depth of betting events, markets and UX remains as good as it gets.

Azuro is running  bug bounty program focused on Azuro Protocol’s liquidity pool solution( liquidity tree). 

The bug bounty program is focused around its smart contracts and is mostly concerned with the loss of user funds.

# Azuro-v1

## Docs

https://azuro-protocol.notion.site/Azuro-V1-6c8a1604d9934e28972aa781526f9a0e

## Liquidity Tree Details

https://github.com/Azuro-protocol/LiquidityTree

## Compile

```
npm compile
```

## Test

```
npm test
```

## make .env

fill up networks keys you are going to use:
- **ALCHEMY_API_KEY_RINKEBY=** for node connection
- **ALCHEMY_API_KEY_KOVAN=** for node connection
- **KOVAN_PRIVATE_KEY=**
- **RINKEBY_PRIVATE_KEY=**
- **MAINNET_PRIVATE_KEY=**
- **BSC_PRIVATE_KEY=**
- **ETHERSCAN_API_KEY=** for contract verification

## testnet deploy

run script `deploy-rinkeby`
returned result will contain smartcontract addresses:
- **usdt deployed to** - usdt mock token address
- **Math deployed to** - Math library address
- **azurobet deployed to** - azurobet - (nft) token address
- **lp deployed to** - lp smartcontract address
- **core deployed to** - core smartcontract address
