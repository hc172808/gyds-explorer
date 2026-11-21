// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Wrapped native GYDS used by the testnet AMM.
contract WrappedGYDS {
    string public constant name = "Wrapped GYDS";
    string public constant symbol = "WGYDS";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        require(msg.value > 0, "WGYDS: zero deposit");
        totalSupply += msg.value;
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0 && balanceOf[msg.sender] >= amount, "WGYDS: invalid amount");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Withdrawal(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "WGYDS: native transfer failed");
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        require(permitted >= amount, "WGYDS: insufficient allowance");
        if (permitted != type(uint256).max) allowance[from][msg.sender] = permitted - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "WGYDS: zero recipient");
        require(balanceOf[from] >= amount, "WGYDS: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @notice Experimental constant-product AMM restricted to GYDS testnet.
/// @dev Test-only prototype. It is unaudited and does not support fee-on-transfer or rebasing tokens.
contract GYDSDexTestnet {
    uint256 public constant TESTNET_CHAIN_ID = 198281;
    uint256 public constant FEE_NUMERATOR = 997;
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 private constant MINIMUM_LIQUIDITY = 1000;

    address public immutable wrappedNative;

    struct Pool {
        address token0;
        address token1;
        uint112 reserve0;
        uint112 reserve1;
        uint256 totalShares;
    }

    mapping(bytes32 => Pool) private pools;
    mapping(bytes32 => mapping(address => uint256)) private lpShares;
    uint256 private unlocked = 1;

    event PoolCreated(address indexed token0, address indexed token1);
    event LiquidityAdded(address indexed provider, address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB, uint256 shares);
    event LiquidityRemoved(address indexed provider, address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB, uint256 shares);
    event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient);

    modifier lock() {
        require(unlocked == 1, "DEX: reentrant call");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    modifier beforeDeadline(uint256 deadline) {
        require(deadline >= block.timestamp, "DEX: deadline expired");
        _;
    }

    constructor() {
        require(block.chainid == TESTNET_CHAIN_ID, "DEX: testnet only");
        wrappedNative = address(new WrappedGYDS());
    }

    receive() external payable {
        require(msg.sender == wrappedNative, "DEX: only wrapped GYDS");
    }

    function getPool(address tokenA, address tokenB)
        external
        view
        returns (bool exists, uint112 reserveA, uint112 reserveB, uint256 totalShares)
    {
        bytes32 key = _poolKey(tokenA, tokenB);
        Pool storage pool = pools[key];
        if (pool.token0 == address(0)) return (false, 0, 0, 0);
        (uint256 reserveAValue, uint256 reserveBValue) = _reservesFor(pool, tokenA);
        reserveA = uint112(reserveAValue);
        reserveB = uint112(reserveBValue);
        return (true, reserveA, reserveB, pool.totalShares);
    }

    function getShares(address tokenA, address tokenB, address account) external view returns (uint256) {
        return lpShares[_poolKey(tokenA, tokenB)][account];
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        return _amountsOut(amountIn, path);
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address recipient,
        uint256 deadline
    ) external lock beforeDeadline(deadline) returns (uint256 amountA, uint256 amountB, uint256 shares) {
        require(recipient != address(0), "DEX: zero recipient");
        require(amountADesired > 0 && amountBDesired > 0, "DEX: zero desired amount");

        bytes32 key = _poolKey(tokenA, tokenB);
        Pool storage pool = _getOrCreatePool(tokenA, tokenB, key);
        (uint256 reserveA, uint256 reserveB) = _reservesFor(pool, tokenA);

        if (pool.totalShares == 0) {
            amountA = amountADesired;
            amountB = amountBDesired;
        } else {
            require(reserveA > 0 && reserveB > 0, "DEX: invalid reserves");
            uint256 amountBOptimal = amountADesired * reserveB / reserveA;
            if (amountBOptimal <= amountBDesired) {
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                uint256 amountAOptimal = amountBDesired * reserveA / reserveB;
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
        }

        require(amountA >= amountAMin && amountB >= amountBMin, "DEX: slippage adding liquidity");
        _safeTransferFrom(tokenA, msg.sender, address(this), amountA);
        _safeTransferFrom(tokenB, msg.sender, address(this), amountB);

        if (pool.totalShares == 0) {
            uint256 initialShares = _sqrt(amountA * amountB);
            require(initialShares > MINIMUM_LIQUIDITY, "DEX: insufficient initial liquidity");
            shares = initialShares - MINIMUM_LIQUIDITY;
            pool.totalShares = initialShares;
            lpShares[key][address(0)] = MINIMUM_LIQUIDITY;
        } else {
            shares = _min(amountA * pool.totalShares / reserveA, amountB * pool.totalShares / reserveB);
            require(shares > 0, "DEX: insufficient liquidity minted");
            pool.totalShares += shares;
        }
        lpShares[key][recipient] += shares;
        _addReserves(pool, tokenA, amountA, tokenB, amountB);
        emit LiquidityAdded(msg.sender, tokenA, tokenB, amountA, amountB, shares);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 shares,
        uint256 amountAMin,
        uint256 amountBMin,
        address recipient,
        uint256 deadline
    ) external lock beforeDeadline(deadline) returns (uint256 amountA, uint256 amountB) {
        require(recipient != address(0), "DEX: zero recipient");
        bytes32 key = _poolKey(tokenA, tokenB);
        Pool storage pool = pools[key];
        require(pool.totalShares > 0 && shares > 0, "DEX: no pool shares");
        require(lpShares[key][msg.sender] >= shares, "DEX: insufficient LP shares");

        (uint256 reserveA, uint256 reserveB) = _reservesFor(pool, tokenA);
        amountA = shares * reserveA / pool.totalShares;
        amountB = shares * reserveB / pool.totalShares;
        require(amountA >= amountAMin && amountB >= amountBMin, "DEX: slippage removing liquidity");

        lpShares[key][msg.sender] -= shares;
        pool.totalShares -= shares;
        _subtractReserves(pool, tokenA, amountA, tokenB, amountB);
        _safeTransferExact(tokenA, recipient, amountA);
        _safeTransferExact(tokenB, recipient, amountB);
        emit LiquidityRemoved(msg.sender, tokenA, tokenB, amountA, amountB, shares);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external lock beforeDeadline(deadline) returns (uint256 amountOut) {
        require(recipient != address(0), "DEX: zero recipient");
        uint256[] memory amounts = _amountsOut(amountIn, path);
        amountOut = amounts[amounts.length - 1];
        require(amountOut >= amountOutMin, "DEX: slippage exceeded");

        _transferExact(path[0], msg.sender, amountIn);
        _applySwaps(path, amounts);
        _safeTransferExact(path[path.length - 1], recipient, amountOut);
        emit Swap(msg.sender, path[0], path[path.length - 1], amountIn, amountOut, recipient);
    }

    function swapExactNativeForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external payable lock beforeDeadline(deadline) returns (uint256 amountOut) {
        require(msg.value > 0 && path.length >= 2 && path[0] == wrappedNative, "DEX: invalid native path");
        require(recipient != address(0), "DEX: zero recipient");
        WrappedGYDS(payable(wrappedNative)).deposit{value: msg.value}();

        uint256[] memory amounts = _amountsOut(msg.value, path);
        amountOut = amounts[amounts.length - 1];
        require(amountOut >= amountOutMin, "DEX: slippage exceeded");
        _applySwaps(path, amounts);
        _safeTransferExact(path[path.length - 1], recipient, amountOut);
        emit Swap(msg.sender, wrappedNative, path[path.length - 1], msg.value, amountOut, recipient);
    }

    function swapExactTokensForNative(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address payable recipient,
        uint256 deadline
    ) external lock beforeDeadline(deadline) returns (uint256 amountOut) {
        require(path.length >= 2 && path[path.length - 1] == wrappedNative, "DEX: invalid native path");
        require(recipient != address(0), "DEX: zero recipient");
        uint256[] memory amounts = _amountsOut(amountIn, path);
        amountOut = amounts[amounts.length - 1];
        require(amountOut >= amountOutMin, "DEX: slippage exceeded");

        _transferExact(path[0], msg.sender, amountIn);
        _applySwaps(path, amounts);
        WrappedGYDS(payable(wrappedNative)).withdraw(amountOut);
        (bool success,) = recipient.call{value: amountOut}("");
        require(success, "DEX: native transfer failed");
        emit Swap(msg.sender, path[0], wrappedNative, amountIn, amountOut, recipient);
    }

    function _amountsOut(uint256 amountIn, address[] calldata path)
        private
        view
        returns (uint256[] memory amounts)
    {
        require(amountIn > 0 && path.length >= 2 && path.length <= 5, "DEX: invalid path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            require(path[i] != address(0) && path[i] != path[i + 1], "DEX: invalid token path");
            for (uint256 j = 0; j < i; j++) {
                require(path[j] != path[i + 1], "DEX: repeated token in path");
            }
            Pool storage pool = pools[_poolKey(path[i], path[i + 1])];
            require(pool.totalShares > 0, "DEX: pool does not exist");
            (uint256 reserveIn, uint256 reserveOut) = _reservesFor(pool, path[i]);
            require(reserveIn > 0 && reserveOut > 0, "DEX: empty pool");
            uint256 amountInWithFee = amounts[i] * FEE_NUMERATOR;
            amounts[i + 1] = amountInWithFee * reserveOut
                / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
            require(amounts[i + 1] > 0, "DEX: output too small");
        }
    }

    function _applySwaps(address[] calldata path, uint256[] memory amounts) private {
        for (uint256 i = 0; i < path.length - 1; i++) {
            Pool storage pool = pools[_poolKey(path[i], path[i + 1])];
            _addReserves(pool, path[i], amounts[i], path[i + 1], 0);
            _subtractReserves(pool, path[i], 0, path[i + 1], amounts[i + 1]);
        }
    }

    function _getOrCreatePool(address tokenA, address tokenB, bytes32 key)
        private
        returns (Pool storage pool)
    {
        pool = pools[key];
        if (pool.token0 == address(0)) {
            (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
            pool.token0 = token0;
            pool.token1 = token1;
            emit PoolCreated(token0, token1);
        }
    }

    function _poolKey(address tokenA, address tokenB) private view returns (bytes32) {
        require(tokenA != address(0) && tokenB != address(0) && tokenA != tokenB, "DEX: invalid token pair");
        require(tokenA.code.length > 0 && tokenB.code.length > 0, "DEX: token is not a contract");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encodePacked(token0, token1));
    }

    function _reservesFor(Pool storage pool, address tokenA)
        private
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        if (tokenA == pool.token0) return (pool.reserve0, pool.reserve1);
        require(tokenA == pool.token1, "DEX: token not in pool");
        return (pool.reserve1, pool.reserve0);
    }

    function _addReserves(Pool storage pool, address tokenA, uint256 amountA, address tokenB, uint256 amountB) private {
        uint256 reserve0 = pool.reserve0;
        uint256 reserve1 = pool.reserve1;
        if (tokenA == pool.token0) {
            reserve0 += amountA;
            reserve1 += amountB;
        } else {
            require(tokenA == pool.token1 && tokenB == pool.token0, "DEX: token order mismatch");
            reserve1 += amountA;
            reserve0 += amountB;
        }
        require(reserve0 <= type(uint112).max && reserve1 <= type(uint112).max, "DEX: reserve overflow");
        pool.reserve0 = uint112(reserve0);
        pool.reserve1 = uint112(reserve1);
    }

    function _subtractReserves(Pool storage pool, address tokenA, uint256 amountA, address tokenB, uint256 amountB) private {
        uint256 reserve0 = pool.reserve0;
        uint256 reserve1 = pool.reserve1;
        if (tokenA == pool.token0) {
            require(tokenB == pool.token1, "DEX: token order mismatch");
            reserve0 -= amountA;
            reserve1 -= amountB;
        } else {
            require(tokenA == pool.token1 && tokenB == pool.token0, "DEX: token order mismatch");
            reserve1 -= amountA;
            reserve0 -= amountB;
        }
        pool.reserve0 = uint112(reserve0);
        pool.reserve1 = uint112(reserve1);
    }

    function _transferExact(address token, address from, uint256 amount) private {
        uint256 balanceBefore = IERC20Like(token).balanceOf(address(this));
        _safeTransferFrom(token, from, address(this), amount);
        uint256 balanceAfter = IERC20Like(token).balanceOf(address(this));
        require(balanceAfter - balanceBefore == amount, "DEX: unsupported transfer-tax token");
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Like.transfer.selector, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "DEX: token transfer failed");
    }

    function _safeTransferExact(address token, address to, uint256 amount) private {
        uint256 balanceBefore = IERC20Like(token).balanceOf(to);
        _safeTransfer(token, to, amount);
        uint256 balanceAfter = IERC20Like(token).balanceOf(to);
        require(balanceAfter - balanceBefore == amount, "DEX: unsupported transfer-tax token");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Like.transferFrom.selector, from, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "DEX: token transferFrom failed");
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value > 3) {
            result = value;
            uint256 estimate = value / 2 + 1;
            while (estimate < result) {
                result = estimate;
                estimate = (value / estimate + estimate) / 2;
            }
        } else if (value != 0) {
            result = 1;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
