import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getErrorMessage } from '../../scripts/utils/errorUtils';

/**
 * circuit input interface (contains public and private inputs)
 */
export interface CircuitInput {
    // public inputs
    merkleRoot: string;
    nullifierHash: string;
    recipient: string;
    // private inputs
    nullifier: string;
    secret: string;
    pathElements: string[];
    pathIndices: number[];
}

/**
 * proof result interface
 */
export interface ProofResult {
    proof: any;
    publicSignals: string[];
    runDirectory: string;
}

/**
 * formatted proof interface (for smart contract)
 */
export interface FormattedProof {
    a: [string, string];
    b: [[string, string], [string, string]];
    c: [string, string];
}

/**
 * circuit information interface
 */
export interface CircuitInfo {
    circuitSize: number;
    powersOfTau: string;
    supportedConstraints: number;
    circuitsRoot: string;
}

/**
 * ZK proof generation utilities for Mainnet
 * ZK Proof Generation Utilities for Mainnet
 */
export class ZKProofGenerator {
    private circuitsRoot: string;
    private keysPath: string;
    private buildPath: string;
    private runsPath: string;

    constructor(circuitsRoot: string = path.join(__dirname, '..')) {
        this.circuitsRoot = circuitsRoot;
        this.keysPath = path.join(circuitsRoot, 'keys', 'withdraw');
        this.buildPath = path.join(circuitsRoot, 'build', 'withdraw');
        this.runsPath = path.join(circuitsRoot, 'runs');
        
        this.validateSetup();
    }

    /**
     * validate system setup is complete
     */
    private validateSetup(): void {
        const requiredFiles = [
            path.join(this.keysPath, 'withdraw_0001.zkey'),
            path.join(this.keysPath, 'withdraw_verification_key.json'),
            path.join(this.buildPath, 'withdraw_js', 'withdraw.wasm')
        ];

        for (const file of requiredFiles) {
            if (!fs.existsSync(file)) {
                throw new Error(`Required file not found: ${file}. Please run circuit setup first.`);
            }
        }
    }

    /**
     * create new run directory
     */
    private createRunDirectory(): string {
        if (!fs.existsSync(this.runsPath)) {
            fs.mkdirSync(this.runsPath, { recursive: true });
        }

        let runCounter = 1;
        let runDir: string;
        do {
            const runNumber = runCounter.toString().padStart(3, '0');
            runDir = path.join(this.runsPath, `run_${runNumber}`);
            runCounter++;
        } while (fs.existsSync(runDir));

        // create run directory structure
        fs.mkdirSync(runDir, { recursive: true });
        fs.mkdirSync(path.join(runDir, 'witnesses'), { recursive: true });
        fs.mkdirSync(path.join(runDir, 'proofs'), { recursive: true });
        fs.mkdirSync(path.join(runDir, 'inputs'), { recursive: true });

        return runDir;
    }

    /**
     * generate ZK proof
     */
    async generateProof(circuitInput: CircuitInput): Promise<ProofResult> {
        console.log('🔗 Generating ZK proof...');
        
        // create new run directory
        const runDir = this.createRunDirectory();
        console.log(`📁 Created run directory: ${path.basename(runDir)}`);

        try {
            // 1. save input file
            const inputFile = path.join(runDir, 'inputs', 'input.json');
            fs.writeFileSync(inputFile, JSON.stringify(circuitInput, null, 2));
            
            // 2. generate witness
            console.log('🔄 Step 1: Generating witness...');
            const witnessFile = path.join(runDir, 'witnesses', 'witness.wtns');
            const wasmFile = path.join(this.buildPath, 'withdraw_js', 'withdraw.wasm');
            
            execSync(`snarkjs wtns calculate "${wasmFile}" "${inputFile}" "${witnessFile}"`, {
                stdio: 'inherit',
                cwd: this.circuitsRoot
            });

            // 3. generate proof
            console.log('🔄 Step 2: Generating proof...');
            const proofFile = path.join(runDir, 'proofs', 'proof.json');
            const publicFile = path.join(runDir, 'proofs', 'public.json');
            const zkeyFile = path.join(this.keysPath, 'withdraw_0001.zkey');

            execSync(`snarkjs groth16 prove "${zkeyFile}" "${witnessFile}" "${proofFile}" "${publicFile}"`, {
                stdio: 'inherit',
                cwd: this.circuitsRoot
            });

            // 4. read generated proof and public signals
            const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
            const publicSignals = JSON.parse(fs.readFileSync(publicFile, 'utf8'));

            console.log('✅ Proof generated successfully!');
            console.log(`📁 Files saved in: ${runDir}`);

            return {
                proof,
                publicSignals,
                runDirectory: runDir
            };

        } catch (error) {
            console.error('❌ Error generating proof:', getErrorMessage(error));
            throw error;
        }
    }

    /**
     * verify ZK proof
     */
    async verifyProof(proof: any, publicSignals: string[]): Promise<boolean> {
        console.log('🔍 Verifying proof...');
        
        try {
            // create temporary file
            const tempDir = path.join(this.runsPath, 'temp_verify');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const proofFile = path.join(tempDir, 'proof.json');
            const publicFile = path.join(tempDir, 'public.json');
            const vkFile = path.join(this.keysPath, 'withdraw_verification_key.json');

            // write temporary file
            fs.writeFileSync(proofFile, JSON.stringify(proof, null, 2));
            fs.writeFileSync(publicFile, JSON.stringify(publicSignals, null, 2));

            // execute verification
            execSync(`snarkjs groth16 verify "${vkFile}" "${publicFile}" "${proofFile}"`, {
                stdio: 'inherit',
                cwd: this.circuitsRoot
            });

            // clean temporary file
            fs.rmSync(tempDir, { recursive: true, force: true });

            console.log('✅ Proof verification successful!');
            return true;

        } catch (error) {
            console.error('❌ Proof verification failed:', getErrorMessage(error));
            return false;
        }
    }

    /**
     * format proof for smart contract call
     */
    formatProofForContract(proof: any): FormattedProof {
        return {
            a: [proof.pi_a[0], proof.pi_a[1]],
            b: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
            c: [proof.pi_c[0], proof.pi_c[1]]
        };
    }

    /**
     * get circuit information
     */
    getCircuitInfo(): CircuitInfo {
        return {
            circuitSize: 4207,
            powersOfTau: 'pot13_final.ptau',
            supportedConstraints: 8192,
            circuitsRoot: this.circuitsRoot
        };
    }
}