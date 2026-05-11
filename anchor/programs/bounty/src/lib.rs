use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};

declare_id!("5kRPV7z2BUQn5rEXAhAPbBdHGU4KAYKo8FXBwmG3ahiP");

const REVIEW_WINDOW_SECS: i64 = 48 * 60 * 60;
const UNSTAKE_LOCKUP_SECS: i64 = 3 * 24 * 60 * 60;

const ARWEAVE_TX_ID_MIN: usize = 43;
const ARWEAVE_TX_ID_MAX: usize = 44;

#[program]
pub mod translation_bounty {
    use super::*;

    // ─── Staking instructions ──────────────────────────────────────────────

    /// Deposit USDC into the validator's persistent stake vault.
    /// Initialises the stake account and vault on first call (init_if_needed).
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, BountyError::InvalidAmount);

        let acc = &mut ctx.accounts.stake_account;
        if acc.owner == Pubkey::default() {
            acc.owner = ctx.accounts.validator.key();
            acc.bump = ctx.bumps.stake_account;
            acc.vault_bump = ctx.bumps.stake_vault;
        }

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.validator_token_account.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.validator.to_account_info(),
                },
            ),
            amount,
        )?;

        acc.amount = acc.amount.checked_add(amount).ok_or(BountyError::MathOverflow)?;

        msg!("Staked {} USDC. Total: {}", amount, acc.amount);
        Ok(())
    }

    /// Begin the 3-day unstake cooldown for `amount` USDC.
    /// Only one pending unstake request at a time.
    pub fn request_unstake(ctx: Context<RequestUnstake>, amount: u64) -> Result<()> {
        require!(amount > 0, BountyError::InvalidAmount);
        let acc = &mut ctx.accounts.stake_account;
        require!(acc.unlock_at == 0, BountyError::UnstakeAlreadyPending);

        let available = acc
            .amount
            .saturating_sub(acc.locked)
            .saturating_sub(acc.unlock_amount);
        require!(amount <= available, BountyError::InsufficientUnlockedStake);

        acc.unlock_at = Clock::get()?.unix_timestamp + UNSTAKE_LOCKUP_SECS;
        acc.unlock_amount = amount;

        msg!(
            "Unstake requested: {} USDC. Available at: {}",
            amount,
            acc.unlock_at
        );
        Ok(())
    }

    /// Withdraw previously queued USDC after the 3-day lockup has elapsed.
    pub fn complete_unstake(ctx: Context<CompleteUnstake>) -> Result<()> {
        let acc = &ctx.accounts.stake_account;
        require!(acc.unlock_at > 0, BountyError::NoUnstakePending);
        require!(
            Clock::get()?.unix_timestamp >= acc.unlock_at,
            BountyError::UnstakeLockupActive
        );

        let amount = acc.unlock_amount;
        let owner_key = acc.owner;
        let bump = acc.bump;

        let seeds: &[&[u8]] = &[b"validator_stake", owner_key.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.validator_token_account.to_account_info(),
                    authority: ctx.accounts.stake_account.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        let acc = &mut ctx.accounts.stake_account;
        acc.amount = acc.amount.checked_sub(amount).ok_or(BountyError::MathOverflow)?;
        acc.unlock_at = 0;
        acc.unlock_amount = 0;

        msg!("Unstake complete: {} USDC returned", amount);
        Ok(())
    }

    // ─── Bounty lifecycle ──────────────────────────────────────────────────

    pub fn initialize_bounty(
        ctx: Context<InitializeBounty>,
        nonce: u64,
        original_tx_id: String,
        reward_amount: u64,
        target_language: String,
    ) -> Result<()> {
        require!(
            original_tx_id.len() >= ARWEAVE_TX_ID_MIN && original_tx_id.len() <= ARWEAVE_TX_ID_MAX,
            BountyError::InvalidTxId
        );
        require!(reward_amount > 0, BountyError::InvalidAmount);
        require!(
            !target_language.is_empty() && target_language.len() <= 32,
            BountyError::InvalidLanguage
        );

        let bounty = &mut ctx.accounts.bounty_account;
        bounty.author = ctx.accounts.author.key();
        bounty.translator = None;
        bounty.admin = ctx.accounts.admin.key();
        bounty.reward_amount = reward_amount;
        bounty.original_tx_id = original_tx_id;
        bounty.target_language = target_language;
        bounty.translated_tx_id = None;
        bounty.submission_timestamp = 0;
        bounty.status = BountyStatus::Open;
        bounty.nonce = nonce;
        bounty.bump = ctx.bumps.bounty_account;
        bounty.vault_bump = ctx.bumps.vault;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.author_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.author.to_account_info(),
                },
            ),
            reward_amount,
        )?;

        msg!(
            "Bounty initialized. Author: {}, Reward: {}, Lang: {}, Arweave: {}",
            ctx.accounts.author.key(),
            reward_amount,
            ctx.accounts.bounty_account.target_language,
            ctx.accounts.bounty_account.original_tx_id,
        );

        Ok(())
    }

    pub fn claim_bounty(ctx: Context<ClaimBounty>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::Open,
            BountyError::InvalidStatus
        );

        bounty.translator = Some(ctx.accounts.translator.key());
        bounty.status = BountyStatus::Claimed;

        msg!("Bounty claimed by: {}", ctx.accounts.translator.key());
        Ok(())
    }

    /// AI node submits finished translation. Initialises ValidationRecord and sets
    /// status to AwaitingValidation — two validators must attest before payout.
    pub fn submit_translation(
        ctx: Context<SubmitTranslation>,
        translated_tx_id: String,
    ) -> Result<()> {
        require!(
            translated_tx_id.len() >= ARWEAVE_TX_ID_MIN && translated_tx_id.len() <= ARWEAVE_TX_ID_MAX,
            BountyError::InvalidTxId
        );

        let bounty = &mut ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::Claimed,
            BountyError::InvalidStatus
        );
        require!(
            bounty.translator == Some(ctx.accounts.translator.key()),
            BountyError::Unauthorized
        );

        bounty.translated_tx_id = Some(translated_tx_id.clone());
        bounty.submission_timestamp = Clock::get()?.unix_timestamp;
        bounty.status = BountyStatus::AwaitingValidation;

        let record = &mut ctx.accounts.validation_record;
        record.bounty = ctx.accounts.bounty_account.key();
        record.bump = ctx.bumps.validation_record;

        msg!(
            "Translation submitted. Arweave: {}. Awaiting validation.",
            translated_tx_id,
        );

        Ok(())
    }

    /// First-come first-served validator registration.
    /// Requires sufficient unlocked stake in the validator's persistent stake vault.
    /// No USDC is moved — stake is locked in place via the `locked` counter.
    pub fn register_validator(ctx: Context<RegisterValidator>) -> Result<()> {
        let bounty = &ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::AwaitingValidation,
            BountyError::InvalidStatus
        );

        let required_stake = bounty
            .reward_amount
            .checked_mul(3)
            .ok_or(BountyError::MathOverflow)?
            .checked_div(2)
            .ok_or(BountyError::MathOverflow)?;

        let stake_acc = &ctx.accounts.validator_stake_account;
        require!(
            stake_acc.owner == ctx.accounts.validator.key(),
            BountyError::Unauthorized
        );

        let available = stake_acc
            .amount
            .saturating_sub(stake_acc.locked)
            .saturating_sub(stake_acc.unlock_amount);
        require!(available >= required_stake, BountyError::InsufficientStakeBalance);

        let validator_key = ctx.accounts.validator.key();
        require!(
            bounty.translator != Some(validator_key),
            BountyError::TranslatorCannotValidate
        );

        let record = &mut ctx.accounts.validation_record;
        if record.validator_1.is_none() {
            record.validator_1 = Some(validator_key);
            record.validator_1_stake = required_stake;
            msg!("Validator 1 registered: {} (stake locked: {})", validator_key, required_stake);
        } else if record.validator_2.is_none() {
            require!(
                record.validator_1 != Some(validator_key),
                BountyError::ValidatorSlotsFull
            );
            record.validator_2 = Some(validator_key);
            record.validator_2_stake = required_stake;
            msg!("Validator 2 registered: {} (stake locked: {})", validator_key, required_stake);
        } else {
            return err!(BountyError::ValidatorSlotsFull);
        }

        // Lock the stake — no USDC transfer; accounting only
        let stake_acc = &mut ctx.accounts.validator_stake_account;
        stake_acc.locked = stake_acc
            .locked
            .checked_add(required_stake)
            .ok_or(BountyError::MathOverflow)?;

        Ok(())
    }

    /// Validator submits their Sign Protocol attestation hash and vote.
    /// On the second vote:
    ///   - both approve → unlock stake, pay 40/40/20 from bounty vault
    ///   - both reject  → unlock stake, pay 2/2/96 from bounty vault, status = Rejected
    ///   - split        → status = Disputed (AI oracle resolves via resolve_dispute)
    pub fn submit_validator_attestation(
        ctx: Context<SubmitValidatorAttestation>,
        attestation_id_hash: [u8; 32],
        approve: bool,
    ) -> Result<()> {
        require!(
            ctx.accounts.bounty_account.status == BountyStatus::AwaitingValidation,
            BountyError::InvalidStatus
        );

        let validator_key = ctx.accounts.validator.key();

        let (is_validator_1, existing_other_vote) = {
            let record = &ctx.accounts.validation_record;
            let is_v1 = record.validator_1 == Some(validator_key);
            let is_v2 = record.validator_2 == Some(validator_key);
            require!(is_v1 || is_v2, BountyError::NotAValidator);
            if is_v1 {
                require!(record.attestation_id_1.is_none(), BountyError::AlreadyAttested);
                (true, record.vote_2)
            } else {
                require!(record.attestation_id_2.is_none(), BountyError::AlreadyAttested);
                (false, record.vote_1)
            }
        };

        // Snapshot bounty fields before mutable borrows
        let nonce_bytes = ctx.accounts.bounty_account.nonce.to_le_bytes();
        let author_key = ctx.accounts.bounty_account.author;
        let bump = ctx.accounts.bounty_account.bump;
        let reward_amount = ctx.accounts.bounty_account.reward_amount;

        // Snapshot stake amounts from record and verify stake account ownership
        let (v1_stake, v2_stake) = {
            let r = &ctx.accounts.validation_record;
            require!(
                r.validator_1.map_or(false, |v| v == ctx.accounts.validator_1_stake_account.owner),
                BountyError::InvalidValidatorAccount
            );
            // validator_2 may not have registered yet on the first attestation — skip check
            require!(
                r.validator_2.map_or(true, |v| v == ctx.accounts.validator_2_stake_account.owner),
                BountyError::InvalidValidatorAccount
            );
            (r.validator_1_stake, r.validator_2_stake)
        };

        // Record this validator's attestation
        {
            let record = &mut ctx.accounts.validation_record;
            if is_validator_1 {
                record.attestation_id_1 = Some(attestation_id_hash);
                record.vote_1 = Some(approve);
            } else {
                record.attestation_id_2 = Some(attestation_id_hash);
                record.vote_2 = Some(approve);
            }
        }

        if let Some(other_vote) = existing_other_vote {
            let bounty_seeds: &[&[u8]] = &[b"bounty", author_key.as_ref(), &nonce_bytes, &[bump]];
            let signer: &[&[&[u8]]] = &[bounty_seeds];

            let both_approve = approve && other_vote;
            let both_reject = !approve && !other_vote;

            if both_approve {
                // Verify validator ATAs match registered validators
                let record = &ctx.accounts.validation_record;
                require!(
                    record.validator_1 == Some(ctx.accounts.validator_1_token_account.owner),
                    BountyError::InvalidValidatorAccount
                );
                require!(
                    record.validator_2 == Some(ctx.accounts.validator_2_token_account.owner),
                    BountyError::InvalidValidatorAccount
                );

                // Unlock stake (no USDC movement — locked counter only)
                ctx.accounts.validator_1_stake_account.locked = ctx
                    .accounts
                    .validator_1_stake_account
                    .locked
                    .saturating_sub(v1_stake);
                ctx.accounts.validator_2_stake_account.locked = ctx
                    .accounts
                    .validator_2_stake_account
                    .locked
                    .saturating_sub(v2_stake);

                // Drain bounty vault: 40% v1 / 40% v2 / 20% protocol (AI node fee included)
                let v_share = reward_amount * 40 / 100;
                let protocol_share = reward_amount.saturating_sub(v_share * 2);

                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        SplTransfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.validator_1_token_account.to_account_info(),
                            authority: ctx.accounts.bounty_account.to_account_info(),
                        },
                        signer,
                    ),
                    v_share,
                )?;
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        SplTransfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.validator_2_token_account.to_account_info(),
                            authority: ctx.accounts.bounty_account.to_account_info(),
                        },
                        signer,
                    ),
                    v_share,
                )?;
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        SplTransfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.protocol_token_account.to_account_info(),
                            authority: ctx.accounts.bounty_account.to_account_info(),
                        },
                        signer,
                    ),
                    protocol_share,
                )?;

                ctx.accounts.bounty_account.status = BountyStatus::Paid;
                msg!(
                    "Consensus: both approved. v1: {}, v2: {}, protocol: {}",
                    v_share, v_share, protocol_share
                );

            } else if both_reject {
                // Verify validator ATAs
                let record = &ctx.accounts.validation_record;
                require!(
                    record.validator_1 == Some(ctx.accounts.validator_1_token_account.owner),
                    BountyError::InvalidValidatorAccount
                );
                require!(
                    record.validator_2 == Some(ctx.accounts.validator_2_token_account.owner),
                    BountyError::InvalidValidatorAccount
                );

                // Unlock stake
                ctx.accounts.validator_1_stake_account.locked = ctx
                    .accounts
                    .validator_1_stake_account
                    .locked
                    .saturating_sub(v1_stake);
                ctx.accounts.validator_2_stake_account.locked = ctx
                    .accounts
                    .validator_2_stake_account
                    .locked
                    .saturating_sub(v2_stake);

                // Drain bounty vault: 2% / 2% / 96%
                let v_fee = reward_amount * 2 / 100;
                let author_refund = reward_amount.saturating_sub(v_fee * 2);

                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        SplTransfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.validator_1_token_account.to_account_info(),
                            authority: ctx.accounts.bounty_account.to_account_info(),
                        },
                        signer,
                    ),
                    v_fee,
                )?;
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        SplTransfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.validator_2_token_account.to_account_info(),
                            authority: ctx.accounts.bounty_account.to_account_info(),
                        },
                        signer,
                    ),
                    v_fee,
                )?;
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        SplTransfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.author_token_account.to_account_info(),
                            authority: ctx.accounts.bounty_account.to_account_info(),
                        },
                        signer,
                    ),
                    author_refund,
                )?;

                ctx.accounts.bounty_account.status = BountyStatus::Rejected;
                msg!(
                    "Consensus: both rejected. Fee each: {}, author refund: {}",
                    v_fee, author_refund
                );

            } else {
                // Split vote — await AI oracle via resolve_dispute
                ctx.accounts.bounty_account.status = BountyStatus::Disputed;
                msg!("Split vote. Status: Disputed. AI oracle will resolve.");
            }
        } else {
            msg!("First attestation recorded. Awaiting second validator.");
        }

        Ok(())
    }

    /// Called by the backend AI oracle keypair to resolve a split-vote dispute.
    /// `approve = true` means the approving validator was correct; `false` means the rejecter.
    /// Slashes the incorrect validator's stake vault and drains the bounty vault 100%.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        approve: bool,
    ) -> Result<()> {
        let bounty = &ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::Disputed,
            BountyError::InvalidStatus
        );
        require!(
            bounty.admin == ctx.accounts.admin.key(),
            BountyError::Unauthorized
        );

        let nonce_bytes = bounty.nonce.to_le_bytes();
        let author_key = bounty.author;
        let bump = bounty.bump;
        let reward_amount = bounty.reward_amount;

        let bounty_seeds: &[&[u8]] = &[b"bounty", author_key.as_ref(), nonce_bytes.as_ref(), &[bump]];
        let bounty_signer: &[&[&[u8]]] = &[bounty_seeds];

        // Determine which validator was correct based on their recorded votes
        let record = &ctx.accounts.validation_record;
        let v1_voted_approve = record.vote_1 == Some(true);

        // `approve = true` means the approver was right
        let correct_is_v1 = (approve && v1_voted_approve) || (!approve && !v1_voted_approve);

        let (correct_stake, incorrect_stake) = if correct_is_v1 {
            (record.validator_1_stake, record.validator_2_stake)
        } else {
            (record.validator_2_stake, record.validator_1_stake)
        };

        // Verify correct/incorrect validator accounts match the registered validators
        require!(
            ctx.accounts.correct_validator_stake_acc.owner
                == if correct_is_v1 { record.validator_1 } else { record.validator_2 }
                    .ok_or(BountyError::NotAValidator)?,
            BountyError::InvalidValidatorAccount
        );
        require!(
            ctx.accounts.incorrect_validator_stake_acc.owner
                == if correct_is_v1 { record.validator_2 } else { record.validator_1 }
                    .ok_or(BountyError::NotAValidator)?,
            BountyError::InvalidValidatorAccount
        );

        // Unlock correct validator's stake (no USDC movement)
        ctx.accounts.correct_validator_stake_acc.locked = ctx
            .accounts
            .correct_validator_stake_acc
            .locked
            .saturating_sub(correct_stake);

        // Slash incorrect validator: reduce amount + locked, then transfer USDC to correct validator
        {
            let acc = &mut ctx.accounts.incorrect_validator_stake_acc;
            acc.locked = acc.locked.saturating_sub(incorrect_stake);
            acc.amount = acc.amount.saturating_sub(incorrect_stake);
        }

        // Transfer slashed stake from incorrect validator's vault to correct validator's ATA
        let incorrect_owner = ctx.accounts.incorrect_validator_stake_acc.owner;
        let incorrect_bump = ctx.accounts.incorrect_validator_stake_acc.bump;
        let slash_seeds: &[&[u8]] = &[b"validator_stake", incorrect_owner.as_ref(), &[incorrect_bump]];
        let slash_signer: &[&[&[u8]]] = &[slash_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.incorrect_validator_stake_vault.to_account_info(),
                    to: ctx.accounts.correct_validator_stake_token_account.to_account_info(),
                    authority: ctx.accounts.incorrect_validator_stake_acc.to_account_info(),
                },
                slash_signer,
            ),
            incorrect_stake,
        )?;

        // Drain bounty vault 100%
        if approve {
            // Approver correct: correct_v 40%, protocol 20%, author 40%
            let v_share = reward_amount * 40 / 100;
            let protocol_share = reward_amount * 20 / 100;
            let author_refund = reward_amount.saturating_sub(v_share).saturating_sub(protocol_share);

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    SplTransfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.correct_validator_token_account.to_account_info(),
                        authority: ctx.accounts.bounty_account.to_account_info(),
                    },
                    bounty_signer,
                ),
                v_share,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    SplTransfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.protocol_token_account.to_account_info(),
                        authority: ctx.accounts.bounty_account.to_account_info(),
                    },
                    bounty_signer,
                ),
                protocol_share,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    SplTransfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.author_token_account.to_account_info(),
                        authority: ctx.accounts.bounty_account.to_account_info(),
                    },
                    bounty_signer,
                ),
                author_refund,
            )?;

            msg!(
                "Dispute resolved: approve=true. correct_v: {}, protocol: {}, author: {}",
                v_share, protocol_share, author_refund
            );
        } else {
            // Rejecter correct: correct_v 2%, author 96%, protocol 2%
            let v_fee = reward_amount * 2 / 100;
            let author_refund = reward_amount * 96 / 100;
            let protocol_share = reward_amount.saturating_sub(v_fee).saturating_sub(author_refund);

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    SplTransfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.correct_validator_token_account.to_account_info(),
                        authority: ctx.accounts.bounty_account.to_account_info(),
                    },
                    bounty_signer,
                ),
                v_fee,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    SplTransfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.author_token_account.to_account_info(),
                        authority: ctx.accounts.bounty_account.to_account_info(),
                    },
                    bounty_signer,
                ),
                author_refund,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    SplTransfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.protocol_token_account.to_account_info(),
                        authority: ctx.accounts.bounty_account.to_account_info(),
                    },
                    bounty_signer,
                ),
                protocol_share,
            )?;

            msg!(
                "Dispute resolved: approve=false. correct_v: {}, author: {}, protocol: {}",
                v_fee, author_refund, protocol_share
            );
        }

        ctx.accounts.bounty_account.status = BountyStatus::Paid;
        Ok(())
    }

    pub fn dispute_bounty(ctx: Context<DisputeBounty>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::PendingReview,
            BountyError::InvalidStatus
        );
        require!(
            bounty.author == ctx.accounts.author.key(),
            BountyError::Unauthorized
        );

        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time < bounty.submission_timestamp + REVIEW_WINDOW_SECS,
            BountyError::DisputeWindowExpired
        );

        bounty.status = BountyStatus::Disputed;

        msg!(
            "Dispute filed by author: {}. Time remaining: {}s",
            ctx.accounts.author.key(),
            (bounty.submission_timestamp + REVIEW_WINDOW_SECS) - current_time,
        );

        Ok(())
    }

    pub fn cancel_bounty(ctx: Context<CancelBounty>) -> Result<()> {
        let bounty = &ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::Open,
            BountyError::InvalidStatus
        );

        let nonce_bytes = bounty.nonce.to_le_bytes();
        let author_key = bounty.author;
        let bump = bounty.bump;
        let reward_amount = bounty.reward_amount;

        let bounty_seeds: &[&[u8]] = &[b"bounty", author_key.as_ref(), nonce_bytes.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[bounty_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.author_token_account.to_account_info(),
                    authority: ctx.accounts.bounty_account.to_account_info(),
                },
                signer,
            ),
            reward_amount,
        )?;

        msg!("Bounty cancelled by author: {}. Refunded: {}", author_key, reward_amount);
        Ok(())
    }

    /// Legacy crank — still valid for PendingReview bounties created before
    /// the AwaitingValidation upgrade. New bounties skip this path entirely.
    pub fn execute_payout(ctx: Context<ExecutePayout>) -> Result<()> {
        let bounty = &ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::PendingReview,
            BountyError::InvalidStatus
        );

        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time > bounty.submission_timestamp + REVIEW_WINDOW_SECS,
            BountyError::ReviewWindowActive
        );

        let nonce_bytes = bounty.nonce.to_le_bytes();
        let author_key = bounty.author;
        let bump = bounty.bump;
        let reward_amount = bounty.reward_amount;

        let bounty_seeds: &[&[u8]] = &[b"bounty", author_key.as_ref(), nonce_bytes.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[bounty_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.translator_token_account.to_account_info(),
                    authority: ctx.accounts.bounty_account.to_account_info(),
                },
                signer,
            ),
            reward_amount,
        )?;

        let bounty = &mut ctx.accounts.bounty_account;
        bounty.status = BountyStatus::Paid;

        msg!(
            "Payout executed. Translator: {}, Amount: {}",
            ctx.accounts.translator_token_account.owner,
            reward_amount,
        );

        Ok(())
    }
}

