// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/base/LiquidityManagement.sol";

contract SupplyUni is IERC721Receiver, Ownable {
    using SafeMath for uint256;

    // events
    event Deposit(
        address indexed sender,
        uint256 poolId,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        uint24 poolFee
    );
    event Withdraw(
        address indexed sender,
        uint256 poolId,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        uint24 poolFee
    );
    event Delete(address indexed sender, uint256 poolId);

    // constants
    uint256 public constant DEADLINE = 60 * 30; // 30 minutes like Uniswap Front
    INonfungiblePositionManager public constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);

    // variables
    uint256 public poolCount; // number of pools, for making ID's incremental
    uint256 private _tokenId;

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
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
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

    function _slipCalc(uint256 amount, uint256 maxSlip)
        internal
        view
        returns (uint256)
    {
        if (maxSlip == 0) {
            maxSlip = 1;
        }
        return amount - ((amount * maxSlip) / 100);
    }

    // method for calculating max slippage of an amount, and includes the slippage
    function _percentageCalc(
        uint256 amount,
        uint256 percentageAmm,
        uint256 maxSlip
    ) internal view returns (uint256) {
        uint256 calcAmm = ((percentageAmm * amount) / 100);
        return _slipCalc(calcAmm, maxSlip);
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
            if (
                pools[poolId].token0 == token0 &&
                pools[poolId].token1 == token1 &&
                pools[poolId].poolFee == poolFee
            ) {
                revert("Pool already exists");
            }
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
        uint256 amm1,
        uint256 maxSlip
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
                tickLower: TickMath.MIN_TICK / int24(2),
                tickUpper: TickMath.MAX_TICK / int24(2),
                amount0Desired: amm0,
                amount1Desired: amm1,
                amount0Min: _slipCalc(amm0, maxSlip),
                amount1Min: _slipCalc(amm1, maxSlip),
                recipient: address(this),
                deadline: block.timestamp + DEADLINE
            });
        (tokenId, liquidity, amount0, amount1) = nonfungiblePositionManager
            .mint(params);

        // Save the new deposit
        _saveDeposit(poolId, tokenId, liquidity, amount0, amount1);

        // Remove allowance and refund in both assets (when final amount is less than the desired).
        if (amount0 < amm0) {
            TransferHelper.safeApprove(
                pool.token0,
                address(nonfungiblePositionManager),
                0
            );
            uint256 refund0 = amm0 - amount0;
            TransferHelper.safeTransfer(pool.token0, msg.sender, refund0);
        }

        if (amount1 < amm1) {
            TransferHelper.safeApprove(
                pool.token1,
                address(nonfungiblePositionManager),
                0
            );
            uint256 refund1 = amm1 - amount1;
            TransferHelper.safeTransfer(pool.token1, msg.sender, refund1);
        }

        emit Deposit(
            msg.sender,
            poolId,
            pool.token0,
            pool.token1,
            amount0,
            amount1,
            pool.poolFee
        );
    }

    /// @notice Increases liquidity in the current range
    /// @dev Pool must be initialized already to add liquidity
    /// @param poolId The id of the pool
    /// @param amount0 The desired amount to add of token0
    /// @param amount1 The desired amount to add of token1
    function increasePosition(
        uint256 poolId,
        uint256 amountAdd0,
        uint256 amountAdd1,
        uint256 maxSlip
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
                    amount0Min: _slipCalc(amountAdd0, maxSlip),
                    amount1Min: _slipCalc(amountAdd1, maxSlip),
                    deadline: block.timestamp + DEADLINE
                });
        /// increase liquidity
        (liquidity, amount0, amount1) = nonfungiblePositionManager
            .increaseLiquidity(params);

        // update deposit mapping
        _saveDeposit(poolId, _tokenId, liquidity, amount0, amount1);

        // Remove allowance and refund in both assets (when final amount is less than the desired).
        if (amount0 < amountAdd0) {
            TransferHelper.safeApprove(
                pool.token0,
                address(nonfungiblePositionManager),
                0
            );
            uint256 refund0 = amountAdd0 - amount0;
            TransferHelper.safeTransfer(pool.token0, msg.sender, refund0);
        }

        if (amount1 < amountAdd1) {
            TransferHelper.safeApprove(
                pool.token1,
                address(nonfungiblePositionManager),
                0
            );
            uint256 refund1 = amountAdd1 - amount1;
            TransferHelper.safeTransfer(pool.token1, msg.sender, refund1);
        }

        emit Deposit(
            msg.sender,
            poolId,
            pool.token0,
            pool.token1,
            amount0,
            amount1,
            pool.poolFee
        );
    }

    /// @notice Collects the fees associated with provided liquidity
    /// @dev The contract must hold the erc721 token before it can collect fees
    ///  tokenId The id of the erc721 token
    /// @param poolId The id of the pool
    /// @return amount0 The amount of fees collected in token0
    /// @return amount1 The amount of fees collected in token1
    function collectAllFees(uint256 poolId)
        public
        poolExists(poolId)
        senderIdExists(poolId)
        returns (uint256 amount0, uint256 amount1)
    {
        require(
            deposits[msg.sender][poolId].tokenId > 0,
            "There is no position from where collect fees"
        );

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
        // TODO: emit event when collecting fees?
    }

    /// @notice A function that decreases the current liquidity given a percentage
    /// @param poolId The id of the pool
    /// @param percentageAmm the percentage of the liquidity that is going to be decreased.
    /// It can be in the range from 1 to 100.
    /// @return amount0 The amount received back in token0
    /// @return amount1 The amount returned back in token1
    function decreasePosition(
        uint256 poolId,
        uint128 percentageAmm,
        uint256 maxSlip
    )
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
        require(
            deposits[msg.sender][poolId].liquidity > 0,
            "There is not liquidity"
        );

        // get pool for event info
        Pool memory pool = pools[poolId];

        // get tokenId and total liquidity of the sender
        OwnerDeposit memory ownerDeposit = deposits[msg.sender][poolId];
        uint128 totalLiquidity = ownerDeposit.liquidity;
        // calculate the amount based on the percentage
        uint128 withdrLiquidity = (percentageAmm * totalLiquidity) / 100;

        // amount0Min and amount1Min are price slippage checks
        // if the amount received after burning is not greater than these minimums, transaction will fail
        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: ownerDeposit.tokenId,
                    liquidity: withdrLiquidity,
                    amount0Min: _percentageCalc(
                        ownerDeposit.amount0,
                        percentageAmm,
                        maxSlip
                    ),
                    amount1Min: _percentageCalc(
                        ownerDeposit.amount1,
                        percentageAmm,
                        maxSlip
                    ),
                    deadline: block.timestamp + DEADLINE
                });

        // decrease position
        (amount0, amount1) = nonfungiblePositionManager.decreaseLiquidity(
            params
        );

        // collect earned fees
        collectAllFees(poolId);

        // get and update position
        (, , , , , , , uint128 liquidity, , , , ) = nonfungiblePositionManager
            .positions(ownerDeposit.tokenId);

        // update deposit
        _saveDeposit(poolId, ownerDeposit.tokenId, liquidity, amount0, amount1);

        //send liquidity back to owner
        _sendToOwner(ownerDeposit.tokenId, amount0, amount1);

        emit Withdraw(
            msg.sender,
            poolId,
            pool.token0,
            pool.token1,
            amount0,
            amount1,
            pool.poolFee
        );
    }

    /// @notice function for create and uodate the deposit state on 'deposits' mapping
    /// @param poolId The pool id
    /// @param tokenId The sender id from his NFT position
    /// @param liquidity The total amount of liquidity
    /// Is necessary because the operation changes based on that
    function _saveDeposit(
        uint256 poolId,
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    ) internal {
        // this variable is for asserting that the deposit is initialized
        bool initialized = true;
        // save in the mapping
        deposits[msg.sender][poolId] = OwnerDeposit(
            tokenId,
            liquidity,
            amount0,
            amount1,
            initialized
        );
    }

    /// @notice Transfers funds to owner of NFT
    ///  @param poolId The id of the pool
    ///  @param amount0 The amount of token0
    ///  @param amount1 The amount of token1
    function _sendToOwner(
        uint256 poolId,
        uint256 amount0,
        uint256 amount1
    ) internal {
        address token0 = pools[poolId].token0;
        address token1 = pools[poolId].token1;

        // transfer amounts to owner
        TransferHelper.safeTransfer(token0, msg.sender, amount0);
        TransferHelper.safeTransfer(token1, msg.sender, amount1);
    }

    /// @notice Transfers the NFT to the owner
    ///  tokenId The id of the erc721
    function retrieveNFT(uint256 poolId) external {
        // must be the owner of the NFT
        _tokenId = deposits[msg.sender][poolId].tokenId;
        // transfer ownership to original owner
        nonfungiblePositionManager.safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );
        //remove information related to tokenId
        delete deposits[msg.sender][poolId];

        emit Delete(msg.sender, poolId);
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
