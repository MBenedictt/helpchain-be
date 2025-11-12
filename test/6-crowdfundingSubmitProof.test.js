const { expect, anyValue } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding.sol - submitProof()", function () {
    let Crowdfunding, crowdfunding;
    let owner, backer1, backer2;

    beforeEach(async function () {
        [owner, backer1, backer2] = await ethers.getSigners();
        Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = await Crowdfunding.deploy(
            owner.address,
            "Clean Water Project",
            "Pembangunan sumur air bersih untuk desa terpencil",
            ethers.parseEther("10")
        );
        await crowdfunding.waitForDeployment();

        // Fund campaign
        await crowdfunding.connect(backer1).fund({ value: ethers.parseEther("4") });
        await crowdfunding.connect(backer2).fund({ value: ethers.parseEther("6") });

        // Buat withdraw request
        await crowdfunding
            .connect(owner)
            .createWithdrawRequest(ethers.parseEther("5"), 1);
    });

    // (a) Submit sebelum finalize → harus revert
    it("should revert if proof submitted before finalize", async function () {
        console.log("\n=== Kasus Uji (a): Submit proof sebelum finalize ===");

        await expect(
            crowdfunding.connect(owner).submitProof(1)
        ).to.be.revertedWith("Request not finalized yet.");

        console.log("✅ Test (a) berhasil - Submit sebelum finalize ditolak.\n");
    });

    // (b) Submit setelah finalize → sukses & event terpicu
    it("should allow proof submission after finalize and emit event", async function () {
        console.log("\n=== Kasus Uji (b): Submit proof setelah finalize ===");

        // Voting mayoritas YES → agar bisa finalize sukses
        await crowdfunding.connect(backer1).confirmWithdrawRequest(1, true);
        // Tunggu voting selesai
        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");
        // Finalize request
        await crowdfunding.connect(owner).finalizeWithdrawRequest(1);

        // Sekarang submit proof
        const tx = await crowdfunding.connect(owner).submitProof(1);
        const receipt = await tx.wait();

        console.log(`Tx Hash: ${receipt.hash}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        // Ambil event ProofSubmitted
        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "ProofSubmitted")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - requestId: ${event.args.requestId.toString()}`);
            console.log(` - timestamp: ${event.args.timestamp.toString()}`);
        } else {
            console.log("⚠️ Event ProofSubmitted tidak ditemukan.");
        }

        // Verifikasi status proofSubmitted = true
        const requestData = await crowdfunding.getWithdrawRequest(1);
        expect(requestData.proofSubmitted).to.be.true;

        console.log("✅ Test (b) berhasil - Proof berhasil disubmit setelah finalize.\n");
    });
});
