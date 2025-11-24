// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Crowdfunding {
    string public campaign;
    string public description;
    uint256 public goal;
    address public owner;
    uint256 public compoundingContributions;

    enum CampaignState { Active, Completed, Failed }
    CampaignState public state;

    struct Backer {
        uint256 totalContribution;
        uint256 usedContribution; 
    }

    mapping(address => Backer) public backers;

    address[] public backersList;
    mapping(address => bool) public isBacker;

    uint256 public totalContributions;

    struct WithdrawRequest {
        uint256 id;
        uint256 amount;
        uint256 yesWeight;
        uint256 noWeight;
        uint256 createdAt;
        uint256 votingDeadline;
        bool finalized;
        bool proofSubmitted;
        mapping(address => uint8) votes;
    }

    uint256 public withdrawRequestCount;
    mapping(uint256 => WithdrawRequest) private withdrawRequests;

    // Events
    event DonationReceived(address indexed backer, uint256 amount, uint256 timestamp);
    event WithdrawRequested(uint256 indexed requestId, uint256 amount, uint256 deadline, uint256 timestamp);
    event WithdrawConfirmed(uint256 indexed requestId, address indexed backer, bool approve, uint256 weight);
    event WithdrawFinalized(uint256 indexed requestId, bool success, uint256 timestamp);
    event ProofSubmitted(uint256 indexed requestId, uint256 timestamp);
    event RefundClaimed(address indexed backer, uint256 amount);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner.");
        _;
    }

    constructor(
        address _owner,
        string memory _name,
        string memory _description,
        uint256 _goal
    ) {
        campaign = _name;
        description = _description;
        goal = _goal;
        owner = _owner;
        state = CampaignState.Active;
    }

    function fund() public payable {
        require(msg.value > 0, "Must fund amount greater than 0.");

        // add new backer to list for iteration
        if (!isBacker[msg.sender]) {
            isBacker[msg.sender] = true;
            backersList.push(msg.sender);
        }

        backers[msg.sender].totalContribution += msg.value;
        totalContributions += msg.value;
        compoundingContributions += msg.value;

        emit DonationReceived(msg.sender, msg.value, block.timestamp);
    }

    function createWithdrawRequest(uint256 _amount, uint256 _votingDuration) external onlyOwner {
        require(address(this).balance >= _amount, "Insufficient contract balance.");
        require(state == CampaignState.Active, "Campaign not active.");

        if (withdrawRequestCount > 0) {
            WithdrawRequest storage prev = withdrawRequests[withdrawRequestCount];
            require(prev.finalized, "Previous request not finalized.");
            require(prev.proofSubmitted, "Previous proof not submitted.");
        }

        withdrawRequestCount++;
        WithdrawRequest storage req = withdrawRequests[withdrawRequestCount];
        req.id = withdrawRequestCount;
        req.amount = _amount;
        req.createdAt = block.timestamp;
        req.votingDeadline = block.timestamp + _votingDuration; // seconds
        req.finalized = false;
        req.yesWeight = 0;
        req.noWeight = 0;

        emit WithdrawRequested(req.id, _amount, req.votingDeadline, block.timestamp);
    }

    function confirmWithdrawRequest(uint256 _id, bool approve) external {
        require(_id > 0 && _id <= withdrawRequestCount, "Invalid request id.");
        WithdrawRequest storage req = withdrawRequests[_id];
        require(!req.finalized, "Request already finalized.");
        require(isBacker[msg.sender], "Not a backer.");
        uint8 previous = req.votes[msg.sender];
        require(previous == 0, "Already confirmed."); // only once

        uint256 weight = backers[msg.sender].totalContribution;
        require(weight > 0, "No contribution to weight.");

        if (approve) {
            req.yesWeight += weight;
            req.votes[msg.sender] = 1;
        } else {
            req.noWeight += weight;
            req.votes[msg.sender] = 2;
        }

        emit WithdrawConfirmed(_id, msg.sender, approve, weight);
    }

    function finalizeWithdrawRequest(uint256 _id) external onlyOwner {
        require(_id > 0 && _id <= withdrawRequestCount, "Invalid request id.");
        WithdrawRequest storage req = withdrawRequests[_id];
        require(!req.finalized, "Already finalized.");
        require(state == CampaignState.Active, "Campaign not active.");
        require(block.timestamp >= req.votingDeadline, "Voting period not ended.");

        req.finalized = true;

        uint256 explicitYes = req.yesWeight;

        uint256 totalYesWeight = explicitYes;

        if (totalYesWeight > totalContributions) {
            totalYesWeight = totalContributions;
        }

        if (totalYesWeight >= req.amount && totalYesWeight > 0) {
            uint256 n = backersList.length;
            require(n > 0, "No backers available.");

            uint256[] memory shares = new uint256[](n);
            uint256 distributedLocal = 0;
            uint256 largestIdx = type(uint256).max;
            uint256 largestContribution = 0;

            for (uint256 i = 0; i < n; i++) {
                address baddr = backersList[i];
                uint8 v = req.votes[baddr];

                if (v == 1) {
                    uint256 contrib = backers[baddr].totalContribution;
                    if (contrib == 0) {
                        shares[i] = 0;
                        continue;
                    }

                    uint256 share = (contrib * req.amount) / totalYesWeight;
                    shares[i] = share;
                    distributedLocal += share;

                    if (contrib > largestContribution) {
                        largestContribution = contrib;
                        largestIdx = i;
                    }
                } else {
                    shares[i] = 0;
                }
            }

            if (distributedLocal < req.amount) {
                uint256 remainder = req.amount - distributedLocal;
                require(largestIdx != type(uint256).max, "No YES approver available for remainder");
                address largestAddr = backersList[largestIdx];

                require(
                    backers[largestAddr].totalContribution >= shares[largestIdx] + remainder,
                    "Largest approver has insufficient contribution for remainder"
                );
                shares[largestIdx] += remainder;
                distributedLocal += remainder;
            }

            require(distributedLocal == req.amount, "Distributed mismatch.");

            for (uint256 i = 0; i < n; i++) {
                uint256 s = shares[i];
                if (s == 0) continue;
                address baddr = backersList[i];

                require(backers[baddr].totalContribution >= s, "Insufficient contribution during commit");
                backers[baddr].totalContribution -= s;
                backers[baddr].usedContribution += s;
            }

            totalContributions -= req.amount;

            (bool sent, ) = owner.call{value: req.amount}("");
            require(sent, "Transfer failed");

            emit WithdrawFinalized(_id, true, block.timestamp);
        } else {
            state = CampaignState.Failed;
            emit WithdrawFinalized(_id, false, block.timestamp);
        }
    }

    function submitProof(uint256 _id) external onlyOwner {
        require(_id > 0 && _id <= withdrawRequestCount, "Invalid request id.");
        WithdrawRequest storage req = withdrawRequests[_id];
        require(req.finalized, "Request not finalized yet.");
        require(!req.proofSubmitted, "Proof already submitted.");

        req.proofSubmitted = true;

        emit ProofSubmitted(_id, block.timestamp);
    }

    function getWithdrawRequest(uint256 _id) external view returns (
        uint256 id,
        uint256 amount,
        uint256 yesWeight,
        uint256 noWeight,
        uint256 createdAt,
        uint256 votingDeadline,
        bool finalized,
        bool proofSubmitted
    ) {
        require(_id > 0 && _id <= withdrawRequestCount, "Invalid id.");
        WithdrawRequest storage req = withdrawRequests[_id];
        id = req.id;
        amount = req.amount;
        yesWeight = req.yesWeight;
        noWeight = req.noWeight;
        createdAt = req.createdAt;
        votingDeadline = req.votingDeadline;
        finalized = req.finalized;
        proofSubmitted = req.proofSubmitted;
    }

    function getVote(uint256 _id, address _voter) external view returns (uint8) {
        require(_id > 0 && _id <= withdrawRequestCount, "Invalid id.");
        WithdrawRequest storage req = withdrawRequests[_id];
        return req.votes[_voter];
    }

    function refund() public {
        bool eligible = false;

        if (state == CampaignState.Failed) {
            eligible = true;
        } else {
            for (uint256 i = 1; i <= withdrawRequestCount; i++) {
                WithdrawRequest storage req = withdrawRequests[i];
                uint8 v = req.votes[msg.sender];
                if (v == 2 || v == 0) {
                    eligible = true;
                    break;
                }
            }
        }

        require(eligible, "Refund not allowed.");

        uint256 amount = backers[msg.sender].totalContribution;
        require(amount > 0, "Nothing to refund.");

        backers[msg.sender].totalContribution = 0;
        totalContributions -= amount;
        compoundingContributions -= amount;

        payable(msg.sender).transfer(amount);

        emit RefundClaimed(msg.sender, amount);
    }

    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function getBackersCount() external view returns (uint256) {
        return backersList.length;
    }

    function getBackerAt(uint256 i) external view returns (address) {
        require(i < backersList.length, "Index out of bounds.");
        return backersList[i];
    }

    function getCompoundingContributions() external view returns (uint256) {
        return compoundingContributions;
    }

    function endCampaign() external onlyOwner {
        require(state == CampaignState.Active, "Campaign already ended.");
        require(totalContributions == 0, "All funds must be withdrawn.");

        if (compoundingContributions >= goal) {
            state = CampaignState.Completed;
        } else {
            state = CampaignState.Failed;
        }
    }
}