// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Testnet-only TGYD token with an immutable 1,000,000-token supply cap.
/// Initial supply and cap constructor arguments are whole-token amounts.
contract TGYDTestToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    uint256 public immutable maxSupply;
    uint256 public constant faucetClaimAmount = 100;
    uint256 public constant faucetCooldown = 1 days;
    address public owner;
    bool public mintable;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public lastFaucetClaimAt;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "TGYD: caller is not the owner");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        uint256 maxSupply_,
        bool mintable_
    ) {
        require(bytes(name_).length > 0, "TGYD: name cannot be empty");
        require(bytes(symbol_).length > 0, "TGYD: symbol cannot be empty");
        require(decimals_ <= 18, "TGYD: decimals must be <= 18");
        require(maxSupply_ > 0, "TGYD: max supply must be positive");
        require(initialSupply_ <= maxSupply_, "TGYD: initial supply exceeds cap");

        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        owner = msg.sender;
        mintable = mintable_;
        maxSupply = maxSupply_ * (10 ** uint256(decimals_));

        uint256 initialSupplyRaw = initialSupply_ * (10 ** uint256(decimals_));
        totalSupply = initialSupplyRaw;
        balanceOf[msg.sender] = initialSupplyRaw;
        emit Transfer(address(0), msg.sender, initialSupplyRaw);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "TGYD: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 wholeTokens) external onlyOwner {
        require(mintable, "TGYD: minting disabled");
        require(to != address(0), "TGYD: mint to zero address");
        _mint(to, wholeTokens * (10 ** uint256(decimals)));
    }

    function mintRaw(address to, uint256 rawAmount) external onlyOwner {
        require(mintable, "TGYD: minting disabled");
        require(to != address(0), "TGYD: mint to zero address");
        require(rawAmount > 0, "TGYD: amount must be positive");
        _mint(to, rawAmount);
    }

    function supportsRawMint() external pure returns (bool) {
        return true;
    }

    /// @notice Relayer-friendly Testnet claim; each recipient can claim once per day.
    function claimFaucet(address recipient) external {
        require(recipient != address(0), "TGYD: faucet recipient is zero address");
        require(
            block.timestamp >= lastFaucetClaimAt[recipient] + faucetCooldown,
            "TGYD: faucet cooldown active"
        );
        lastFaucetClaimAt[recipient] = block.timestamp;
        _mint(recipient, faucetClaimAmount * (10 ** uint256(decimals)));
    }

    function burn(uint256 rawAmount) external {
        require(balanceOf[msg.sender] >= rawAmount, "TGYD: insufficient balance");
        balanceOf[msg.sender] -= rawAmount;
        totalSupply -= rawAmount;
        emit Burn(msg.sender, rawAmount);
        emit Transfer(msg.sender, address(0), rawAmount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "TGYD: new owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }

    function _mint(address to, uint256 rawAmount) internal {
        require(rawAmount > 0, "TGYD: amount must be positive");
        require(totalSupply + rawAmount <= maxSupply, "TGYD: supply cap exceeded");
        totalSupply += rawAmount;
        balanceOf[to] += rawAmount;
        emit Mint(to, rawAmount);
        emit Transfer(address(0), to, rawAmount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "TGYD: transfer from zero address");
        require(to != address(0), "TGYD: transfer to zero address");
        require(balanceOf[from] >= amount, "TGYD: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