// ─────────────────────────────────────────────
// Account State
// ─────────────────────────────────────────────

/// Persistent stake account for a validator. One per wallet, lives until explicitly closed.
/// USDC physically held in the paired ValidatorStakeVault token account.
#[account]
pub struct ValidatorStakeAccount {
    pub owner: Pubkey,
    pub amount: u64,        // total USDC deposited
    pub locked: u64,        // currently committed to active bounties
    pub unlock_at: i64,     // 0 = no pending unstake; >0 = unlock timestamp
    pub unlock_amount: u64, // USDC queued for unstaking
    pub bump: u8,
    pub vault_bump: u8,
}

impl ValidatorStakeAccount {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 1 + 1; // 74 bytes
}

#[account]
pub struct BountyAccount {
    pub author: Pubkey,
    pub translator: Option<Pubkey>,
    pub admin: Pubkey,
    pub reward_amount: u64,
    pub original_tx_id: String,
    pub target_language: String,
    pub translated_tx_id: Option<String>,
    pub submission_timestamp: i64,
    pub status: BountyStatus,
    pub nonce: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl BountyAccount {
    pub const LEN: usize = 8
        + 32
        + (1 + 32)
        + 32
        + 8
        + (4 + 64)
        + (4 + 32)
        + (1 + 4 + 64)
        + 8
        + 1
        + 8
        + 1
        + 1;
}

/// Validator consensus state — separate PDA to avoid resizing BountyAccount.
/// Seeds: ["validation", bounty_account_pubkey]
#[account]
pub struct ValidationRecord {
    pub bounty: Pubkey,
    pub validator_1: Option<Pubkey>,
    pub validator_2: Option<Pubkey>,
    pub attestation_id_1: Option<[u8; 32]>,
    pub attestation_id_2: Option<[u8; 32]>,
    pub vote_1: Option<bool>,
    pub vote_2: Option<bool>,
    pub bump: u8,
    pub validator_1_stake: u64, // amount locked from v1's global stake at registration
    pub validator_2_stake: u64, // amount locked from v2's global stake at registration
}

impl ValidationRecord {
    pub const LEN: usize = 8
        + 32          // bounty
        + (1 + 32)    // validator_1
        + (1 + 32)    // validator_2
        + (1 + 32)    // attestation_id_1
        + (1 + 32)    // attestation_id_2
        + (1 + 1)     // vote_1
        + (1 + 1)     // vote_2
        + 1           // bump
        + 8           // validator_1_stake
        + 8;          // validator_2_stake
    // Total: 193 bytes
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BountyStatus {
    Open,
    Claimed,
    PendingReview,        // legacy — kept for in-flight bounties from before validator upgrade
    AwaitingValidation,   // default after submit_translation
    Disputed,             // split vote; AI oracle pending
    Paid,
    Rejected,             // both validators rejected; author refunded
}

// ─────────────────────────────────────────────
// Instruction Contexts
// ─────────────────────────────────────────────

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        init_if_needed,
        payer = validator,
        space = ValidatorStakeAccount::LEN,
        seeds = [b"validator_stake", validator.key().as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, ValidatorStakeAccount>,

    #[account(
        init_if_needed,
        payer = validator,
        token::mint = stake_mint,
        token::authority = stake_account,
        seeds = [b"validator_stake_vault", validator.key().as_ref()],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = stake_mint,
        token::authority = validator,
    )]
    pub validator_token_account: Account<'info, TokenAccount>,

