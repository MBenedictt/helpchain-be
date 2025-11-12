// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Crowdfunding with DAO-style withdraw requests and confirmations by backers
/// @notice Owner requests a withdraw amount -> backers vote (yes/no). Non-voters count as yes.
/// If the approving backers' total contribution is enough, take the requested amount proportionally
/// from approving backers' contributions and transfer to owner. Otherwise mark campaign Failed and
/// backers can call refund() to retrieve their contributions.
contract Crowdfunding {
    // Basic campaign info
    string public campaign;
    string public description;
    uint256 public goal;
    address public owner;
    uint256 public compoundingContributions;

    enum CampaignState { Active, Completed, Failed }
    CampaignState public state;

    // Backer bookkeeping
    struct Backer {
        uint256 totalContribution; // remaining balance
        uint256 usedContribution;  // total deducted across withdrawals
    }

    mapping(address => Backer) public backers;

    // Keep a list of backer addresses so contract can iterate
    address[] public backersList;
    mapping(address => bool) public isBacker;

    // Total contributions in contract (sum of backers' totalContribution)
    uint256 public totalContributions;

    // Withdraw request with per-address vote mapping (0 = not voted, 1 = yes, 2 = no)
    struct WithdrawRequest {
        uint256 id;
        uint256 amount;
        uint256 yesWeight; // sum of weights (wei) from explicit yes votes
        uint256 noWeight;  // sum of weights (wei) from explicit no votes
        uint256 createdAt;
        uint256 votingDeadline; // deadline timestamp
        bool finalized;
        bool proofSubmitted;
        mapping(address => uint8) votes; // 0 = not voted, 1 = yes, 2 = no
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

    // --- Funding functions ---

    /// @notice Fund the campaign. If the sender is a new backer, add to backersList.
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

    // --- Withdraw request & voting flow ---

    /// @notice Owner creates a withdraw request (request becomes available for voting).
    /// @param _amount Amount in wei owner requests to withdraw.
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

    /// @notice Backer confirms (votes) on a withdraw request.
    /// Non-backers cannot vote. Each backer can vote once per request.
    /// @param _id request id
    /// @param approve true = yes, false = no
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

    /// @notice Finalize a withdraw request after votes. Only owner can call.
    /// If approving capacity (yes + implicit yes from nonvoters) covers requested amount,
    /// deduct contribution proportionally from approving backers and transfer exact amount to owner.
    /// Otherwise mark campaign Failed (backers can claim refunds).
    /// @param _id request id
    function finalizeWithdrawRequest(uint256 _id) external onlyOwner {
        require(_id > 0 && _id <= withdrawRequestCount, "Invalid request id.");
        WithdrawRequest storage req = withdrawRequests[_id];
        require(!req.finalized, "Already finalized.");
        require(state == CampaignState.Active, "Campaign not active.");
        require(block.timestamp >= req.votingDeadline, "Voting period not ended.");

        req.finalized = true;

        uint256 explicitYes = req.yesWeight;
        uint256 explicitNo = req.noWeight;

        // compute implicitYes safely (avoid underflow) and cap totalYesWeight to current totalContributions
        uint256 sumExplicit = explicitYes + explicitNo;
        uint256 implicitYes = 0;
        if (sumExplicit < totalContributions) {
            implicitYes = totalContributions - sumExplicit;
        } else {
            implicitYes = 0;
        }

        uint256 totalYesWeight = explicitYes + implicitYes;

        // Cap totalYesWeight to the actual available pool (defensive)
        if (totalYesWeight > totalContributions) {
            totalYesWeight = totalContributions;
        }

        // If approving capacity is enough to cover requested amount
        if (totalYesWeight >= req.amount) {
            uint256 distributed = 0;
            uint256 largestApproverIndex = type(uint256).max;
            uint256 largestApproverContribution = 0;

            // First pass: find largest approving backer (by contribution) for remainder handling
            for (uint i = 0; i < backersList.length; i++) {
                address baddr = backersList[i];
                uint8 v = req.votes[baddr];
                if (v == 1 || v == 0) { // approving
                    uint256 contrib = backers[baddr].totalContribution;
                    if (contrib > largestApproverContribution) {
                        largestApproverContribution = contrib;
                        largestApproverIndex = i;
                    }
                }
            }

            // Second pass: compute shares, deduct from backers' totalContribution
            for (uint i = 0; i < backersList.length; i++) {
                address baddr = backersList[i];
                uint8 v = req.votes[baddr];

                if (v == 1 || v == 0) {
                    uint256 contrib = backers[baddr].totalContribution;
                    if (contrib == 0) continue;

                    // share = contrib * req.amount / totalYesWeight
                    uint256 share = (contrib * req.amount) / totalYesWeight;

                    backers[baddr].totalContribution -= share;
                    backers[baddr].usedContribution += share;
                    distributed += share;
                }
            }

            // handle remainder due to integer division
            if (distributed < req.amount) {
                uint256 remainder = req.amount - distributed;
                if (largestApproverIndex != type(uint256).max) {
                    address largestAddr = backersList[largestApproverIndex];
                    require(
                        backers[largestAddr].totalContribution >= remainder,
                        "Largest approver has insufficient contribution for remainder"
                    );
                    backers[largestAddr].totalContribution -= remainder;
                    backers[largestAddr].usedContribution += remainder;
                    distributed += remainder;
                } else {
                    revert("No approver available for remainder distribution");
                }
            }

            // Update global counter
            require(distributed == req.amount, "Distributed mismatch.");
            totalContributions -= req.amount;

            // Transfer requested amount to owner (use call to avoid transfer() pitfalls)
            (bool sent, ) = owner.call{value: req.amount}("");
            require(sent, "Transfer failed");

            emit WithdrawFinalized(_id, true, block.timestamp);
        } else {
            // Not enough approve-weight: fail the campaign (backers can claim refund)
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

    /// @notice View helper to get withdraw request's scalar info (cannot return mapping inside).
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

    /// @notice Helper to check how a particular address voted in a specific request.
    /// returns 0 = not voted, 1 = yes, 2 = no
    function getVote(uint256 _id, address _voter) external view returns (uint8) {
        require(_id > 0 && _id <= withdrawRequestCount, "Invalid id.");
        WithdrawRequest storage req = withdrawRequests[_id];
        return req.votes[_voter];
    }

    // --- Refund logic ---

    /// @notice If campaign failed or backer voted NO on any request, backers can claim refunds (their current totalContribution).
    function refund() public {
        bool eligible = false;

        // Case 1: campaign failed
        if (state == CampaignState.Failed) {
            eligible = true;
        } else {
            // Case 2: check if backer ever voted NO
            for (uint i = 1; i <= withdrawRequestCount; i++) {
                WithdrawRequest storage req = withdrawRequests[i];
                if (req.votes[msg.sender] == 2) {
                    eligible = true;
                    break;
                }
            }
        }

        require(eligible, "Refund not allowed.");

        uint256 amount = backers[msg.sender].totalContribution;
        require(amount > 0, "Nothing to refund.");

        // reset contribution + update totals
        backers[msg.sender].totalContribution = 0;
        totalContributions -= amount;

        payable(msg.sender).transfer(amount);

        emit RefundClaimed(msg.sender, amount);
    }

    // --- Utility & admin ---

    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // --- getters for backers list ---

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

    /// @notice Ends the campaign permanently.
    /// Conditions:
    /// - Campaign balance must be zero.
    /// - If at least one withdraw request was finalized, campaign is Completed.
    /// - If no withdraw requests, campaign is Failed.
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