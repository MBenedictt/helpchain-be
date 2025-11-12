const { expect, anyValue } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding.sol - createWithdrawRequest()", function () {
    let Crowdfunding, crowdfunding;
    let owner, backer1, backer2;

    beforeEach(async function () {
        [owner, backer1, backer2] = await ethers.getSigners();
        Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = await Crowdfunding.deploy(
            owner.address,
            "Clean Water Project",
            "Pembangunan sumur air bersih untuk desa terpencil",
            1000
        );
        await crowdfunding.waitForDeployment();

        // Tambah saldo kontrak biar bisa buat withdraw request
        await crowdfunding.connect(backer1).fund({ value: 500 });
        await crowdfunding.connect(backer2).fund({ value: 700 });
    });

    // (a) Owner membuat request pertama dengan saldo cukup
    it("should allow owner to create a valid withdraw request", async function () {
        console.log("\n=== Kasus Uji (a): Owner membuat request pertama ===");

        const withdrawAmount = 300;
        const votingDuration = 60; // 60 detik (dummy)

        const tx = await crowdfunding
            .connect(owner)
            .createWithdrawRequest(withdrawAmount, votingDuration);

        const receipt = await tx.wait();

        console.log(`Tx Hash: ${receipt.hash}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        // Cek event WithdrawRequested
        const event = receipt.logs
            .map((log) => {
                try {
                    return crowdfunding.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter((e) => e && e.name === "WithdrawRequested")[0];

        if (event) {
            console.log(`Event emitted: ${event.name}`);
            console.log(` - requestId: ${event.args.requestId.toString()}`);
            console.log(` - amount: ${event.args.amount.toString()}`);
            console.log(` - deadline: ${event.args.deadline.toString()}`);
        } else {
            console.log("⚠️ Event WithdrawRequested tidak ditemukan.");
        }

        const count = await crowdfunding.withdrawRequestCount();
        expect(count).to.equal(1);

        console.log("✅ Test (a) berhasil - request pertama dibuat dengan benar.\n");
    });

    // (b) Non-owner mencoba membuat request
    it("should revert if non-owner tries to create a request", async function () {
        console.log("\n=== Kasus Uji (b): Non-owner mencoba membuat request ===");

        const withdrawAmount = 200;
        const votingDuration = 60;

        await expect(
            crowdfunding
                .connect(backer1)
                .createWithdrawRequest(withdrawAmount, votingDuration)
        ).to.be.revertedWith("You are not the owner.");

        console.log("✅ Test (b) berhasil - Non-owner ditolak sesuai logika.\n");
    });

    // (c) Owner membuat request kedua sebelum yang pertama diselesaikan
    it("should revert if owner creates new request before previous finalized", async function () {
        console.log(
            "\n=== Kasus Uji (c): Owner mencoba request kedua sebelum finalize ==="
        );

        const withdrawAmount = 300;
        const votingDuration = 60;

        // Buat request pertama
        await crowdfunding
            .connect(owner)
            .createWithdrawRequest(withdrawAmount, votingDuration);

        // Coba langsung buat request kedua tanpa finalize
        await expect(
            crowdfunding
                .connect(owner)
                .createWithdrawRequest(200, 60)
        ).to.be.revertedWith("Previous request not finalized.");

        console.log("✅ Test (c) berhasil - request kedua ditolak karena belum finalize.\n");
    });
});
