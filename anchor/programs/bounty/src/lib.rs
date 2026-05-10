use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};

declare_id!("5kRPV7z2BUQn5rEXAhAPbBdHGU4KAYKo8FXBwmG3ahiP");

const REVIEW_WINDOW_SECS: i64 = 48 * 60 * 60;

const ARWEAVE_TX_ID_MIN: usize = 43;
const ARWEAVE_TX_ID_MAX: usize = 44;

#[program]
pub mod translation_bounty {
    use super::*;

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

    /// Translator submits finished work. Initialises ValidationRecord and sets
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
    /// Translators cannot validate their own submission.
    pub fn register_validator(ctx: Context<RegisterValidator>) -> Result<()> {
        let bounty = &ctx.accounts.bounty_account;
        require!(
            bounty.status == BountyStatus::AwaitingValidation,
            BountyError::InvalidStatus
        );

        let validator_key = ctx.accounts.validator.key();
        require!(
            bounty.translator != Some(validator_key),
            BountyError::TranslatorCannotValidate
        );

        let record = &mut ctx.accounts.validation_record;
        if record.validator_1.is_none() {
            record.validator_1 = Some(validator_key);
            msg!("Validator 1 registered: {}", validator_key);
        } else if record.validator_2.is_none() {
            require!(
                record.validator_1 != Some(validator_key),
                BountyError::ValidatorSlotsFull
            );
            record.validator_2 = Some(validator_key);
            msg!("Validator 2 registered: {}", validator_key);
        } else {
            return err!(BountyError::ValidatorSlotsFull);
        }

        Ok(())
    }

    /// Validator submits their Sign Protocol attestation hash and vote.
    /// On the second vote: approves → auto-pay; reject → Disputed.
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

        // Determine which slot this validator occupies and read the other vote
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

        // Snapshot bounty state before any mutable borrows
        let nonce_bytes = ctx.accounts.bounty_account.nonce.to_le_bytes();
        let author_key = ctx.accounts.bounty_account.author;
        let bump = ctx.accounts.bounty_account.bump;
        let reward_amount = ctx.accounts.bounty_account.reward_amount;

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

        // If both have now voted, settle
        if let Some(other_vote) = existing_other_vote {
            let consensus = approve && other_vote;

            if consensus {
                ctx.accounts.bounty_account.status = BountyStatus::Paid;
                msg!("Consensus: approved. Status set to Paid.");
            } else {
                ctx.accounts.bounty_account.status = BountyStatus::Disputed;
                msg!("Consensus: rejected. Status set to Disputed.");
            }
        } else {
            msg!("First attestation recorded. Awaiting second validator.");
        }

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

    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        pay_translator: bool,
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

        let bounty_seeds: &[&[u8]] = &[
            b"bounty",
            author_key.as_ref(),
            nonce_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds: &[&[&[u8]]] = &[bounty_seeds];

        let destination = if pay_translator {
            ctx.accounts.translator_token_account.to_account_info()
        } else {
            ctx.accounts.author_token_account.to_account_info()
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: destination,
                    authority: ctx.accounts.bounty_account.to_account_info(),
                },
                signer_seeds,
            ),
            reward_amount,
        )?;

        let bounty = &mut ctx.accounts.bounty_account;
        bounty.status = BountyStatus::Paid;

        msg!(
            "Dispute resolved. pay_translator={}. Amount: {}",
            pay_translator,
            reward_amount,
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

        let bounty_seeds: &[&[u8]] = &[
            b"bounty",
            author_key.as_ref(),
            nonce_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds: &[&[&[u8]]] = &[bounty_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.author_token_account.to_account_info(),
                    authority: ctx.accounts.bounty_account.to_account_info(),
                },
                signer_seeds,
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

        let bounty_seeds: &[&[u8]] = &[
            b"bounty",
            author_key.as_ref(),
            nonce_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds: &[&[&[u8]]] = &[bounty_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.translator_token_account.to_account_info(),
                    authority: ctx.accounts.bounty_account.to_account_info(),
                },
                signer_seeds,
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

/// Validator consensus state — stored in a separate PDA to avoid resizing BountyAccount.
/// Seeds: ["validation", bounty_account_pubkey]
#[account]
pub struct ValidationRecord {
    pub bounty: Pubkey,
    pub validator_1: Option<Pubkey>,
    pub validator_2: Option<Pubkey>,
    /// SHA-256 of the Sign Protocol attestation ID string for validator 1
    pub attestation_id_1: Option<[u8; 32]>,
    /// SHA-256 of the Sign Protocol attestation ID string for validator 2
    pub attestation_id_2: Option<[u8; 32]>,
    pub vote_1: Option<bool>,
    pub vote_2: Option<bool>,
    pub bump: u8,
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
        + 1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BountyStatus {
    Open,
    Claimed,
    PendingReview,        // legacy — kept for in-flight bounties created before this upgrade
    AwaitingValidation,   // new default after submit_translation
    Disputed,
    Paid,
}

// ─────────────────────────────────────────────
// Instruction Contexts
// ─────────────────────────────────────────────

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

    /// Initialised here; holds validator slots and attestation hashes
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
    pub bounty_account: Account<'info, BountyAccount>,

    #[account(
        mut,
        seeds = [b"validation", bounty_account.key().as_ref()],
        bump = validation_record.bump,
    )]
    pub validation_record: Account<'info, ValidationRecord>,

    /// Required for potential consensus payout on second vote
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
        seeds = [b"bounty_vault", bounty_account.key().as_ref()],
        bump = bounty_account.vault_bump,
        token::mint = usdc_mint,
        token::authority = bounty_account,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = usdc_mint)]
    pub translator_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = bounty_account.author,
    )]
    pub author_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
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
}
