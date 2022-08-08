// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/base/LiquidityManagement.sol";
import "hardhat/console.sol";

contract SupplyUni is IERC721Receiver, Ownable {
    // events
    event Deposit(address indexed sender, uint256 tokenId);
    event Withdraw(address indexed sender, uint256 tokenId);

    // constants
    uint256 public constant MAX_SLIPPAGE = 1; // 1%
    INonfungiblePositionManager public constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);

    // variables
    uint256 public poolCount; // number of pools, for making ID's incremental
    uint256 private _tokenId;

    /// @dev enum useful in _saveDeposit() function
    enum PositionAction {
        MINT,
        INCREASE,
        DECREASE
    }

    /// @notice Represents Uniswap V3 pool info + isActive field
    struct Pool {
        address token0;
        address token1;
        uint24 poolFee;
        bool isActive;
    }
    /// @dev pools[poolId] => Pool
    mapping(uint256 => Pool) public pools;

    /// @notice Represents the deposit of an NFT
    struct OwnerDeposit {
        uint256 tokenId;
        uint256 amount0;
        uint256 amount1;
        uint128 liquidity;
        bool initialized;
    }
    /// @dev deposits[address][poolId] => OwnerDeposit
    mapping(address => mapping(uint256 => OwnerDeposit)) public deposits;

    constructor() {}

    // modifiers
    modifier poolExists(uint256 poolId) {
        require(pools[poolId].isActive, "Pool doesn't exist or isn't active");
        _;
    }

    modifier senderIdExists(uint256 poolId) {
        require(
            deposits[msg.sender][poolId].tokenId != 0,
            "There is no position from the sender in that pool"
        );
        _;
    }

    modifier amountsNotZero(uint256 _amm0, uint256 _amm1) {
        require(_amm0 != 0 || _amm1 != 0, "Both amounts are zero");
        _;
    }

    // Implementing `onERC721Received` so this contract can receive custody of erc721 tokens
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // method for calculating max slippage of an amount
    function _slippageCalc(uint256 amount) internal pure returns (uint256) {
        return amount - ((amount * MAX_SLIPPAGE) / 100);
    }

    /// @notice adds a new pool to the strategy
    function addPool(
        address token0,
        address token1,
        uint24 poolFee
    ) external onlyOwner {
        // Check is not address zero
        require(
            (token0 != address(0) && token1 != address(0)),
            "The token can't be the zero address"
        );

        // Check that poolFee exists
        require(
            poolFee == 100 ||
                poolFee == 500 ||
                poolFee == 3000 ||
                poolFee == 10000,
            "Invalid poolFee"
        );

        // assert pool does not exist
        for (uint256 poolId = 0; poolId < poolCount; poolId++) {
            require(
                pools[poolId].token0 != token0 &&
                    pools[poolId].token1 != token1 &&
                    pools[poolId].poolFee != poolFee,
                "Pool already exists"
            );
        }

        // creates pool in mapping
        pools[poolCount] = Pool({
            token0: token0,
            token1: token1,
            poolFee: poolFee,
            isActive: true
        });
        poolCount += 1; // This for making ID's incremental
    }

    /// @notice Calls the mint function defined in periphery, for creating a new position on a pool.
    /// @param poolId the id of the Pool set by the owner of this contract
    /// @param amm0 The desired amount to be deposited of token0
    /// @param amm1 The desired amount to be deposited of token1
    /// @return tokenId The id of the newly minted ERC721
    /// @return liquidity The amount of liquidity for the position
    /// @return amount0 The amount deposited of token0
    /// @return amount1 The amount deposited of token1
    function mintNewPosition(
        uint256 poolId,
        uint256 amm0,
        uint256 amm1
    )
        external
        poolExists(poolId)
        amountsNotZero(amm0, amm1)
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(
            !deposits[msg.sender][poolId].initialized,
            "The position in the pool already exists"
        );

        Pool memory pool = pools[poolId];

        // transfer tokens from sender to this contract
        TransferHelper.safeTransferFrom(
            pool.token0,
            msg.sender,
            address(this),
            amm0
        );
        TransferHelper.safeTransferFrom(
            pool.token1,
            msg.sender,
            address(this),
            amm1
        );

        // Approve the position manager
        TransferHelper.safeApprove(
            pool.token0,
            address(nonfungiblePositionManager),
            amm0
        );
        TransferHelper.safeApprove(
            pool.token1,
            address(nonfungiblePositionManager),
            amm1
        );

        // set params and mint new position
        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: pool.token0,
                token1: pool.token1,
                fee: pool.poolFee,
                tickLower: TickMath.MIN_TICK,
                tickUpper: TickMath.MAX_TICK,
                amount0Desired: amm0,
                amount1Desired: amm1,
                amount0Min: _slippageCalc(amm0),
                amount1Min: _slippageCalc(amm1),
                recipient: address(this),
                deadline: block.timestamp
            });
        (tokenId, liquidity, amount0, amount1) = nonfungiblePositionManager
            .mint(params);

        console.log("amount0", amount0);
        console.log("amount1", amount1);
        console.log("liquidity", liquidity);

        // Create a deposit
        _saveDeposit(
            poolId,
            tokenId,
            liquidity,
            amount0,
            amount1,
            PositionAction.MINT
        );

        // Remove allowance and refund in both assets (when final amount is less than the desired).
        if (amount0 < amm0) {
            TransferHelper.safeApprove(
                pool.token0,
                address(nonfungiblePositionManager),
                0
            );
            uint256 refund0 = amm0 - amount0;
            console.log("refund0", refund0);
            console.log(
                "amount0 - refund0 + amount1",
                amount0 - refund0 + amount1
            );
            console.log("amount0 - refund0", amount0 - refund0);
            TransferHelper.safeTransfer(pool.token0, msg.sender, refund0);
        }

        if (amount1 < amm1) {
            TransferHelper.safeApprove(
                pool.token1,
                address(nonfungiblePositionManager),
                0
            );
            uint256 refund1 = amm1 - amount1;
            console.log("refund1", refund1);
            TransferHelper.safeTransfer(pool.token1, msg.sender, refund1);
        }

        emit Deposit(msg.sender, tokenId);
    }

    /// @notice Collects the fees associated with provided liquidity
    /// @dev The contract must hold the erc721 token before it can collect fees
    ///  tokenId The id of the erc721 token
    /// @param poolId The id of the pool
    /// @return amount0 The amount of fees collected in token0
    /// @return amount1 The amount of fees collected in token1
    function collectAllFees(uint256 poolId)
        external
        poolExists(poolId)
        senderIdExists(poolId)
        returns (uint256 amount0, uint256 amount1)
    {
        _tokenId = deposits[msg.sender][poolId].tokenId;

        // set amount0Max and amount1Max to uint256.max in params to collect all fees
        INonfungiblePositionManager.CollectParams
            memory params = INonfungiblePositionManager.CollectParams({
                tokenId: _tokenId,
                recipient: msg.sender,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        // collect fees
        (amount0, amount1) = nonfungiblePositionManager.collect(params);
    }

    /// @notice Increases liquidity in the current range
    /// @dev Pool must be initialized already to add liquidity
    /// @param poolId The id of the pool
    /// @param amount0 The desired amount to add of token0
    /// @param amount1 The desired amount to add of token1
    function increasePosition(
        uint256 poolId,
        uint256 amountAdd0,
        uint256 amountAdd1
    )
        external
        poolExists(poolId)
        senderIdExists(poolId)
        amountsNotZero(amountAdd0, amountAdd1)
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(
            deposits[msg.sender][poolId].initialized,
            "The position isn't initialized"
        );

        // get pool and tokenId of the sender
        Pool memory pool = pools[poolId];
        _tokenId = deposits[msg.sender][poolId].tokenId;

        // transfer tokens from sender to this contract
        TransferHelper.safeTransferFrom(
            pool.token0,
            msg.sender,
            address(this),
            amountAdd0
        );
        TransferHelper.safeTransferFrom(
            pool.token1,
            msg.sender,
            address(this),
            amountAdd1
        );

        // approve the position manager
        TransferHelper.safeApprove(
            pool.token0,
            address(nonfungiblePositionManager),
            amountAdd0
        );
        TransferHelper.safeApprove(
            pool.token1,
            address(nonfungiblePositionManager),
            amountAdd1
        );

        // set params
        INonfungiblePositionManager.IncreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: _tokenId,
                    amount0Desired: amountAdd0,
                    amount1Desired: amountAdd1,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });
        /// increase liquidity
        (liquidity, amount0, amount1) = nonfungiblePositionManager
            .increaseLiquidity(params);

        // update deposit mapping
        _saveDeposit(
            poolId,
            _tokenId,
            liquidity,
            amount0,
            amount1,
            PositionAction.INCREASE
        );

        emit Deposit(msg.sender, _tokenId);
    }

    /// @notice A function that decreases the current liquidity given a percentage
    /// @param poolId The id of the pool
    /// @param percentageAmm the percentage of the liquidity that is going to be decreased.
    /// It can be in the range from 1 to 100.
    /// @return amount0 The amount received back in token0
    /// @return amount1 The amount returned back in token1
    function decreasePosition(uint256 poolId, uint128 percentageAmm)
        external
        poolExists(poolId)
        senderIdExists(poolId)
        returns (uint256 amount0, uint256 amount1)
    {
        require(
            deposits[msg.sender][poolId].initialized,
            "The position isn't initialized"
        );

        require(
            percentageAmm >= 1 && percentageAmm <= 100,
            "Percentage amount out of range"
        );

        // get tokenId and total liquidity of the sender
        _tokenId = deposits[msg.sender][poolId].tokenId;
        uint128 totalLiquidity = deposits[msg.sender][poolId].liquidity;
        require(totalLiquidity > 0, "There is not liquidity");

        // calculate the amount based on the percentage
        uint128 liquidity = (percentageAmm * totalLiquidity) / 100;

        // amount0Min and amount1Min are price slippage checks
        // if the amount received after burning is not greater than these minimums, transaction will fail
        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: _tokenId,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        // decrease position
        (amount0, amount1) = nonfungiblePositionManager.decreaseLiquidity(
            params
        );

        // update the deposit mapping
        uint128 decreasedLiquidity = uint128(amount0 + amount1);
        _saveDeposit(
            poolId,
            _tokenId,
            decreasedLiquidity,
            amount0,
            amount1,
            PositionAction.DECREASE
        );

        uint128 remainingLiquidity = totalLiquidity - decreasedLiquidity;
        //send liquidity back to owner
        _sendToOwner(_tokenId, amount0, amount1, remainingLiquidity);

        emit Withdraw(msg.sender, _tokenId);
    }

    /// @notice function for create and uodate the deposit state on 'deposits' mapping
    /// @param poolId The pool id
    /// @param tokenId The sender id from his NFT position
    /// @param liquidity The total amount of liquidity
    /// @param amount0 The amount of token0
    /// @param amount1 The amount of token1
    /// @param action The action that is going to be saved. It can be MINT, INCREASE OR DECREASE.
    /// Is necessary because the operation changes based on that
    function _saveDeposit(
        uint256 poolId,
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1,
        PositionAction action
    ) internal {
        if (action == PositionAction.MINT) {
            OwnerDeposit memory deposit = OwnerDeposit({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0: amount0,
                amount1: amount1,
                initialized: true
            });

            deposits[msg.sender][poolId] = deposit;
        } else if (action == PositionAction.INCREASE) {
            deposits[msg.sender][poolId].liquidity += liquidity;
            deposits[msg.sender][poolId].amount0 += amount0;
            deposits[msg.sender][poolId].amount1 += amount1;
        } else if (action == PositionAction.DECREASE) {
            deposits[msg.sender][poolId].liquidity -= liquidity;
            deposits[msg.sender][poolId].amount0 -= amount0;
            deposits[msg.sender][poolId].amount1 -= amount1;
        }
    }

    /// @notice Transfers funds to owner of NFT
    ///  @param poolId The id of the pool
    ///  @param amount0 The amount of token0
    ///  @param amount1 The amount of token1
    function _sendToOwner(
        uint256 poolId,
        uint256 amount0,
        uint256 amount1,
        uint128 liquidity
    ) internal {
        address token0 = pools[poolId].token0;
        address token1 = pools[poolId].token1;

        // transfer amounts to owner
        TransferHelper.safeTransfer(token0, msg.sender, amount0);
        TransferHelper.safeTransfer(token1, msg.sender, amount1);

        if (liquidity == 0) {
            delete deposits[msg.sender][poolId];
        }
    }

    /// @notice Transfers the NFT to the owner
    ///  tokenId The id of the erc721
    function retrieveNFT(uint256 poolId) external {
        _tokenId = deposits[msg.sender][poolId].tokenId;
        // must be the owner of the NFT
        // transfer ownership to original owner
        nonfungiblePositionManager.safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );
        //remove information related to tokenId
        delete deposits[msg.sender][poolId];
    }

    /* view functions */

    /// @notice if a owner has an active position in a pool, it will return the info of this
    /// @param owner The address of the position owner
    /// @param poolId The id of the pool
    /// @return deposit The info of the owner deposit in the pool (OwnerDeposit)
    function getOwnerInfo(address owner, uint256 poolId)
        external
        view
        returns (OwnerDeposit memory deposit)
    {
        return deposits[owner][poolId];
    }

    /// @param poolId the id of the pool
    /// @return pool The corresponding pool (poolFee, token0, token1) to that id
    function getPool(uint256 poolId) external view returns (Pool memory pool) {
        return pools[poolId];
    }
}
