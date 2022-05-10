# AzuroV1 Bug Bounty 

# ****Program Overview****

Azuro Protocol - decentralized betting protocol. Azuro utilizes smart-contracts to build a decentralized betting protocol deploying an innovative solution for liquidity provision and allocation. Unlike existing and most new projects, Azuro is the first to introduce pooled liquidity to scale prediction markets. As a result betting becomes transparent and trustless, while depth of betting events, markets and UX remains as good as it gets.

Azuro is running  bug bounty program focused on Azuro Protocol’s liquidity pool solution( liquidity tree). 

The bug bounty program is focused around its smart contracts and is mostly concerned with the loss of user funds.

# ****Rewards by Threat Level****

The Azuro Protocol bounty program considers a number of variables in determining rewards. Determinations of eligibility, score, and all terms related to an award are at the sole and final discretion of the Azuro Protocol bug bounty panel.

The Azuro core development team, employees, and all other people paid by Azuro, directly or indirectly (including the external auditors), are not eligible for rewards.

In order to be eligible for a reward, bug reports must include an explanation of how the bug can be reproduced, a failing test case, a valid scenario in which the bug can be exploited. Critical vulnerabilities with all of these have a maximum reward of USD 21 500. If a fix that makes the test case pass is provided, an additional USD can be provided.

**Critical**

- Direct theft of any user funds, whether at-rest or in-motion, other than unclaimed yield
- Permanent freezing of funds
- Miner-extractable value (MEV)

**High**

- Theft of unclaimed yield
- Permanent freezing of unclaimed yield
- Unfair distribution of profit between Liquidity Providers

**Medium**

- Smart contract unable to operate due to lack of funds
- Block stuffing for profit
- Griefing (e.g. no profit motive for an attacker, but damage to the users or the protocol)
- Unbounded gas consumption

**Low**

- Smart contract fails to deliver promised returns, but doesn’t lose value


# Azuro-v1

## Docs

https://azuro-protocol.notion.site/Azuro-V1-6c8a1604d9934e28972aa781526f9a0e

## Security Analysis

[Security Analysis by Pessimistic](./audit-reports/Azuro%20Security%20Analysis%20by%20Pessimistic%20(3).pdf)

[Security Analysis by Jack](./audit-reports/azuro-v1-audit-report-prelim.pdf)


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
- **TEST_WALLET1=** any wallet to get test usdt
- **TEST_WALLET2=** any wallet to get test usdt
- **TEST_WALLET3=** any wallet to get test usdt

## testnet deploy

run script `deploy-rinkeby`
returned result will contain smartcontract addresses:
- **NEXT_PUBLIC_CORE** - core smartcontract address
- **NEXT_PUBLIC_LP** - lp smartcontract address
- **NEXT_PUBLIC_AZURO_BET** - azurobet - (nft) token address
- **NEXT_PUBLIC_USDT** - usdt mock token address

# Rinkeby latest addresses:
```
CORE: 0x7ce09c4401694F80b4352407A2df59A2D339C32A

LP: 0x31acF17c04f27Bb7DE1cf2fDfa8785950A05b80A

AZURO_BET: 0x8ca27099AD224984e90Fd95D8de30D7B1cF523eb

TEST_USDT: 0xb64a99A6A34A719B323655CeE9FC0D3f61b5D7Ef
```