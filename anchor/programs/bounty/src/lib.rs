use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};

declare_id!("EZs9aybYZxSdSL8t1fCD2iXcpYHidsYQa44KttCRZFAs");

/// 48-hour dispute window in seconds
const REVIEW_WINDOW_SECS: i64 = 48 * 60 * 60;

/// Arweave TX IDs are 43 base64url chars; Irys devnet IDs are 44 chars
const ARWEAVE_TX_ID_MIN: usize = 43;
const ARWEAVE_TX_ID_MAX: usize = 44;

#[program]
pub mod translation_bounty {
    use super::*;

    /// Author creates an escrow vault and deposits USDC reward.
    /// `nonce` makes each bounty PDA unique per author.
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

    /// Translator locks in the job. First come, first served.
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

    /// Translator submits finished work and starts the 48-hour clock.
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
        bounty.status = BountyStatus::PendingReview;

        msg!(
            "Translation submitted. Arweave: {}. Clock starts at: {}",
            translated_tx_id,
            bounty.submission_timestamp,
        );

        Ok(())
    }

    /// Author raises a dispute within the 48-hour window. Freezes funds until admin resolves.
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

    /// Admin (whitelisted resolver) settles a dispute.
    /// `pay_translator = true`  → release funds to translator (work was good).
    /// `pay_translator = false` → refund funds to author (work was bad).
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

        // We can't mutably borrow after the immutable borrow above, so update status last
        let bounty = &mut ctx.accounts.bounty_account;
        bounty.status = BountyStatus::Paid;

        msg!(
            "Dispute resolved. pay_translator={}. Amount: {}",
            pay_translator,
            reward_amount,
        );

        Ok(())
    }

    /// Author cancels an open bounty and reclaims their USDC. Only callable while Open.
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

    /// Permissionless "crank" — anyone can call this once the 48-hour window has expired.
    /// Requires: status == PendingReview AND current_time > submission_timestamp + 48h.
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
    /// Article author who funded the bounty
    pub author: Pubkey,
    /// Translator who claimed the job (None until claimed)
    pub translator: Option<Pubkey>,
    /// Whitelisted dispute resolver
    pub admin: Pubkey,
    /// USDC reward in base units (6 decimals)
    pub reward_amount: u64,
    /// Arweave TX ID for the original article (43 bytes)
    pub original_tx_id: String,
    /// BCP-47 language code or label (e.g. "ES", "Japanese") — max 32 chars
    pub target_language: String,
    /// Arweave TX ID for the submitted translation (set on submit_translation)
    pub translated_tx_id: Option<String>,
    /// Unix timestamp when submit_translation was called — starts the 48h clock
    pub submission_timestamp: i64,
    pub status: BountyStatus,
    /// Used as part of the PDA seed so one author can have many bounties
    pub nonce: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl BountyAccount {
    /// 8 discriminator + sum of all field sizes + padding
    pub const LEN: usize = 8
        + 32            // author
        + (1 + 32)      // translator: Option<Pubkey>
        + 32            // admin
        + 8             // reward_amount
        + (4 + 64)      // original_tx_id: String (max 64 chars)
        + (4 + 32)      // target_language: String (max 32 chars)
        + (1 + 4 + 64)  // translated_tx_id: Option<String>
        + 8             // submission_timestamp
        + 1             // status
        + 8             // nonce
        + 1             // bump
        + 1;            // vault_bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BountyStatus {
    Open,
    Claimed,
    PendingReview,
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

    /// PDA-owned SPL token account that holds the escrowed USDC
    #[account(
        init,
        payer = author,
        token::mint = usdc_mint,
        token::authority = bounty_account,
        seeds = [b"bounty_vault", bounty_account.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Author's USDC token account — funds are pulled from here
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = author,
    )]
    pub author_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    /// Whitelisted dispute resolver — stored as-is, no on-chain check at init
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

    /// Receives funds if pay_translator = true
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub translator_token_account: Account<'info, TokenAccount>,

    /// Receives funds if pay_translator = false
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

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = author,
    )]
    pub author_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecutePayout<'info> {
    /// Anyone can crank — no signer constraint beyond paying tx fees
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

    /// Translator's USDC token account — validated against bounty_account.translator
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
}
