// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./MerkleTree.sol";
import "./IWithdrawVerifier.sol";
import "./I1inchRouter.sol";

contract Iceberg is ReentrancyGuard, Ownable, MerkleTree {
    using SafeERC20 for IERC20;

    enum CommitmentState { None, Deposited, Swapped, Withdrawn }

    struct SwapConfig {
        address tokenIn;
        uint256 fixedAmount;
    }

    struct SwapResult {
        address tokenOut;
        uint256 amount;
    }

    event Deposit(bytes32 indexed commitment, uint256 leafIndex, uint256 timestamp, uint256 swapConfigId);
    event SwapResultRecorded(bytes32 indexed nullifierHash, address tokenOut, uint256 amountOut, uint256 timestamp);
    event Withdrawal(bytes32 indexed nullifierHash, address recipient, address tokenOut, uint256 amount);
    event SwapConfigAdded(uint256 indexed configId, address tokenIn, uint256 fixedAmount);

    mapping(bytes32 => CommitmentState) public commitmentStates;
    mapping(bytes32 => SwapResult) public swapResults;
    mapping(bytes32 => uint256) public depositTimestamps;
    mapping(bytes32 => bool) public nullifierHashUsed;
    mapping(uint256 => SwapConfig) public swapConfigs;
    
    uint256 public nextSwapConfigId = 1;
    address public operator;
    IWithdrawVerifier public immutable verifier;
    I1inchRouter public immutable oneInchRouter;

    modifier onlyOperator() {
        require(msg.sender == operator, "Only operator can call this function");
        _;
    }

    constructor(
        IWithdrawVerifier _verifier,
        address _operator,
        I1inchRouter _oneInchRouter
    ) Ownable(msg.sender) MerkleTree() {
        verifier = _verifier;
        operator = _operator;
        oneInchRouter = _oneInchRouter;
    }

    /**
     * @dev User deposits and submits commitment
     * @param commitment User's commitment = hash(nullifier, secret)
     * @param swapConfigId Swap configuration ID
     */
    function deposit(bytes32 commitment, uint256 swapConfigId) external payable nonReentrant {
        require(commitment != 0, "Invalid commitment");
        
        SwapConfig memory config = swapConfigs[swapConfigId];
        
        if (config.tokenIn == address(0)) {
            // ETH deposit
            require(msg.value == config.fixedAmount, "Invalid ETH amount");
        } else {
            // ERC20 deposit
            require(msg.value == 0, "ETH not expected");
            IERC20(config.tokenIn).safeTransferFrom(msg.sender, address(this), config.fixedAmount);
        }

        uint256 leafIndex = _insert(commitment);
        commitmentStates[commitment] = CommitmentState.Deposited;
        depositTimestamps[commitment] = block.timestamp;

        emit Deposit(commitment, leafIndex, block.timestamp, swapConfigId);
    }

    /**
     * @dev Execute swap operation using 1inch aggregator
     * @param nullifierHash User's nullifier hash
     * @param swapConfigId Swap configuration ID
     * @param tokenOut User-specified output token address
     * @param executor 1inch executor address
     * @param desc 1inch swap description
     * @param oneInchData 1inch exchange data
     */
    function executeSwap(
        bytes32 nullifierHash,
        uint256 swapConfigId,
        address tokenOut,
        address executor,
         I1inchRouter.SwapDescription calldata desc,
        bytes calldata oneInchData
    ) external onlyOperator nonReentrant {
        require(!nullifierHashUsed[nullifierHash], "Nullifier already used");
        
        SwapConfig memory config = swapConfigs[swapConfigId];
        require(config.fixedAmount > 0, "Invalid swap config");

        uint256 amountOut;
        
        if (config.tokenIn == address(0)) {
            // ETH -> Token swap
            require(address(this).balance >= config.fixedAmount, "Insufficient ETH balance");
            amountOut = _swapETHForToken(
                executor,
                config.fixedAmount,
                desc,
                oneInchData
            );
        } else if (tokenOut == address(0)) {
            // Token -> ETH swap  
            IERC20 tokenContract = IERC20(config.tokenIn);
            require(tokenContract.balanceOf(address(this)) >= config.fixedAmount, "Insufficient token balance");
            amountOut = _swapTokenForETH(
                executor,
                config.tokenIn,
                config.fixedAmount,
                desc,
                oneInchData
            );
        } else {
            // Token -> Token swap
            IERC20 tokenContract = IERC20(config.tokenIn);
            require(tokenContract.balanceOf(address(this)) >= config.fixedAmount, "Insufficient token balance");
            amountOut = _swapTokenForToken(
                executor,
                config.tokenIn,
                config.fixedAmount,
                desc,
                oneInchData
            );
        }

        // Record swap result
        nullifierHashUsed[nullifierHash] = true;
        swapResults[nullifierHash] = SwapResult({
            tokenOut: tokenOut,
            amount: amountOut
        });

        emit SwapResultRecorded(nullifierHash, tokenOut, amountOut, block.timestamp);
    }

    /**
     * @dev Record swap completion status
     * @param nullifierHash Hash value of nullifier
     * @param tokenOut Output token address
     * @param amountOut Output amount obtained from swap
     */
    function recordSwapResult(
        bytes32 nullifierHash, 
        address tokenOut,
        uint256 amountOut
    ) external onlyOperator nonReentrant {
        require(!nullifierHashUsed[nullifierHash], "Nullifier already used");
        require(amountOut > 0, "Invalid output amount");

        nullifierHashUsed[nullifierHash] = true;
        swapResults[nullifierHash] = SwapResult({
            tokenOut: tokenOut,
            amount: amountOut
        });

        emit SwapResultRecorded(nullifierHash, tokenOut, amountOut, block.timestamp);
    }

    /**
     * @dev User withdraws swapped tokens to new address
     * @param nullifierHash Hash value of nullifier
     * @param recipient Recipient address
     * @param proof ZK proof
     */
    function withdraw(
        bytes32 nullifierHash,
        address recipient,
        uint256[8] calldata proof
    ) external nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(swapResults[nullifierHash].amount > 0, "No swapped amount available");
        require(nullifierHashUsed[nullifierHash], "Swap not executed yet");

        // Verify ZK proof
        uint256[] memory publicInputs = new uint256[](3);
        publicInputs[0] = uint256(merkleRoot);
        publicInputs[1] = uint256(nullifierHash);
        publicInputs[2] = uint256(uint160(recipient));

        require(verifier.verifyProof(proof, publicInputs), "Invalid proof");

        // Get swap result
        SwapResult memory result = swapResults[nullifierHash];
        
        // Delete swap result to prevent double withdrawal
        delete swapResults[nullifierHash];
        
        // Transfer to user based on tokenOut type
        if (result.tokenOut == address(0)) {
            // ETH
            payable(recipient).transfer(result.amount);
        } else {
            // ERC20 Token
            IERC20(result.tokenOut).safeTransfer(recipient, result.amount);
        }

        emit Withdrawal(nullifierHash, recipient, result.tokenOut, result.amount);
    }

    /**
     * @dev Add new swap configuration
     */
    function addSwapConfig(
        address tokenIn,
        uint256 fixedAmount
    ) external onlyOwner returns (uint256) {
        require(fixedAmount > 0, "Invalid fixed amount");
        
        uint256 configId = nextSwapConfigId++;
        swapConfigs[configId] = SwapConfig({
            tokenIn: tokenIn,
            fixedAmount: fixedAmount
        });

        emit SwapConfigAdded(configId, tokenIn, fixedAmount);
        return configId;
    }

    /**
     * @dev Get swap result
     */
    function getSwapResult(bytes32 nullifierHash) external view returns (address tokenOut, uint256 amount) {
        SwapResult memory result = swapResults[nullifierHash];
        return (result.tokenOut, result.amount);
    }

    /**
     * @dev Set operator address
     */
    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Invalid operator address");
        operator = _operator;
    }


    /**
     * @dev Get swap configuration info
     */
    function getSwapConfig(uint256 configId) external view returns (SwapConfig memory) {
        return swapConfigs[configId];
    }

    /**
     * @dev Check if commitment is valid
     */
    function isValidCommitment(bytes32 commitment) external view returns (bool) {
        return commitmentStates[commitment] == CommitmentState.Deposited;
    }

    /**
     * @dev Get current merkle root
     */
    function getMerkleRoot() external view returns (bytes32) {
        return merkleRoot;
    }

    /**
     * @dev ETH -> Token swap via 1inch
     */
    function _swapETHForToken(
        address executor,
        uint256 ethAmount,
        I1inchRouter.SwapDescription calldata desc,
        bytes calldata oneInchData
    ) internal returns (uint256) {
        (uint256 returnAmount,) = oneInchRouter.swap{value: ethAmount}(
            IAggregationExecutor(executor),
            desc,
            oneInchData
        );

        return returnAmount;
    }

    /**
     * @dev Token -> ETH swap via 1inch
     */
    function _swapTokenForETH(
        address executor,
        address tokenIn,
        uint256 tokenAmount,
        I1inchRouter.SwapDescription calldata desc,
        bytes calldata oneInchData
    ) internal returns (uint256) {
        IERC20 tokenContract = IERC20(tokenIn);
        
        // Authorize 1inch token usage
        tokenContract.forceApprove(address(oneInchRouter), tokenAmount);

        (uint256 returnAmount,) = oneInchRouter.swap(
            IAggregationExecutor(executor),
            desc,
            oneInchData
        );

        return returnAmount;
    }

    /**
     * @dev Token -> Token swap via 1inch
     */
    function _swapTokenForToken(
        address executor,
        address tokenIn,
        uint256 tokenAmount,
        I1inchRouter.SwapDescription calldata desc,
        bytes calldata oneInchData
    ) internal returns (uint256) {
        IERC20 tokenContract = IERC20(tokenIn);
        
        // Authorize 1inch token usage
        tokenContract.forceApprove(address(oneInchRouter), tokenAmount);

        (uint256 returnAmount,) = oneInchRouter.swap(
            IAggregationExecutor(executor),
            desc,
            oneInchData
        );

        return returnAmount;
    }

    // Receive ETH
    receive() external payable {}
}