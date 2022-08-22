# Strat Supply Uni

## What is it?

Is the repo with the strategy for supplying liquidity in the Uniswap V3 protocol.

## What it does?

With it, you can create multiple positions with an amount of a pair of tokens, increase those positions, collect the fees earned by them and decrease the liquidity provided in a Uniswap V3 pool. In addition, you can retrieve your position NFT id if you want to manage it yourself.


Also, the deployer (in the contract addresses we are the deployer) can add the pools that the strategy will support, but is the only function that only exclusvly the owner (or deployer) can execute.

We hope in the future that function could be executed by a DAO, by the community voting which pool to add in the strategy.
 
---

## Stack

Hardhat is the framework used.

Typescript is the programming language used for developing the scripts (with `ethers` library too).

Typescript and Waffle were used for tests (with `ethers` library too).

Solidity is the programing language for developing the smart contracts (libraries imported from openZeppelin and uniswapV3-core)

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


### Tests

The contract is successfully tested with integration tests that executes all the methods combined and unit tests that executes function by function and all the methods combined too.

* **Unit tests**:

  `yarn hardhat test test/unit/supply-uni-unit.test.ts --network hardhat` for running all the unit test. The result is the following:
  Example of unit tests in local network (forking from the ethereum mainnet):

![image](https://user-images.githubusercontent.com/71539596/185839028-c68c4acc-634a-4e38-84b1-1e9f786dfbef.png)

  (logs were dismissed in the image)


* **Integration tests**:

  `yarn hardhat test test/stagging/supply-uni-stag.test.ts --network <network_name>` for running the stagging test. The result is the following:

  Example of stagging tests in `polygon` network:

  ![image](https://user-images.githubusercontent.com/71539596/185839063-ce509225-362d-425e-b29f-b8a0b2d6d6c2.png)

  (logs were dismissed in the image)


### Verification

The contract is already verified:

* Here you can check all the tx of the contract that I deployed on the `Polygon` network in polygonscan with this link: 

https://polygonscan.com/address/0xC9Fc250Ab92a802fCc96719eBE17c9c831aDF264

* Here you can check all the tx of the contract that I deployed on the `Mumbai` testnet network in polygonscan with this link: 

https://mumbai.polygonscan.com/address/0x7F855BDcb03bCb6e3b66Ecbd028363397174481a

-------