    pub stake_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestUnstake<'info> {
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"validator_stake", validator.key().as_ref()],
        bump = stake_account.bump,
        constraint = stake_account.owner == validator.key() @ BountyError::Unauthorized,
    )]
    pub stake_account: Account<'info, ValidatorStakeAccount>,
}

#[derive(Accounts)]
pub struct CompleteUnstake<'info> {
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"validator_stake", validator.key().as_ref()],
        bump = stake_account.bump,
        constraint = stake_account.owner == validator.key() @ BountyError::Unauthorized,
    )]
    pub stake_account: Account<'info, ValidatorStakeAccount>,

    #[account(
        mut,
        seeds = [b"validator_stake_vault", validator.key().as_ref()],
        bump = stake_account.vault_bump,
        token::mint = stake_mint,
        token::authority = stake_account,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = stake_mint,
        token::authority = validator,
    )]
    pub validator_token_account: Account<'info, TokenAccount>,

    pub stake_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(nonce: u64, original_tx_id: String, reward_amount: u64)]
pub struct InitializeBounty<'info> {
    #[account(mut)]
    pub author: Signer<'info>,

    #[account(
        init,
        payer = author,
        space = BountyAccount::LEN,
        seeds = [b"bounty", author.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub bounty_account: Account<'info, BountyAccount>,

    #[account(
        init,
        payer = author,
        token::mint = usdc_mint,
        token::authority = bounty_account,
        seeds = [b"bounty_vault", bounty_account.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = author,
    )]
    pub author_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    /// CHECK: Stored in bounty_account.admin; validated on resolve_dispute
    pub admin: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimBounty<'info> {
    #[account(mut)]
    pub translator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
    )]
    pub bounty_account: Account<'info, BountyAccount>,
}

