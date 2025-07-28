// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "./IWithdrawVerifier.sol";

/**
 * @dev WithdrawVerifier interface definition
 */
interface IWithdrawVerifierGroth16 {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[3] calldata _pubSignals
    ) external view returns (bool);
}


/**
 * @title WithdrawVerifierAdapter
 * @dev Adapter contract to adapt Groth16Verifier to existing IWithdrawVerifier interface
 */
contract WithdrawVerifierAdapter is IWithdrawVerifier {
    
    IWithdrawVerifierGroth16 public immutable withdrawVerifier;
    
    /**
     * @dev Constructor
     * @param _verifier WithdrawVerifier contract address
     */
    constructor(address _verifier) {
        withdrawVerifier = IWithdrawVerifierGroth16(_verifier);
    }
    
    /**
     * @dev Verify withdrawal ZK proof
     * @param proof ZK proof array [8]uint256 -> convert to Groth16 format
     * @param publicInputs Public inputs: [merkleRoot, nullifierHash, recipient]
     * @return Whether verification passes
     */
    function verifyProof(
        uint256[8] calldata proof,
        uint256[] calldata publicInputs
    ) external view override returns (bool) {
        
        // Convert proof[8] to Groth16 format
        uint[2] memory _pA = [proof[0], proof[1]];
        uint[2][2] memory _pB = [[proof[2], proof[3]], [proof[4], proof[5]]];
        uint[2] memory _pC = [proof[6], proof[7]];
        
        // Withdraw circuit has 3 public signals: [merkleRoot, nullifierHash, recipient]
        require(publicInputs.length >= 3, "Invalid public inputs for withdraw circuit");
        uint[3] memory _pubSignals = [
            publicInputs[0], // merkleRoot
            publicInputs[1], // nullifierHash
            publicInputs[2]  // recipient
        ];
        
        return withdrawVerifier.verifyProof(_pA, _pB, _pC, _pubSignals);
    }
}