# Strat Supply Uni

## What is it?

Is the repo with the strategy for supplying liquidity in the Uniswap V3 protocol.

## What it does?

With it, you can create multiple positions with an amount of a pair of tokens, increase those positions, collect the fees earned by them and decrease the liquidity provided in a Uniswap V3 pool. In addition, you can retrieve your position NFT id if you want to manage it yourself.

Also, the deployer (in the contract addresses we are the deployer) can add the pools that the strategy will support, but is the only function that only exclusvly the owner (or deployer) can execute.

We hope in the future that function could be executed by a DAO, by the community voting which pool to add in the strategy.

---

### Addresses and Verification

The contract is already verified:

**Polygon**:

- This is the deployed contract address on `Polygon`: `0xC9Fc250Ab92a802fCc96719eBE17c9c831aDF264`

- Here you can check all the tx of the contract that I deployed on the `Polygon` network in polygonscan with this link:

https://polygonscan.com/address/0xC9Fc250Ab92a802fCc96719eBE17c9c831aDF264

**Mumbai**:

- This is the deployed contract address on `Mumbai`: `0x7F855BDcb03bCb6e3b66Ecbd028363397174481a`

- Here you can check all the tx of the contract that I deployed on the `Mumbai` testnet network in polygonscan with this link:

https://mumbai.polygonscan.com/address/0x7F855BDcb03bCb6e3b66Ecbd028363397174481a

---

# How to use

I used _yarn_ as package manager, but you could you _npm_ or any other that you prefer.

### Install dependencies

Firstly, you have to install the packages. The command is:

`yarn install`

For compile the contracts use:

`yarn hardhat compile`

### Setup .env files

You will need to setup a `.env` file for every network that you are going to use.
For example, `.env.polygon` and `.env.mumbai` would have the same variables, but with different values each. You can find the variables in `.env.example` file.

Each `.env.<network_name>` contains the variables names that the `.sample-env` file has.

## Methods Execution

The `SupplyUni` contract has 5 external functions that can be executed: `mintNewPosition()`, `increasePosition()`, `decreasePosition()`, `collectAllFees()` and `retrieveNFT()` (only the sender can execute the methods, you can't execute from an address if you want to invest with another):

Before explaining them is important to know what the `poolId` is:
Is the id of an Uniswap V3 pool. It has the 2 tokens of the pair addresses, the fee of the selected pool and a boolean variable called initialized as information. The poolId is defined by the contract owner (is the unique method that is restricted to the owner).

And what maxSlip is:
Is the maximum slippage you tolerate in the transaction. Is in percentage so you have to insert a number that goes from 0 to 100.

- **mintNewPosition(uint256 poolId, uint256 amm0, uint256 amm1, uint256 maxSlip)**:
  With this method the sender can mint create a new position in a Uniswap V3 pool. Before executing it, you have had to approve the amount to deposit in the position of both assets.
  Sender you have to pass the pool id, the amount of token0 approved, the amount of token1 approved and the max slippage you tolerate for that execution.

- **increasePosition(uint256 poolId, uint256 amountAdd0, uint256 amountAdd1, uint256 maxSlip)**:
  With this method the sender can increase an existent position in a Uniswap V3 pool. The position must be created before executing this method, and also, sender have had to approve the amount to deposit in the position of both assets. Then you have to pass the pool id, the amount of token0 approved that you are gooing to add, the amount of token1 approved that you are gooing to add and the max slippage you tolerate for that execution.
- **decreasePosition(uint256 poolId, uint128 percentageAmm, uint256 maxSlip)**:
  With this method the sender can decrease an existent position in a Uniswap V3 pool. The position must be created before executing this method.
  The `percentageAmm` is the percentage to withdraw from the total amount of the current position. So this number goes from 1 to 100.
  Sender have to insert the pool id, the percentage amount and the max slippage you tolerate as params for executing this function.
- **collectAllFees(uint256 poolId)**:
  With this method the sender can collect all the fees earned by an active position in Uniswap V3 pool. The position in the pool must be created before executing this function. The sender needs to insert the pool id from which he wants to collect the fees for executing it.
- **retrieveNFT(uint256 poolId)**:
  With this method the sender can retrieve the NFT of a Uniswap V3 position from `SupplyUni` contract for managing it himself. The position on that pool in Uniswap V3 must be created and active for this transaction to succed.

---

## Stack

Hardhat is the framework used.

Typescript is the programming language used for developing the scripts (with `ethers` library too).

Typescript and Waffle were used for tests (with `ethers` library too).

Solidity is the programing language for developing the smart contracts (libraries imported from openZeppelin and uniswapV3-core)

---

### Tests

The contract is successfully tested with integration tests that executes all the methods combined and unit tests that executes function by function and all the methods combined too.

- **Unit tests**:

  `yarn hardhat test test/unit/supply-uni-unit.test.ts --network hardhat` for running all the unit test. The result is the following:
  Example of unit tests in local network (forking from the ethereum mainnet):

![image](https://user-images.githubusercontent.com/71539596/185839028-c68c4acc-634a-4e38-84b1-1e9f786dfbef.png)

(logs were dismissed in the image)

- **Integration tests**:

  `yarn hardhat test test/stagging/supply-uni-stag.test.ts --network <network_name>` for running the stagging test. The result is the following:

  Example of stagging tests in `polygon` network:

  ![image](https://user-images.githubusercontent.com/71539596/185839063-ce509225-362d-425e-b29f-b8a0b2d6d6c2.png)

  (logs were dismissed in the image)

---