#[derive(Accounts)]
pub struct SubmitTranslation<'info> {
    #[account(mut)]
    pub translator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
    )]
    pub bounty_account: Account<'info, BountyAccount>,

    #[account(
        init,
        payer = translator,
        space = ValidationRecord::LEN,
        seeds = [b"validation", bounty_account.key().as_ref()],
        bump,
    )]
    pub validation_record: Account<'info, ValidationRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterValidator<'info> {
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
    )]
    pub bounty_account: Account<'info, BountyAccount>,

    #[account(
        mut,
        seeds = [b"validation", bounty_account.key().as_ref()],
        bump = validation_record.bump,
    )]
    pub validation_record: Account<'info, ValidationRecord>,

    #[account(
        mut,
        seeds = [b"validator_stake", validator.key().as_ref()],
        bump = validator_stake_account.bump,
        constraint = validator_stake_account.owner == validator.key() @ BountyError::Unauthorized,
    )]
    pub validator_stake_account: Account<'info, ValidatorStakeAccount>,
}

#[derive(Accounts)]
pub struct SubmitValidatorAttestation<'info> {
    #[account(mut)]
    pub validator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
    )]
    pub bounty_account: Box<Account<'info, BountyAccount>>,

    #[account(
        mut,
        seeds = [b"validation", bounty_account.key().as_ref()],
        bump = validation_record.bump,
    )]
    pub validation_record: Box<Account<'info, ValidationRecord>>,

    #[account(
        mut,
        seeds = [b"bounty_vault", bounty_account.key().as_ref()],
        bump = bounty_account.vault_bump,
        token::mint = usdc_mint,
        token::authority = bounty_account,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Validator 1 USDC ATA — ownership verified in instruction body at payout time
    #[account(mut, token::mint = usdc_mint)]
    pub validator_1_token_account: Box<Account<'info, TokenAccount>>,

    /// Validator 2 USDC ATA — ownership verified in instruction body at payout time
    #[account(mut, token::mint = usdc_mint)]
    pub validator_2_token_account: Box<Account<'info, TokenAccount>>,

    /// Author USDC ATA — for both-reject refund
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = bounty_account.author,
    )]
    pub author_token_account: Box<Account<'info, TokenAccount>>,

    /// Protocol fee recipient — 20%
    #[account(mut, token::mint = usdc_mint)]
    pub protocol_token_account: Box<Account<'info, TokenAccount>>,

    /// Validator 1 stake account — verified against validation_record.validator_1 in instruction
    #[account(mut)]
    pub validator_1_stake_account: Box<Account<'info, ValidatorStakeAccount>>,

    /// Validator 2 stake account — verified against validation_record.validator_2 in instruction
    #[account(mut)]
    pub validator_2_stake_account: Box<Account<'info, ValidatorStakeAccount>>,

    pub usdc_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DisputeBounty<'info> {
    #[account(mut)]
    pub author: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
        constraint = bounty_account.author == author.key() @ BountyError::Unauthorized,
    )]
    pub bounty_account: Account<'info, BountyAccount>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
        constraint = bounty_account.admin == admin.key() @ BountyError::Unauthorized,
    )]
    pub bounty_account: Account<'info, BountyAccount>,

    #[account(
        mut,
        seeds = [b"validation", bounty_account.key().as_ref()],
        bump = validation_record.bump,
    )]
    pub validation_record: Account<'info, ValidationRecord>,

    #[account(
        mut,
        seeds = [b"bounty_vault", bounty_account.key().as_ref()],
        bump = bounty_account.vault_bump,
        token::mint = usdc_mint,
        token::authority = bounty_account,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// The stake account of the validator who voted correctly
    #[account(mut)]
    pub correct_validator_stake_acc: Account<'info, ValidatorStakeAccount>,

    /// The stake account of the validator who voted incorrectly (to be slashed)
    #[account(mut)]
    pub incorrect_validator_stake_acc: Account<'info, ValidatorStakeAccount>,

    /// The stake vault of the incorrect validator (USDC/kUSDC transferred from here)
    #[account(
        mut,
        token::mint = stake_mint,
        token::authority = incorrect_validator_stake_acc,
    )]
    pub incorrect_validator_stake_vault: Account<'info, TokenAccount>,

    /// The ATA of the correct validator (receives bounty share in USDC)
    #[account(mut, token::mint = usdc_mint)]
    pub correct_validator_token_account: Account<'info, TokenAccount>,

    /// The ATA of the correct validator for stake tokens (receives slashed stake in kUSDC)
    #[account(mut, token::mint = stake_mint)]
    pub correct_validator_stake_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = bounty_account.author,
    )]
    pub author_token_account: Account<'info, TokenAccount>,

    #[account(mut, token::mint = usdc_mint)]
    pub protocol_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub stake_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelBounty<'info> {
    #[account(mut)]
    pub author: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
        constraint = bounty_account.author == author.key() @ BountyError::Unauthorized,
        close = author,
    )]
    pub bounty_account: Account<'info, BountyAccount>,

    #[account(
        mut,
        seeds = [b"bounty_vault", bounty_account.key().as_ref()],
        bump = bounty_account.vault_bump,
        token::mint = usdc_mint,
        token::authority = bounty_account,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = usdc_mint, token::authority = author)]
    pub author_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecutePayout<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bounty", bounty_account.author.as_ref(), &bounty_account.nonce.to_le_bytes()],
        bump = bounty_account.bump,
    )]
    pub bounty_account: Account<'info, BountyAccount>,

    #[account(
        mut,
        seeds = [b"bounty_vault", bounty_account.key().as_ref()],
        bump = bounty_account.vault_bump,
        token::mint = usdc_mint,
        token::authority = bounty_account,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        constraint = bounty_account.translator == Some(translator_token_account.owner) @ BountyError::InvalidTranslatorAccount,
    )]
    pub translator_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────

