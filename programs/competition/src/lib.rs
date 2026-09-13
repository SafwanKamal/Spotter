#![allow(unexpected_cfgs)]
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction, system_program,
    sysvar::Sysvar,
};
entrypoint!(process_instruction);
// version(1), organizer(32), competition digest(32), end(8), funded(8),
// finalized(1), claimed bitmap(1), winners(96), results digest(32).
pub const SIZE: usize = 211;
fn invalid() -> ProgramError {
    ProgramError::InvalidArgument
}
fn read_u64(data: &[u8]) -> u64 {
    u64::from_le_bytes(data.try_into().unwrap())
}
pub fn process_instruction(
    program: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let it = &mut accounts.iter();
    let actor = next_account_info(it)?;
    let pool = next_account_info(it)?;
    if !actor.is_signer || !pool.is_writable {
        return Err(ProgramError::MissingRequiredSignature);
    }
    match data.first() {
        Some(0) => {
            if data.len() != 49 {
                return Err(invalid());
            }
            let system = next_account_info(it)?;
            if system.key != &system_program::id() || !actor.is_writable {
                return Err(invalid());
            }
            let digest = &data[1..33];
            let end = read_u64(&data[33..41]);
            let amount = read_u64(&data[41..49]);
            if amount == 0 || amount > 1_000_000_000 || end <= Clock::get()?.unix_timestamp as u64 {
                return Err(invalid());
            }
            let (expected, bump) = Pubkey::find_program_address(
                &[b"competition", actor.key.as_ref(), digest],
                program,
            );
            if expected != *pool.key || !pool.data_is_empty() {
                return Err(ProgramError::AccountAlreadyInitialized);
            }
            // Allocate tolerates unsolicited lamports sent to the PDA before creation.
            let rent = Rent::get()?.minimum_balance(SIZE);
            let total = rent.checked_add(amount).ok_or(invalid())?;
            let topup = total.saturating_sub(pool.lamports());
            if topup > 0 {
                solana_program::program::invoke(
                    &system_instruction::transfer(actor.key, pool.key, topup),
                    &[actor.clone(), pool.clone(), system.clone()],
                )?;
            }
            let seeds: &[&[u8]] = &[b"competition", actor.key.as_ref(), digest, &[bump]];
            invoke_signed(
                &system_instruction::allocate(pool.key, SIZE as u64),
                &[pool.clone(), system.clone()],
                &[seeds],
            )?;
            invoke_signed(
                &system_instruction::assign(pool.key, program),
                &[pool.clone(), system.clone()],
                &[seeds],
            )?;
            let mut state = pool.try_borrow_mut_data()?;
            state.fill(0);
            state[0] = 1;
            state[1..33].copy_from_slice(actor.key.as_ref());
            state[33..65].copy_from_slice(digest);
            state[65..73].copy_from_slice(&end.to_le_bytes());
            state[73..81].copy_from_slice(&amount.to_le_bytes());
        }
        Some(1) => {
            if data.len() != 129 || pool.owner != program {
                return Err(invalid());
            }
            let mut state = pool.try_borrow_mut_data()?;
            if state.len() != SIZE
                || state[0] != 1
                || state[1..33] != actor.key.to_bytes()
                || state[81] != 0
            {
                return Err(invalid());
            }
            if (Clock::get()?.unix_timestamp as u64) < read_u64(&state[65..73]) {
                return Err(ProgramError::Custom(1));
            }
            let winners = [&data[1..33], &data[33..65], &data[65..97]];
            for (i, winner) in winners.iter().enumerate() {
                if *winner == [0; 32]
                    || *winner == pool.key.as_ref()
                    || winners[..i].contains(winner)
                {
                    return Err(invalid());
                }
            }
            state[83..179].copy_from_slice(&data[1..97]);
            state[179..211].copy_from_slice(&data[97..129]);
            state[81] = 1;
        }
        Some(2) => {
            if data.len() != 2 || data[1] > 2 || pool.owner != program || !actor.is_writable {
                return Err(invalid());
            }
            let rank = data[1] as usize;
            let mut state = pool.try_borrow_mut_data()?;
            if state.len() != SIZE
                || state[0] != 1
                || state[81] != 1
                || state[82] & (1 << rank) != 0
            {
                return Err(ProgramError::Custom(2));
            }
            if state[83 + rank * 32..115 + rank * 32] != actor.key.to_bytes() {
                return Err(ProgramError::MissingRequiredSignature);
            }
            let amount = read_u64(&state[73..81]);
            let first = amount * 50 / 100;
            let second = amount * 30 / 100;
            let award = [first, second, amount - first - second][rank];
            let left = pool
                .lamports()
                .checked_sub(award)
                .ok_or(ProgramError::InsufficientFunds)?;
            if left < Rent::get()?.minimum_balance(SIZE) {
                return Err(ProgramError::InsufficientFunds);
            }
            let received = actor.lamports().checked_add(award).ok_or(invalid())?;
            **pool.try_borrow_mut_lamports()? = left;
            **actor.try_borrow_mut_lamports()? = received;
            state[82] |= 1 << rank;
        }
        _ => return Err(ProgramError::InvalidInstructionData),
    }
    Ok(())
}
