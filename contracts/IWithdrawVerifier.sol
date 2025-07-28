// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * @title IWithdrawVerifier
 * @dev ZK proof verifier interface
 */
interface IWithdrawVerifier {
    /**
     * @dev Verify withdrawal ZK proof
     * @param proof ZK proof array
     * @param publicInputs Public inputs: [merkleRoot, nullifierHash, recipient]
     * @return Whether verification passes
     */
    function verifyProof(
        uint256[8] calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool);
}