#[error_code]
pub enum BountyError {
    #[msg("Invalid bounty status for this operation")]
    InvalidStatus,
    #[msg("Caller is not authorized for this action")]
    Unauthorized,
    #[msg("TX ID must be 43–44 base64url characters")]
    InvalidTxId,
    #[msg("Reward amount must be greater than zero")]
    InvalidAmount,
    #[msg("The 48-hour dispute window has already expired")]
    DisputeWindowExpired,
    #[msg("The 48-hour review window is still active — too early to execute payout")]
    ReviewWindowActive,
    #[msg("Translator token account does not match the claimed translator")]
    InvalidTranslatorAccount,
    #[msg("Target language must be 1–32 characters")]
    InvalidLanguage,
    #[msg("Both validator slots are already filled")]
    ValidatorSlotsFull,
    #[msg("Caller is not a registered validator for this bounty")]
    NotAValidator,
    #[msg("Validator has already submitted their attestation")]
    AlreadyAttested,
    #[msg("The translator cannot validate their own submission")]
    TranslatorCannotValidate,
    #[msg("Validator token account does not match a registered validator")]
    InvalidValidatorAccount,
    #[msg("Insufficient unlocked stake balance to register as validator")]
    InsufficientStakeBalance,
    #[msg("Unstake amount exceeds available (unlocked, non-queued) balance")]
    InsufficientUnlockedStake,
    #[msg("An unstake request is already pending — complete or wait for it first")]
    UnstakeAlreadyPending,
    #[msg("No unstake request is pending")]
    NoUnstakePending,
    #[msg("The 3-day unstake lockup has not yet elapsed")]
    UnstakeLockupActive,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
