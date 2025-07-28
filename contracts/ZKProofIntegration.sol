// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "./Groth16Verifier.sol";

/**
 * @title ZKProofIntegration
 * @dev Contract integrating ZK proof verification
 */
contract ZKProofIntegration {
    Groth16Verifier public withdrawVerifier;
    
    mapping(bytes32 => bool) public nullifierHashUsed;
    
    event ProofVerified(address indexed user, bytes32 nullifierHash, uint256 timestamp);
    event WithdrawalAuthorized(address indexed user, bytes32 nullifierHash, uint256 amount);
    
    constructor(address _withdrawVerifier) {
        withdrawVerifier = Groth16Verifier(_withdrawVerifier);
    }
    
    /**
     * @dev Verify withdraw proof
     * @param _pA ZK proof element A
     * @param _pB ZK proof element B
     * @param _pC ZK proof element C
     * @param publicSignals Public signals [merkleRoot, nullifierHash, recipient]
     */
    function verifyWithdraw(
        uint[2] memory _pA,
        uint[2][2] memory _pB,
        uint[2] memory _pC,
        uint[3] memory publicSignals
    ) external returns (bool) {
        bytes32 nullifierHash = bytes32(publicSignals[1]); // nullifierHash at position 2
        require(!nullifierHashUsed[nullifierHash], "Nullifier already used");
        
        // Verify ZK proof
        bool isValid = withdrawVerifier.verifyProof(_pA, _pB, _pC, publicSignals);
        require(isValid, "Invalid ZK proof");
        
        // Mark nullifier as used
        nullifierHashUsed[nullifierHash] = true;
        
        emit ProofVerified(msg.sender, nullifierHash, block.timestamp);
        emit WithdrawalAuthorized(msg.sender, nullifierHash, 0); // amount can be set as needed
        
        return true;
    }
    
    /**
     * @dev Update verifier address (admin only)
     * @param _withdrawVerifier New withdraw verifier address
     */
    function updateVerifier(address _withdrawVerifier) external {
        // Can add onlyOwner modifier here
        withdrawVerifier = Groth16Verifier(_withdrawVerifier);
    }
    
    /**
     * @dev Check if nullifier is already used
     * @param nullifierHash Nullifier hash
     * @return Whether already used
     */
    function isNullifierUsed(bytes32 nullifierHash) external view returns (bool) {
        return nullifierHashUsed[nullifierHash];
    }
}