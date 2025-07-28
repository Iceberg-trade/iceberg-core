// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

contract MerkleTree {
    uint256 public constant TREE_HEIGHT = 5;
    uint256 public constant MAX_LEAVES = 2**TREE_HEIGHT;

    bytes32[TREE_HEIGHT] public filledSubtrees;
    bytes32 public merkleRoot;
    uint256 public currentCommitmentIndex;

    mapping(uint256 => bytes32) public nodes;
    mapping(uint256 => bool) public filled;

    constructor() {
        bytes32 currentZero = bytes32(0);
        filledSubtrees[0] = currentZero;

        for (uint256 i = 1; i < TREE_HEIGHT; i++) {
            currentZero = poseidonHash(currentZero, currentZero);
            filledSubtrees[i] = currentZero;
        }

        merkleRoot = currentZero;
    }

    function poseidonHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return bytes32(PoseidonT3.hash([uint256(left), uint256(right)]));
    }

    function getDefaultHashAtLevel(uint256 level) public view returns (bytes32) {
        return filledSubtrees[level];
    }

    function _insert(bytes32 commitment) internal returns (uint256) {
        require(currentCommitmentIndex < MAX_LEAVES, "Merkle tree is full");

        uint256 index = currentCommitmentIndex;
        bytes32 currentHash = commitment;

        for (uint256 level = 0; level < TREE_HEIGHT; level++) {
            uint256 nodeKey = level * MAX_LEAVES + index;
            nodes[nodeKey] = currentHash;
            filled[nodeKey] = true;

            if (index % 2 == 0) {
                // Current is left node, waiting for right node
                filledSubtrees[level] = currentHash;
                currentHash = poseidonHash(currentHash, getDefaultHashAtLevel(level));
            } else {
                // Current is right node, merge with left sibling
                bytes32 left = nodes[level * MAX_LEAVES + (index - 1)];
                currentHash = poseidonHash(left, currentHash);
            }

            index /= 2;
        }

        merkleRoot = currentHash;
        currentCommitmentIndex++;
        return currentCommitmentIndex - 1;
    }

    function insertCommitment(bytes32 commitment) external returns (uint256) {
        return _insert(commitment);
    }

    function getMerkleProof(uint256 leafIndex)
        external
        view
        returns (
            bytes32[TREE_HEIGHT] memory proof,
            bool[TREE_HEIGHT] memory pathIndices
        )
    {
        require(leafIndex < currentCommitmentIndex, "Invalid leaf index");

        uint256 currentIndex = leafIndex;

        for (uint256 i = 0; i < TREE_HEIGHT; i++) {
            uint256 siblingIndex;
            if (currentIndex % 2 == 0) {
                siblingIndex = currentIndex + 1;
                pathIndices[i] = false;
            } else {
                siblingIndex = currentIndex - 1;
                pathIndices[i] = true;
            }

            uint256 siblingKey = i * MAX_LEAVES + siblingIndex;
            proof[i] = filled[siblingKey]
                ? nodes[siblingKey]
                : getDefaultHashAtLevel(i);

            currentIndex /= 2;
        }
    }

    function verifyMerkleProof(
        bytes32 leaf,
        bytes32[TREE_HEIGHT] memory proof,
        bool[TREE_HEIGHT] memory pathIndices
    ) public view returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < TREE_HEIGHT; i++) {
            bytes32 sibling = proof[i];
            if (pathIndices[i]) {
                computedHash = poseidonHash(sibling, computedHash);
            } else {
                computedHash = poseidonHash(computedHash, sibling);
            }
        }

        return computedHash == merkleRoot;
    }

    function getTreeInfo() external view returns (bytes32 root, uint256 leafCount) {
        return (merkleRoot, currentCommitmentIndex);
    }

    function getNode(uint256 level, uint256 index) external view returns (bytes32) {
        uint256 key = level * MAX_LEAVES + index;
        return filled[key] ? nodes[key] : getDefaultHashAtLevel(level);
    }
}
