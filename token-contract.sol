// SPDX-License-Identifier: MIT
// ============================================================
// GYDS Network — Standard ERC-20 Token Contract
// ============================================================
// Compatible with Solidity ^0.8.20
// Deploy via Remix IDE, hardhat, or the geth console.
//
// Features:
//   - Standard ERC-20 (transfer, approve, transferFrom)
//   - Configurable name, symbol, decimals, initial supply
//   - Optional: set MINTABLE = true to allow the owner to mint more tokens
//   - Owner can transfer ownership
//
// To deploy on GYDS Network in Remix:
//   1. Open https://remix.ethereum.org
//   2. Paste this file
//   3. Compile with Solidity 0.8.20+
//   4. Connect MetaMask to GYDS Network (RPC: https://rpc.netlifegy.com, Chain ID: 29987)
//   5. Deploy with your desired constructor arguments
// ============================================================
pragma solidity ^0.8.20;

contract GYDSToken {

    // ── Token metadata ───────────────────────────────────────
    string  public name;
    string  public symbol;
    uint8   public decimals;
    uint256 public totalSupply;

    // ── Ownership & minting ──────────────────────────────────
    address public owner;
    bool    public mintable;

    // ── ERC-20 state ─────────────────────────────────────────
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ── Events ───────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    // ── Modifiers ────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "GYDSToken: caller is not the owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────
    /**
     * @param name_          Token name (e.g. "Gold Token")
     * @param symbol_        Token symbol (e.g. "GLD")
     * @param decimals_      Decimal places (usually 18)
     * @param initialSupply  Initial supply in whole tokens (scaled by 10^decimals internally)
     * @param mintable_      If true, the owner can mint additional tokens later
     */
    constructor(
        string  memory name_,
        string  memory symbol_,
        uint8          decimals_,
        uint256        initialSupply,
        bool           mintable_
    ) {
        require(bytes(name_).length   > 0, "GYDSToken: name cannot be empty");
        require(bytes(symbol_).length > 0, "GYDSToken: symbol cannot be empty");
        require(decimals_            <= 18, "GYDSToken: decimals must be <= 18");

        name      = name_;
        symbol    = symbol_;
        decimals  = decimals_;
        mintable  = mintable_;
        owner     = msg.sender;

        uint256 rawSupply = initialSupply * (10 ** uint256(decimals_));
        totalSupply             = rawSupply;
        balanceOf[msg.sender]   = rawSupply;

        emit Transfer(address(0), msg.sender, rawSupply);
    }

    // ── ERC-20 core ──────────────────────────────────────────
    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "GYDSToken: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "GYDSToken: transfer from zero address");
        require(to   != address(0), "GYDSToken: transfer to zero address");
        require(balanceOf[from] >= amount, "GYDSToken: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    // ── Minting ──────────────────────────────────────────────
    /**
     * Mint additional tokens. Only callable by the owner when mintable = true.
     * @param to     Recipient address
     * @param amount Amount in whole tokens (scaled by decimals internally)
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(mintable, "GYDSToken: token is not mintable");
        require(to != address(0), "GYDSToken: mint to zero address");
        uint256 raw = amount * (10 ** uint256(decimals));
        totalSupply        += raw;
        balanceOf[to]      += raw;
        emit Mint(to, raw);
        emit Transfer(address(0), to, raw);
    }

    // ── Burning ──────────────────────────────────────────────
    /**
     * Burn tokens from the caller's balance.
     * @param amount Amount in raw units (including decimals)
     */
    function burn(uint256 amount) public {
        require(balanceOf[msg.sender] >= amount, "GYDSToken: insufficient balance to burn");
        balanceOf[msg.sender] -= amount;
        totalSupply           -= amount;
        emit Burn(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    // ── Ownership ────────────────────────────────────────────
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "GYDSToken: new owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }
}
